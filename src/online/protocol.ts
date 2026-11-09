import type { Action, BattleEvent, Status, TypeName } from '../engine/types.ts';

/** 순수 타입만 있다. 서버(Deno)와 브라우저가 같이 쓴다 */

export interface TeamMemberSpec {
  speciesId: number;
  level: number;
  moveIds: number[];
}

/** 대전에 내는 팀: 3마리 */
export type TeamSpec = TeamMemberSpec[];

export type Seat = 0 | 1;

// ---------- 클라이언트 → 서버 ----------

export type ClientMessage =
  | { t: 'create'; playerId: string; name: string }
  | { t: 'join'; playerId: string; name: string; code: string }
  | { t: 'team'; playerId: string; code: string; team: TeamSpec }
  /** turn: 클라이언트가 본 현재 턴 번호. 어긋나면 오래된 행동으로 보고 무시한다 */
  | { t: 'action'; playerId: string; code: string; turn: number; action: Action }
  /** 재접속과 생존 신호(10초마다): 현재 상태를 다시 받고, 서버는 만료된 제한시간을 이때 처리한다 */
  | { t: 'hello'; playerId: string; code: string }
  | { t: 'leave'; playerId: string; code: string };

// ---------- 서버 → 클라이언트 ----------

export type ErrorReason =
  | 'no-room' | 'full' | 'started' | 'bad-phase' | 'not-seated' | 'invalid-team'
  | 'not-your-turn' | 'already-submitted' | 'illegal-action' | 'stale-turn' | 'bad-message' | 'rate-limited';

export type ServerMessage =
  | { t: 'state'; view: RoomView }
  | { t: 'error'; reason: ErrorReason; detail?: string };

export type Phase = 'waiting' | 'teams' | 'battle' | 'finished';
export type EndReason = 'ko' | 'timeout' | 'forfeit' | 'disconnect';

/** 상대에게 보여 줘도 되는 오디 정보 */
export interface PublicMon {
  speciesId: number;
  name: string;
  level: number;
  types: TypeName[];
  hpPct: number;
  status: Status | null;
  fainted: boolean;
}

export interface OwnMon extends PublicMon {
  hp: number;
  maxHp: number;
  moves: { id: number; name: string; type: TypeName; category: string; power: number }[];
}

/** 한 자리(seat)에서 본 방 상태. 상대의 행동, 기술, 능력치, 난수 상태는 들어 있지 않다 */
export interface RoomView {
  code: string;
  phase: Phase;
  seat: Seat;
  names: [string | null, string | null];
  connected: [boolean, boolean];
  teamsReady: [boolean, boolean];
  turn: number;
  /** 지금 행동을 기다리는 제한 시각(ms, 서버 시계). 없으면 null */
  deadline: number | null;
  you: { team: OwnMon[]; active: number; needsAction: boolean; submitted: boolean; mustSwitch: boolean };
  /** 아직 나온 적 없는 상대 오디는 null */
  foe: { team: (PublicMon | null)[]; active: number; submitted: boolean };
  lastEvents: BattleEvent[];
  winner: Seat | null;
  endReason: EndReason | null;
}
