import type { ClientMessage, ServerMessage } from './protocol.ts';
import {
  createRoom, generateRoomCode, joinRoom, leaveRoom, normalizeCode, seatOf, setConnected, submitAction,
  submitTeam, tick, touchSeat, viewFor, type GameData, type Result, type Room,
} from './room.ts';

export interface Outbound {
  /** 받을 사람의 playerId */
  to: string;
  message: ServerMessage;
}

export interface ServerOptions extends GameData {
  /** 0 이상 1 미만 난수 */
  rng: () => number;
  /** 지금 시각(ms) */
  now: () => number;
  /** 모르는 방 코드에 오류를 답할지 (여러 호스트가 같은 채널을 쓰면 false) */
  replyUnknownRoom?: boolean;
  /** 요청이 올 때마다 그 사람의 마지막 본 시각을 기록한다(인터넷 서버용, 끊김 감지에 쓴다) */
  trackPresence?: boolean;
}

/**
 * 메모리에서 방들을 돌리는 서버. 메시지를 받으면 "누구에게 무엇을 보낼지" 목록을 돌려줄 뿐
 * 네트워크를 모른다. 그대로 Deno Edge Function에 올릴 수 있다.
 */
export class GameServer {
  readonly rooms = new Map<string, Room>();

  constructor(private options: ServerOptions) {}

  handle(message: ClientMessage): Outbound[] {
    if (typeof message !== 'object' || message === null || typeof message.playerId !== 'string') {
      return [];
    }
    const { playerId } = message;
    const error = (reason: Extract<ServerMessage, { t: 'error' }>['reason'], detail?: string): Outbound[] => [
      { to: playerId, message: { t: 'error', reason, detail } },
    ];

    if (message.t === 'create') {
      const name = String(message.name ?? '').slice(0, 12) || '이름없음';
      let code = generateRoomCode(this.options.rng);
      for (let i = 0; i < 20 && this.rooms.has(code); i += 1) code = generateRoomCode(this.options.rng);
      const seed = Math.floor(this.options.rng() * 4294967296);
      const room = createRoom(code, playerId, name, seed);
      this.rooms.set(code, room);
      return this.broadcast(room);
    }

    const code = normalizeCode(String((message as { code?: string }).code ?? ''));
    const stored = this.rooms.get(code);
    if (!stored) return this.options.replyUnknownRoom === false ? [] : error('no-room');
    const now = this.options.now();

    const room = this.options.trackPresence ? touchSeat(stored, playerId, now) : stored;
    let result: Result;
    switch (message.t) {
      case 'join': result = joinRoom(room, playerId, String(message.name ?? '').slice(0, 12) || '이름없음', now); break;
      case 'team': result = submitTeam(room, playerId, message.team, this.options, now); break;
      case 'action': result = submitAction(room, playerId, message.turn, message.action, now); break;
      case 'hello': result = setConnected(room, playerId, true); break;
      case 'leave': result = leaveRoom(room, playerId); break;
      default: return error('bad-message');
    }
    if (!result.ok) {
      if (room !== stored) this.rooms.set(code, room);
      return error(result.error, result.detail);
    }
    this.rooms.set(code, result.room);
    return this.broadcast(result.room);
  }

  /** 연결이 끊겼다고 알려 준다. 제한시간이 지나면 기권패가 된다 */
  disconnect(playerId: string): Outbound[] {
    const out: Outbound[] = [];
    for (const [code, room] of this.rooms) {
      if (seatOf(room, playerId) === null) continue;
      const result = setConnected(room, playerId, false);
      if (result.ok) {
        this.rooms.set(code, result.room);
        out.push(...this.broadcast(result.room));
      }
    }
    return out;
  }

  /** 주기적으로(1초마다 등) 부른다: 제한시간 처리 */
  tick(): Outbound[] {
    const out: Outbound[] = [];
    const now = this.options.now();
    for (const [code, room] of this.rooms) {
      const next = tick(room, now);
      if (next !== room) {
        this.rooms.set(code, next);
        out.push(...this.broadcast(next));
      }
    }
    return out;
  }

  private broadcast(room: Room): Outbound[] {
    const out: Outbound[] = [];
    for (const seat of [0, 1] as const) {
      const occupant = room.seats[seat];
      if (occupant) out.push({ to: occupant.playerId, message: { t: 'state', view: viewFor(room, seat) } });
    }
    return out;
  }
}
