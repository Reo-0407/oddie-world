import { describe, expect, it } from 'vitest';
import { MOVES, SPECIES, speciesById } from '../data/index.ts';
import { createRng } from '../engine/rng.ts';
import { createBattlePokemon } from '../game/factory.ts';
import { handleOnlineRequest, type Deps, type RecordArgs, type Stores, type VersionedRoom } from './edgeHandler.ts';
import type { RoomView, ServerMessage, TeamSpec } from './protocol.ts';
import { eloDeltas, finishedMatch } from './ranking.ts';
import { currentFails, isBlocked, LIMIT_WINDOW_MS, MAX_FAILS, recordFail } from './rateLimit.ts';
import { createRoom, joinRoom, PRESENCE_MS, TURN_MS, viewFor, type Room } from './room.ts';
import type { LimitState } from './rateLimit.ts';

const SECRET_A = 'a'.repeat(32);
const SECRET_B = 'b'.repeat(32);

function teamOf(ids: number[], level = 20): TeamSpec {
  return ids.map((id) => ({
    speciesId: id,
    level,
    moveIds: createBattlePokemon(speciesById(id), level, MOVES).moves.map((m) => m.id),
  }));
}

/** 메모리 가짜 저장소 */
function makeWorld(seed = 1) {
  const rooms = new Map<string, VersionedRoom>();
  const channels = new Map<string, string>();
  const limits = new Map<string, LimitState>();
  const ratings = new Map<string, number>();
  const matches = new Map<string, RecordArgs>();
  const counters = { saves: 0, conflicts: 0, records: 0, failNextSaves: 0 };
  const stores: Stores = {
    rooms: {
      load: async (code) => {
        const found = rooms.get(code);
        return found ? { room: structuredClone(found.room), version: found.version } : null;
      },
      insert: async (room) => {
        if (rooms.has(room.code)) return false;
        rooms.set(room.code, { room: structuredClone(room), version: 1 });
        return true;
      },
      save: async (code, room, expected) => {
        const found = rooms.get(code);
        if (counters.failNextSaves > 0) {
          counters.failNextSaves -= 1;
          counters.conflicts += 1;
          return null;
        }
        if (!found || found.version !== expected) return null;
        counters.saves += 1;
        rooms.set(code, { room: structuredClone(room), version: expected + 1 });
        return expected + 1;
      },
      cleanup: async () => {},
    },
    channels: {
      set: async (userId, secret) => { channels.set(userId, secret); },
      getMany: async (ids) => Object.fromEntries(ids.filter((id) => channels.has(id)).map((id) => [id, channels.get(id) as string])),
    },
    limits: {
      get: async (userId) => limits.get(userId) ?? null,
      set: async (userId, state) => { limits.set(userId, state); },
    },
    ranking: {
      ratings: async (ids) => Object.fromEntries(ids.filter((id) => ratings.has(id)).map((id) => [id, ratings.get(id) as number])),
      record: async (args) => {
        if (matches.has(args.match.roomCode)) return false;
        matches.set(args.match.roomCode, args);
        counters.records += 1;
        ratings.set(args.match.aId, (ratings.get(args.match.aId) ?? 1000) + args.deltaA);
        ratings.set(args.match.bId, (ratings.get(args.match.bId) ?? 1000) + args.deltaB);
        return true;
      },
    },
  };
  const clock = { now: 1_000_000 };
  const rng = createRng(seed);
  const deps: Deps = { species: SPECIES, moves: MOVES, stores, rng: rng.next, now: () => clock.now };
  const call = (user: string, secret: string, message: unknown) => handleOnlineRequest(deps, user, secret, message);
  return { deps, rooms, channels, limits, ratings, matches, counters, clock, call };
}

const stateOf = (result: { replies: { message: ServerMessage }[] }): RoomView | null => {
  const reply = result.replies.find((r) => r.message.t === 'state');
  return reply && reply.message.t === 'state' ? reply.message.view : null;
};

async function startBattle(world: ReturnType<typeof makeWorld>) {
  const created = await world.call('user-a', SECRET_A, { t: 'create', playerId: 'ignored', name: 'A' });
  const code = stateOf(created)?.code ?? '';
  await world.call('user-b', SECRET_B, { t: 'join', code, name: 'B' });
  await world.call('user-a', SECRET_A, { t: 'team', code, team: teamOf([1, 2, 3]) });
  const last = await world.call('user-b', SECRET_B, { t: 'team', code, team: teamOf([42, 43, 45]) });
  return { code, last };
}

describe('Edge 요청 처리', () => {
  it('방을 만들면 로그인한 사용자 id가 자리에 들어가고, 보낸 playerId는 무시된다', async () => {
    const world = makeWorld();
    const result = await world.call('user-a', SECRET_A, { t: 'create', playerId: 'evil', name: 'A' });
    const view = stateOf(result);
    expect(view?.code).toHaveLength(6);
    expect(view?.seat).toBe(0);
    const stored = world.rooms.get(view?.code ?? '')?.room;
    expect(stored?.seats[0]?.playerId).toBe('user-a');
    expect(result.replies[0].rev).toBe(1);
  });

  it('참가하면 방 주인에게 개인 채널로 상태가 밀려 간다 (상대 비밀값은 서버만 안다)', async () => {
    const world = makeWorld();
    const code = stateOf(await world.call('user-a', SECRET_A, { t: 'create', name: 'A' }))?.code ?? '';
    const joined = await world.call('user-b', SECRET_B, { t: 'join', code: code.toLowerCase(), name: 'B' });
    expect(stateOf(joined)?.phase).toBe('teams');
    expect(stateOf(joined)?.seat).toBe(1);
    expect(joined.pushes).toHaveLength(1);
    expect(joined.pushes[0].secret).toBe(SECRET_A);
    const pushed = joined.pushes[0].reply.message;
    expect(pushed.t === 'state' && pushed.view.seat).toBe(0);
    expect(JSON.stringify(joined.replies)).not.toContain(SECRET_A);
  });

  it('잘못된 비밀값, 모르는 메시지는 거절', async () => {
    const world = makeWorld();
    expect((await world.call('u', 'short', { t: 'create', name: 'A' })).replies[0].message).toMatchObject({ t: 'error', reason: 'bad-message' });
    expect((await world.call('u', SECRET_A, { t: 'explode' })).replies[0].message).toMatchObject({ reason: 'bad-message' });
    expect((await world.call('u', SECRET_A, null)).replies[0].message).toMatchObject({ reason: 'bad-message' });
  });

  it('두 사람이 끝까지 대전하면 전적이 정확히 한 번만 기록된다', async () => {
    const world = makeWorld();
    const { code } = await startBattle(world);
    const left = await world.call('user-a', SECRET_A, { t: 'leave', code });
    expect(stateOf(left)).toMatchObject({ phase: 'finished', winner: 1, endReason: 'forfeit' });
    expect(world.counters.records).toBe(1);
    // 같은 끝난 방에 요청이 또 와도 다시 기록하지 않는다
    await world.call('user-b', SECRET_B, { t: 'hello', code });
    await world.call('user-a', SECRET_A, { t: 'hello', code });
    expect(world.counters.records).toBe(1);
    expect(world.ratings.get('user-b')).toBe(1016);
    expect(world.ratings.get('user-a')).toBe(984);
    expect(world.rooms.get(code)?.room.recorded).toBe(true);
  });

  it('전적 기록이 이미 있으면(다른 요청이 먼저 기록) 점수를 두 번 올리지 않는다', async () => {
    const world = makeWorld();
    const { code } = await startBattle(world);
    const room = world.rooms.get(code)?.room as Room;
    await world.call('user-a', SECRET_A, { t: 'leave', code });
    const again = await world.deps.stores.ranking.record({
      match: { ...(finishedMatch(world.rooms.get(code)?.room as Room) as NonNullable<ReturnType<typeof finishedMatch>>) },
      deltaA: 5, deltaB: 5,
    });
    expect(again).toBe(false);
    expect(room.code).toBe(code);
    expect(world.ratings.get('user-b')).toBe(1016);
  });

  it('저장이 충돌하면 다시 읽어서 처리한다', async () => {
    const world = makeWorld();
    const code = stateOf(await world.call('user-a', SECRET_A, { t: 'create', name: 'A' }))?.code ?? '';
    world.counters.failNextSaves = 2;
    const joined = await world.call('user-b', SECRET_B, { t: 'join', code, name: 'B' });
    expect(stateOf(joined)?.phase).toBe('teams');
    expect(world.counters.conflicts).toBe(2);
  });

  it('끝없이 충돌하면 포기하고 오류를 돌려준다', async () => {
    const world = makeWorld();
    const code = stateOf(await world.call('user-a', SECRET_A, { t: 'create', name: 'A' }))?.code ?? '';
    world.counters.failNextSaves = 99;
    const result = await world.call('user-b', SECRET_B, { t: 'join', code, name: 'B' });
    expect(result.replies[0].message).toMatchObject({ t: 'error', reason: 'bad-message', detail: 'busy' });
  });

  it('방 코드 추측: 실패가 MAX_FAILS번 쌓이면 막히고, 창이 지나면 풀린다', async () => {
    const world = makeWorld();
    const code = stateOf(await world.call('user-a', SECRET_A, { t: 'create', name: 'A' }))?.code ?? '';
    for (let i = 0; i < MAX_FAILS; i += 1) {
      const r = await world.call('guesser', SECRET_B, { t: 'join', code: 'ZZZZZ' + i, name: 'G' });
      expect(r.replies[0].message).toMatchObject({ reason: 'no-room' });
    }
    const blocked = await world.call('guesser', SECRET_B, { t: 'join', code, name: 'G' });
    expect(blocked.replies[0].message).toMatchObject({ t: 'error', reason: 'rate-limited' });
    // 다른 사용자는 영향 없음
    expect(stateOf(await world.call('friend', 'c'.repeat(32), { t: 'join', code, name: 'F' }))?.phase).toBe('teams');
    world.clock.now += LIMIT_WINDOW_MS + 1;
    const free = await world.call('guesser', SECRET_B, { t: 'hello', code });
    expect(free.replies[0].message).toMatchObject({ reason: 'not-seated' });
  });

  it('올바르지 않은 모양의 코드도 실패로 센다', async () => {
    const world = makeWorld();
    const r = await world.call('g', SECRET_A, { t: 'join', code: '!!', name: 'G' });
    expect(r.replies[0].message).toMatchObject({ reason: 'no-room' });
    expect(world.limits.get('g')?.fails).toBe(1);
  });

  it('요청이 올 때마다 제한시간을 먼저 처리한다 (60초 넘긴 쪽 자동 pass)', async () => {
    const world = makeWorld();
    const { code } = await startBattle(world);
    await world.call('user-a', SECRET_A, { t: 'action', code, turn: 1, action: { kind: 'move', moveIndex: 0 } });
    world.clock.now += 30_000;
    await world.call('user-b', SECRET_B, { t: 'hello', code }); // 상대는 살아 있다는 신호를 보낸다
    world.clock.now += TURN_MS - 30_000 + 1;
    const result = await world.call('user-a', SECRET_A, { t: 'hello', code });
    expect(stateOf(result)?.turn).toBe(2);
    expect(result.pushes.some((p) => p.secret === SECRET_B)).toBe(true);
  });

  it('신호가 끊긴 사람은 연결 끊김으로 보이고, 제한시간이 지나면 기권패', async () => {
    const world = makeWorld();
    const { code } = await startBattle(world);
    world.clock.now += PRESENCE_MS + 1;
    const ping = await world.call('user-a', SECRET_A, { t: 'hello', code });
    expect(stateOf(ping)?.connected).toEqual([true, false]);
    world.clock.now += TURN_MS;
    const late = await world.call('user-a', SECRET_A, { t: 'hello', code });
    expect(stateOf(late)).toMatchObject({ phase: 'finished', winner: 0, endReason: 'disconnect' });
    expect(world.counters.records).toBe(1);
  });

  it('없는 방, 자리에 없는 사람은 오류', async () => {
    const world = makeWorld();
    expect((await world.call('u', SECRET_A, { t: 'hello', code: 'AAAAAA' })).replies[0].message).toMatchObject({ reason: 'no-room' });
    const code = stateOf(await world.call('user-a', SECRET_A, { t: 'create', name: 'A' }))?.code ?? '';
    expect((await world.call('stranger', SECRET_B, { t: 'action', code, turn: 1, action: { kind: 'move', moveIndex: 0 } })).replies[0].message)
      .toMatchObject({ reason: 'not-seated' });
  });
});

describe('전적 계산', () => {
  it('끝난 판만, 전투가 시작된 경우만 기록한다', () => {
    const waiting = createRoom('ABC234', 'a', 'A', 1);
    expect(finishedMatch(waiting)).toBeNull();
    const teams = joinRoom(waiting, 'b', 'B', 0);
    expect(teams.ok && finishedMatch(teams.room)).toBeFalsy();
  });
  it('점수 변화량: 같은 점수끼리 +16/-16, 비기면 0, 모르는 사람은 1000으로', () => {
    expect(eloDeltas(1000, 1000, 1)).toEqual([16, -16]);
    expect(eloDeltas(undefined, undefined, 0)).toEqual([-16, 16]);
    expect(eloDeltas(1200, 1200, 0.5)).toEqual([0, 0]);
    const [up, down] = eloDeltas(900, 1100, 1);
    expect(up).toBeGreaterThan(16);
    expect(down).toBeLessThan(-16);
  });
});

describe('속도 제한 계산', () => {
  it('창 안에서 실패를 세고 창이 지나면 처음부터', () => {
    let state: LimitState | null = null;
    expect(isBlocked(state, 0)).toBe(false);
    for (let i = 0; i < MAX_FAILS; i += 1) state = recordFail(state, 1000 + i);
    expect(currentFails(state, 2000)).toBe(MAX_FAILS);
    expect(isBlocked(state, 2000)).toBe(true);
    expect(isBlocked(state, 1000 + LIMIT_WINDOW_MS)).toBe(false);
    expect(recordFail(state, 1000 + LIMIT_WINDOW_MS + 5)).toEqual({ windowStart: 1000 + LIMIT_WINDOW_MS + 5, fails: 1 });
  });
});

describe('상대 체력 숫자 숨기기', () => {
  it('지난 턴 사건에서 상대 쪽 체력, 피해량은 퍼센트이고 내 쪽은 실제 숫자', async () => {
    const world = makeWorld();
    const { code } = await startBattle(world);
    await world.call('user-a', SECRET_A, { t: 'action', code, turn: 1, action: { kind: 'move', moveIndex: 0 } });
    const result = await world.call('user-b', SECRET_B, { t: 'action', code, turn: 1, action: { kind: 'move', moveIndex: 0 } });
    const view = stateOf(result) as RoomView;
    const room = world.rooms.get(code)?.room as Room;
    const raw = room.lastEvents.filter((e) => e.t === 'damage');
    expect(raw.length).toBeGreaterThan(0);
    const mine = view.seat;
    for (const event of view.lastEvents) {
      if (event.t !== 'damage') continue;
      const original = raw.find((e) => e.t === 'damage' && e.side === event.side);
      if (!original || original.t !== 'damage') continue;
      if (event.side === mine) expect(event.hp).toBe(original.hp);
      else {
        expect(event.hp).toBeLessThanOrEqual(100);
        expect(event.amount).toBeLessThanOrEqual(100);
      }
    }
    const foeView = viewFor(room, 0);
    expect(JSON.stringify(foeView)).not.toContain('rngState');
  });
});
