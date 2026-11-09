import type { ClientMessage, ErrorReason, ServerMessage } from './protocol.ts';
import { eloDeltas, finishedMatch, type FinishedMatch } from './ranking.ts';
import { isBlocked, recordFail, type LimitState } from './rateLimit.ts';
import { normalizeCode, touchSeat, type GameData, type Room } from './room.ts';
import { GameServer, type Outbound } from './server.ts';

/*
 * 인터넷 서버(Edge Function) 한 번의 요청을 처리하는 순수한 어댑터.
 * 표(DB)와 시계, 난수는 전부 밖에서 넣어 주므로 메모리 가짜 저장소로 그대로 테스트할 수 있다.
 * Supabase에 닿는 부분은 supabase/functions/online/stores.ts에만 있다.
 */

export interface VersionedRoom {
  room: Room;
  version: number;
}

export interface RecordArgs {
  match: FinishedMatch;
  deltaA: number;
  deltaB: number;
}

export interface Stores {
  rooms: {
    load(code: string): Promise<VersionedRoom | null>;
    /** 새 방을 넣는다. 같은 코드가 이미 있으면 false */
    insert(room: Room): Promise<boolean>;
    /** expectedVersion이 그대로일 때만 저장하고 새 버전을 돌려준다. 그 사이 바뀌었으면 null */
    save(code: string, room: Room, expectedVersion: number): Promise<number | null>;
    /** 오래된 방 정리 (가끔 부른다) */
    cleanup(): Promise<void>;
  };
  channels: {
    set(userId: string, secret: string): Promise<void>;
    getMany(userIds: string[]): Promise<Record<string, string>>;
  };
  limits: {
    get(userId: string): Promise<LimitState | null>;
    set(userId: string, state: LimitState): Promise<void>;
  };
  ranking: {
    ratings(userIds: string[]): Promise<Record<string, number>>;
    /** 한 판을 정확히 한 번만 기록한다. 이미 기록돼 있으면 false */
    record(args: RecordArgs): Promise<boolean>;
  };
}

export interface Deps extends GameData {
  stores: Stores;
  rng: () => number;
  now: () => number;
}

/** rev: 방 버전. 클라이언트는 더 오래된 상태가 늦게 도착해도 무시한다 */
export interface Reply {
  message: ServerMessage;
  rev: number;
}

export interface Push {
  secret: string;
  reply: Reply;
}

export interface HandlerResult {
  /** 요청한 사람에게 돌려줄 것 */
  replies: Reply[];
  /** 상대에게 개인 채널로 밀어 줄 것 */
  pushes: Push[];
}

const SECRET_PATTERN = /^[0-9a-f]{32}$/;
const CODE_PATTERN = /^[A-Z0-9]{6}$/;
const MESSAGE_TYPES = new Set(['create', 'join', 'team', 'action', 'hello', 'leave']);
/** 방 코드를 맞히려는 시도로 볼 수 있는 메시지 */
const PROBING = new Set(['join', 'hello']);
const RETRIES = 5;

const fail = (reason: ErrorReason, detail?: string): HandlerResult => ({
  replies: [{ message: { t: 'error', reason, detail }, rev: 0 }],
  pushes: [],
});

export async function handleOnlineRequest(deps: Deps, userId: string, secret: unknown, raw: unknown): Promise<HandlerResult> {
  if (typeof secret !== 'string' || !SECRET_PATTERN.test(secret)) return fail('bad-message', 'secret');
  if (typeof raw !== 'object' || raw === null || !MESSAGE_TYPES.has((raw as { t?: string }).t ?? '')) {
    return fail('bad-message');
  }
  // 클라이언트가 보낸 playerId는 믿지 않고 로그인한 사용자 id로 덮어쓴다
  const message = { ...(raw as ClientMessage), playerId: userId } as ClientMessage;
  const { stores } = deps;
  await stores.channels.set(userId, secret);

  if (PROBING.has(message.t)) {
    const state = await stores.limits.get(userId);
    if (isBlocked(state, deps.now())) return fail('rate-limited');
  }

  const makeServer = () => new GameServer({
    species: deps.species, moves: deps.moves, rng: deps.rng, now: deps.now, trackPresence: true,
  });

  if (message.t === 'create') {
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      const server = makeServer();
      const outs = server.handle(message);
      const room = [...server.rooms.values()][0];
      if (!room) return fail('bad-message');
      if (await stores.rooms.insert(room)) {
        if (deps.rng() < 0.05) await stores.rooms.cleanup();
        return deliver(deps, userId, outs, 1);
      }
    }
    return fail('bad-message', 'code-collision');
  }

  const code = normalizeCode(String((message as { code?: string }).code ?? ''));
  if (!CODE_PATTERN.test(code)) {
    await noteFailure(deps, userId, message);
    return fail('no-room');
  }

  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const loaded = await stores.rooms.load(code);
    const server = makeServer();
    // 요청한 사람은 살아 있다는 뜻이므로, 시간초과를 처리하기 전에 먼저 본 시각을 갱신한다
    if (loaded) server.rooms.set(code, touchSeat(loaded.room, userId, deps.now()));
    const outs: Outbound[] = [];
    if (loaded) outs.push(...server.tick()); // 요청이 올 때마다 먼저 제한시간을 처리한다
    outs.push(...server.handle({ ...message, code }));
    const next = server.rooms.get(code);

    if (!loaded || !next) {
      await noteFailure(deps, userId, message);
      return deliver(deps, userId, outs, 0);
    }
    let version = loaded.version;
    if (next !== loaded.room || next.seats.some((seat) => seat?.lastSeen !== undefined)) {
      const saved = await stores.rooms.save(code, next, loaded.version);
      if (saved === null) continue; // 그 사이 다른 요청이 방을 바꿨다: 다시 읽어서 처리
      version = saved;
      await recordIfFinished(deps, code, next, version);
    }
    return deliver(deps, userId, outs, version);
  }
  return fail('bad-message', 'busy');
}

async function noteFailure(deps: Deps, userId: string, message: ClientMessage) {
  if (!PROBING.has(message.t)) return;
  const state = await deps.stores.limits.get(userId);
  await deps.stores.limits.set(userId, recordFail(state, deps.now()));
}

/** 방이 끝났으면 전적과 점수를 한 번만 기록한다 (matches.room_code가 유니크라 두 번 호출돼도 한 번만 반영) */
async function recordIfFinished(deps: Deps, code: string, room: Room, version: number) {
  if (room.recorded) return;
  const match = finishedMatch(room);
  if (!match) return;
  const ratings = await deps.stores.ranking.ratings([match.aId, match.bId]);
  const [deltaA, deltaB] = eloDeltas(ratings[match.aId], ratings[match.bId], match.scoreA);
  await deps.stores.ranking.record({ match, deltaA, deltaB });
  await deps.stores.rooms.save(code, { ...room, recorded: true }, version); // 충돌하면 무시(기록은 이미 안전)
}

/** 보낼 사람별로 마지막 상태 하나만 남기고, 요청한 사람 몫과 상대 몫으로 가른다 */
async function deliver(deps: Deps, userId: string, outs: Outbound[], rev: number): Promise<HandlerResult> {
  const latest = new Map<string, ServerMessage[]>();
  for (const { to, message } of outs) {
    const list = latest.get(to) ?? [];
    if (message.t === 'state') {
      const at = list.findIndex((m) => m.t === 'state');
      if (at >= 0) list.splice(at, 1);
    }
    list.push(message);
    latest.set(to, list);
  }
  const replies = (latest.get(userId) ?? []).map((message) => ({ message, rev }));
  const others = [...latest.keys()].filter((id) => id !== userId);
  const pushes: Push[] = [];
  if (others.length > 0) {
    const secrets = await deps.stores.channels.getMany(others);
    for (const id of others) {
      const secret = secrets[id];
      if (!secret) continue;
      for (const message of latest.get(id) ?? []) pushes.push({ secret, reply: { message, rev } });
    }
  }
  return { replies, pushes };
}
