import type { Species } from '../data/types.ts';
import { chooseAiSwitch } from '../engine/ai.ts';
import { createRng } from '../engine/rng.ts';
import { isLegalAction, resolveForcedSwitch, resolveTurn } from '../engine/turn.ts';
import type { Action, BattleEvent, BattlePokemon, BattleState, Move } from '../engine/types.ts';
import { createBattle } from '../game/factory.ts';
import type { EndReason, ErrorReason, OwnMon, Phase, PublicMon, RoomView, Seat, TeamSpec } from './protocol.ts';
import { buildBattleTeam, validateTeam } from './validate.ts';

/*
 * 방 상태 머신. 순수 함수만 있다: 시계(now, ms)와 난수(seed)는 밖에서 넣어 준다.
 * (Math.random, Date 사용 금지: 서버(Deno)와 브라우저에서 같은 결과가 나와야 한다)
 */

export const TURN_MS = 60_000; // 행동 제한시간
export const TEAM_MS = 120_000; // 팀 고르기 제한시간
export const MAX_MISSES = 3; // 연속으로 시간을 넘기면 기권패

export interface RoomSeat {
  playerId: string;
  name: string;
  connected: boolean;
  team: TeamSpec | null;
  /** 연속으로 제한시간을 넘긴 횟수 */
  misses: number;
}

export interface Room {
  code: string;
  phase: Phase;
  seats: [RoomSeat | null, RoomSeat | null];
  /** 서버만 가진다. 난수 상태가 들어 있어 클라이언트에 보내면 안 된다 */
  battle: BattleState | null;
  seed: number;
  awaiting: [boolean, boolean];
  pending: [Action | null, Action | null];
  deadline: number | null;
  turn: number;
  lastEvents: BattleEvent[];
  /** 지금까지 한 번이라도 나온 오디 (상대에게 이름을 보여 줘도 되는 것) */
  revealed: [boolean[], boolean[]];
  winner: Seat | null;
  endReason: EndReason | null;
}

export interface GameData {
  species: readonly Species[];
  moves: Record<number, Move>;
}

export type Result = { ok: true; room: Room } | { ok: false; error: ErrorReason; detail?: string };

const fail = (error: ErrorReason, detail?: string): Result => ({ ok: false, error, detail });

// ---------- 방 코드 ----------

/** 헷갈리는 글자(0, O, 1, I)를 뺀 32글자 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** rng는 0 이상 1 미만을 돌려주는 함수. 시드를 넣은 createRng(seed).next 같은 것을 쓴다 */
export function generateRoomCode(rng: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function codeFromSeed(seed: number): string {
  return generateRoomCode(createRng(seed).next);
}

// ---------- 만들기와 참가 ----------

export function createRoom(code: string, playerId: string, name: string, seed: number): Room {
  return {
    code, phase: 'waiting',
    seats: [{ playerId, name, connected: true, team: null, misses: 0 }, null],
    battle: null, seed, awaiting: [false, false], pending: [null, null], deadline: null, turn: 0,
    lastEvents: [], revealed: [[], []], winner: null, endReason: null,
  };
}

export function seatOf(room: Room, playerId: string): Seat | null {
  if (room.seats[0]?.playerId === playerId) return 0;
  if (room.seats[1]?.playerId === playerId) return 1;
  return null;
}

export function joinRoom(room: Room, playerId: string, name: string, now: number): Result {
  if (seatOf(room, playerId) !== null) return setConnected(room, playerId, true);
  if (room.seats[1]) return fail('full');
  if (room.phase !== 'waiting') return fail('started');
  const next = structuredClone(room);
  next.seats[1] = { playerId, name, connected: true, team: null, misses: 0 };
  next.phase = 'teams';
  next.deadline = now + TEAM_MS;
  return { ok: true, room: next };
}

export function setConnected(room: Room, playerId: string, connected: boolean): Result {
  const seat = seatOf(room, playerId);
  if (seat === null) return fail('not-seated');
  const next = structuredClone(room);
  const target = next.seats[seat];
  if (target) target.connected = connected;
  return { ok: true, room: next };
}

// ---------- 팀 제출 ----------

export function submitTeam(room: Room, playerId: string, team: unknown, data: GameData, now: number): Result {
  const seat = seatOf(room, playerId);
  if (seat === null) return fail('not-seated');
  if (room.phase !== 'teams') return fail('bad-phase');
  const checked = validateTeam(team, data.species, data.moves);
  if (!checked.ok) return fail('invalid-team', checked.errors.join('; '));
  const next = structuredClone(room);
  const target = next.seats[seat];
  if (target) target.team = checked.team;
  const [a, b] = next.seats;
  if (a?.team && b?.team) startBattle(next, data, now);
  return { ok: true, room: next };
}

function startBattle(room: Room, data: GameData, now: number) {
  const [a, b] = room.seats;
  if (!a?.team || !b?.team) return;
  room.battle = createBattle(
    buildBattleTeam(a.team, data.species, data.moves),
    buildBattleTeam(b.team, data.species, data.moves),
    room.seed,
  );
  room.phase = 'battle';
  room.turn = 1;
  room.awaiting = [true, true];
  room.pending = [null, null];
  room.deadline = now + TURN_MS;
  room.revealed = [[true, false, false], [true, false, false]];
}

// ---------- 행동 제출 ----------

export function submitAction(room: Room, playerId: string, turn: number, action: Action, now: number): Result {
  const seat = seatOf(room, playerId);
  if (seat === null) return fail('not-seated');
  if (room.phase !== 'battle' || !room.battle) return fail('bad-phase');
  if (turn !== room.turn) return fail('stale-turn');
  if (!room.awaiting[seat]) return fail('not-your-turn');
  if (room.pending[seat]) return fail('already-submitted');
  if (!isClientAction(action) || !isLegalAction(room.battle, seat, action)) return fail('illegal-action');
  const next = structuredClone(room);
  next.pending[seat] = action;
  const target = next.seats[seat];
  if (target) target.misses = 0;
  advance(next, now);
  return { ok: true, room: next };
}

/** 클라이언트가 낼 수 있는 것은 기술 사용과 교체뿐이다 (pass는 서버가 시간초과 때만 쓴다) */
function isClientAction(action: Action): boolean {
  if (typeof action !== 'object' || action === null) return false;
  if (action.kind === 'move') return Number.isInteger(action.moveIndex);
  if (action.kind === 'switch') return Number.isInteger(action.teamIndex);
  return false;
}

/** 기다리던 행동이 다 모였으면 엔진으로 판정하고 다음 단계로 넘어간다 */
function advance(room: Room, now: number) {
  const battle = room.battle;
  if (!battle) return;
  const ready = ([0, 1] as const).every((side) => !room.awaiting[side] || room.pending[side] !== null);
  if (!ready) return;

  let state = battle;
  const events: BattleEvent[] = [];
  if (state.pendingSwitch[0] || state.pendingSwitch[1]) {
    // 쓰러진 쪽이 다음 오디를 내보내는 단계
    for (const side of [0, 1] as const) {
      const action = room.pending[side];
      if (state.pendingSwitch[side] && action?.kind === 'switch') {
        const result = resolveForcedSwitch(state, side, action.teamIndex);
        state = result.state;
        events.push(...result.events);
      }
    }
  } else {
    const result = resolveTurn(state, [room.pending[0] ?? { kind: 'pass' }, room.pending[1] ?? { kind: 'pass' }]);
    state = result.state;
    events.push(...result.events);
  }
  room.battle = state;
  room.pending = [null, null];
  room.lastEvents = events;
  room.turn += 1;
  markRevealed(room);

  if (state.winner !== null) {
    finish(room, state.winner, 'ko');
    return;
  }
  room.awaiting = state.pendingSwitch[0] || state.pendingSwitch[1]
    ? [state.pendingSwitch[0], state.pendingSwitch[1]]
    : [true, true];
  room.deadline = now + TURN_MS;
}

function markRevealed(room: Room) {
  if (!room.battle) return;
  for (const side of [0, 1] as const) room.revealed[side][room.battle.sides[side].active] = true;
}

function finish(room: Room, winner: Seat | null, reason: EndReason) {
  room.phase = 'finished';
  room.winner = winner;
  room.endReason = reason;
  room.awaiting = [false, false];
  room.pending = [null, null];
  room.deadline = null;
}

/** 나가기: 전투 중이면 상대가 이긴다 */
export function leaveRoom(room: Room, playerId: string): Result {
  const seat = seatOf(room, playerId);
  if (seat === null) return fail('not-seated');
  const next = structuredClone(room);
  if (next.phase === 'battle') finish(next, seat === 0 ? 1 : 0, 'forfeit');
  else if (next.phase !== 'finished') finish(next, null, 'forfeit');
  return { ok: true, room: next };
}

// ---------- 시간 ----------

/**
 * 시계가 흐를 때 부른다. 제한시간이 지났으면:
 *  - 팀 고르기: 안 낸 쪽이 진다(둘 다 안 냈으면 무승부로 끝)
 *  - 전투: 끊긴 쪽은 진다. 연결돼 있으면 자동으로 쉬고(pass, 쓰러진 뒤라면 첫 살아있는 오디 교체),
 *    연속 3번 넘기면 진다
 */
export function tick(room: Room, now: number): Room {
  if (room.deadline === null || now < room.deadline) return room;
  const next = structuredClone(room);
  if (next.phase === 'teams') {
    const submitted = next.seats.map((seat) => seat?.team !== null && seat?.team !== undefined);
    if (submitted[0] && !submitted[1]) finish(next, 0, 'timeout');
    else if (submitted[1] && !submitted[0]) finish(next, 1, 'timeout');
    else finish(next, null, 'timeout');
    return next;
  }
  if (next.phase !== 'battle' || !next.battle) return room;
  for (const side of [0, 1] as const) {
    if (!next.awaiting[side] || next.pending[side]) continue;
    const seat = next.seats[side];
    if (!seat) continue;
    if (!seat.connected) {
      finish(next, side === 0 ? 1 : 0, 'disconnect');
      return next;
    }
    seat.misses += 1;
    if (seat.misses >= MAX_MISSES) {
      finish(next, side === 0 ? 1 : 0, 'timeout');
      return next;
    }
    next.pending[side] = next.battle.pendingSwitch[side]
      ? { kind: 'switch', teamIndex: chooseAiSwitch(next.battle, side) }
      : { kind: 'pass' };
  }
  advance(next, now);
  return next;
}

// ---------- 공개 상태 필터 ----------

const publicMon = (pokemon: BattlePokemon): PublicMon => ({
  speciesId: pokemon.speciesId,
  name: pokemon.name,
  level: pokemon.level,
  types: pokemon.types,
  hpPct: Math.round((pokemon.hp / pokemon.stats.hp) * 100),
  status: pokemon.status,
  fainted: pokemon.hp <= 0,
});

const ownMon = (pokemon: BattlePokemon): OwnMon => ({
  ...publicMon(pokemon),
  hp: pokemon.hp,
  maxHp: pokemon.stats.hp,
  moves: pokemon.moves.map((m) => ({ id: m.id, name: m.name, type: m.type, category: m.category, power: m.power })),
});

/**
 * seat에게 보여 줄 상태. 상대의 제출한 행동, 상대 기술/능력치, 아직 안 나온 상대 오디, 난수 상태는 뺀다.
 * (알려진 한계: lastEvents에는 지난 턴 사건이 그대로 들어 있어 상대 체력 숫자가 보인다)
 */
export function viewFor(room: Room, seat: Seat): RoomView {
  const other: Seat = seat === 0 ? 1 : 0;
  const battle = room.battle;
  const mustSwitch = battle ? battle.pendingSwitch[seat] : false;
  return {
    code: room.code,
    phase: room.phase,
    seat,
    names: [room.seats[0]?.name ?? null, room.seats[1]?.name ?? null],
    connected: [room.seats[0]?.connected ?? false, room.seats[1]?.connected ?? false],
    teamsReady: [room.seats[0]?.team != null, room.seats[1]?.team != null],
    turn: room.turn,
    deadline: room.deadline,
    you: {
      team: battle ? battle.sides[seat].team.map(ownMon) : [],
      active: battle ? battle.sides[seat].active : 0,
      needsAction: room.phase === 'battle' && room.awaiting[seat] && room.pending[seat] === null,
      submitted: room.pending[seat] !== null,
      mustSwitch,
    },
    foe: {
      team: battle
        ? battle.sides[other].team.map((pokemon, index) => (room.revealed[other][index] ? publicMon(pokemon) : null))
        : [],
      active: battle ? battle.sides[other].active : 0,
      submitted: room.pending[other] !== null,
    },
    lastEvents: room.lastEvents,
    winner: room.winner,
    endReason: room.endReason,
  };
}

export function isFinished(room: Room): boolean {
  return room.phase === 'finished';
}
