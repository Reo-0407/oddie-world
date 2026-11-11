import { MOVES, speciesById } from '../data/index.ts';
import { computeDamage } from '../engine/damage.ts';
import type { Rng } from '../engine/rng.ts';
import { changeStage } from '../engine/stages.ts';
import type { BattlePokemon, Move, StatKey, Status, TypeName } from '../engine/types.ts';
import { createBattlePokemon } from '../game/factory.ts';

/** 포켓몬 고처럼 실시간으로 싸우는 오프라인 전투(야생·트레이너). 순수 모델이고 화면은 BattleScreen */

export const FAST_COOLDOWN_MS = 600;
export const FAST_ENERGY = 10;
export const MAX_ENERGY = 100;
export const FAST_POWER_SCALE = 0.5;
export const CHARGED_POWER_SCALE = 1.2;
export const DODGE_MS = 500;
export const DODGE_REDUCTION = 0.75;
export const TELEGRAPH_MS = 1000;
export const SWITCH_COOLDOWN_MS = 3000;
export const FOE_MIN_MS = 1000;
export const FOE_MAX_MS = 2000;
export const DOT_MS = 4000;
export const SLEEP_MS = 2500;

/** 기술이 하나도 없거나 전부 변화 기술일 때 쓰는 기본 공격 */
const STRUGGLE: Move = { id: 0, name: '몸통박치기', type: 'normal', category: 'physical', power: 40, accuracy: 100, priority: 0, effects: [] };

export interface Fighter {
  mon: BattlePokemon;
  fast: Move;
  /** 위력이 큰 기술 최대 2개 */
  charged: Move[];
  energy: number;
  /** 독·화상 피해까지 남은 시간 */
  dotMs: number;
  /** 잠든 채 남은 시간 */
  sleepMs: number;
}

export type SideKey = 'me' | 'foe';
export type RtKind = 'wild' | 'trainer';
export type RtResult = 'won' | 'lost' | 'fled';

export type RtEvent =
  /** side = 맞은 쪽 */
  | { t: 'hit'; side: SideKey; amount: number; hp: number; type: TypeName; charged: boolean; dodged: boolean; effectiveness: number; critical: boolean; move: string }
  | { t: 'charged'; side: SideKey; move: string; type: TypeName }
  | { t: 'telegraph'; move: string }
  | { t: 'status'; side: SideKey; status: Status }
  | { t: 'stage'; side: SideKey; stat: StatKey; delta: number }
  | { t: 'dot'; side: SideKey; amount: number; hp: number }
  | { t: 'heal'; side: SideKey; amount: number; hp: number }
  | { t: 'faint'; side: SideKey; name: string }
  | { t: 'send'; side: SideKey; name: string }
  | { t: 'dodge' }
  | { t: 'end'; result: RtResult };

export interface RtState {
  kind: RtKind;
  me: Fighter[];
  foe: Fighter[];
  myActive: number;
  foeActive: number;
  /** 내 기본 공격 쿨타임(남은 ms) */
  fastCd: number;
  switchCd: number;
  /** 남은 피하기 시간 */
  dodgeMs: number;
  /** 상대가 다음에 움직일 때까지 */
  foeNextMs: number;
  /** 상대 필살기 예고 중이면 남은 시간과 기술 번호 */
  telegraph: { ms: number; charged: number } | null;
  result: RtResult | null;
  /** 이번 tick에 일어난 일(화면 연출용) */
  events: RtEvent[];
}

export interface RtInput {
  fast?: boolean;
  /** 필살기 번호(0 또는 1) */
  charged?: number;
  dodge?: boolean;
  switchTo?: number;
  run?: boolean;
}

const damaging = (moves: Move[]) => moves.filter((m) => m.category !== 'status' && m.power > 0);

/** 필살기 에너지: 위력이 셀수록 비싸다(35~80) */
export function energyCost(move: Move): number {
  return Math.min(80, Math.max(35, Math.round((move.power * 0.6) / 5) * 5));
}

export function makeFighter(speciesId: number, level: number): Fighter {
  const mon = createBattlePokemon(speciesById(speciesId), level, MOVES);
  const moves = damaging(mon.moves);
  const fast = moves.length ? moves.reduce((a, b) => (b.power < a.power ? b : a)) : STRUGGLE;
  const rest = moves.filter((m) => m !== fast);
  const charged = (rest.length ? rest : [fast]).sort((a, b) => b.power - a.power).slice(0, 2);
  return { mon, fast, charged, energy: 0, dotMs: DOT_MS, sleepMs: 0 };
}

/** CP처럼 보이는 전투력 숫자 */
export const powerOf = (mon: BattlePokemon) => {
  const s = mon.stats;
  return Math.floor((s.hp + s.atk + s.def + s.spa + s.spd + s.spe) * 1.5);
};

/** 상대 행동 간격: 상대가 빠를수록 짧다(1.0~2.0초) */
export function foeInterval(me: BattlePokemon, foe: BattlePokemon): number {
  const ratio = me.stats.spe / Math.max(1, foe.stats.spe);
  const ms = 1500 * ratio * (foe.status === 'paralysis' ? 1.5 : 1);
  return Math.round(Math.min(FOE_MAX_MS, Math.max(FOE_MIN_MS, ms)));
}

export function createRealtime(kind: RtKind, team: { speciesId: number; level: number }[], foes: { speciesId: number; level: number }[]): RtState {
  const me = team.map((o) => makeFighter(o.speciesId, o.level));
  const foe = foes.map((o) => makeFighter(o.speciesId, o.level));
  return {
    kind, me, foe, myActive: 0, foeActive: 0, fastCd: 0, switchCd: 0, dodgeMs: 0,
    foeNextMs: foeInterval(me[0].mon, foe[0].mon), telegraph: null, result: null, events: [],
  };
}

const clone = (s: RtState): RtState => ({
  ...s,
  me: s.me.map((f) => ({ ...f, mon: { ...f.mon, stages: { ...f.mon.stages } } })),
  foe: s.foe.map((f) => ({ ...f, mon: { ...f.mon, stages: { ...f.mon.stages } } })),
  telegraph: s.telegraph && { ...s.telegraph },
  events: [],
});

export const activeOf = (s: RtState, side: SideKey) => (side === 'me' ? s.me[s.myActive] : s.foe[s.foeActive]);
const other = (side: SideKey): SideKey => (side === 'me' ? 'foe' : 'me');

/** 한 번의 공격: 피해, 에너지, 기술 효과(능력 변화·상태이상·흡수·반동). 명중률은 무시한다 */
function strike(s: RtState, by: SideKey, move: Move, charged: boolean, rng: Rng) {
  const att = activeOf(s, by);
  const target = other(by);
  const def = activeOf(s, target);
  const power = Math.max(1, Math.round(move.power * (charged ? CHARGED_POWER_SCALE : FAST_POWER_SCALE)));
  const r = computeDamage(att.mon, def.mon, move, rng, { power });
  const dodged = target === 'me' && s.dodgeMs > 0;
  const amount = Math.min(def.mon.hp, dodged ? Math.max(1, Math.floor(r.damage * (1 - DODGE_REDUCTION))) : r.damage);
  def.mon.hp -= amount;
  if (!charged) att.energy = Math.min(MAX_ENERGY, att.energy + FAST_ENERGY);
  s.events.push({ t: 'hit', side: target, amount, hp: def.mon.hp, type: move.type, charged, dodged, effectiveness: r.effectiveness, critical: r.critical, move: move.name });
  if (r.effectiveness === 0) return;
  for (const e of move.effects) {
    if (e.kind === 'stage' && rng.chance(e.chance / 100)) {
      const side = e.target === 'self' ? by : target;
      const delta = changeStage(activeOf(s, side).mon.stages, e.stat, e.delta);
      if (delta) s.events.push({ t: 'stage', side, stat: e.stat, delta });
    } else if (e.kind === 'status' && def.mon.hp > 0 && !def.mon.status && rng.chance(e.chance / 100)) {
      def.mon.status = e.status;
      if (e.status === 'sleep') def.sleepMs = SLEEP_MS;
      s.events.push({ t: 'status', side: target, status: e.status });
    } else if ((e.kind === 'drain' || e.kind === 'recoil') && amount > 0) {
      const n = Math.max(1, Math.floor(amount * e.ratio));
      if (e.kind === 'drain') {
        const healed = Math.min(n, att.mon.stats.hp - att.mon.hp);
        att.mon.hp += healed;
        if (healed) s.events.push({ t: 'heal', side: by, amount: healed, hp: att.mon.hp });
      } else {
        att.mon.hp = Math.max(0, att.mon.hp - n);
        s.events.push({ t: 'dot', side: by, amount: n, hp: att.mon.hp });
      }
    }
  }
}

/** 쓰러진 쪽을 정리한다: 다음 오디를 내보내거나 승패를 정한다 */
function settleFaints(s: RtState) {
  for (const side of ['foe', 'me'] as const) {
    if (s.result) return;
    const team = side === 'me' ? s.me : s.foe;
    const cur = activeOf(s, side);
    if (cur.mon.hp > 0) continue;
    s.events.push({ t: 'faint', side, name: cur.mon.name });
    const next = team.findIndex((f) => f.mon.hp > 0);
    const canNext = next >= 0 && (side === 'me' || s.kind === 'trainer');
    if (!canNext) {
      s.result = side === 'me' ? 'lost' : 'won';
      s.events.push({ t: 'end', result: s.result });
      return;
    }
    if (side === 'me') s.myActive = next;
    else s.foeActive = next;
    s.telegraph = null;
    s.foeNextMs = foeInterval(activeOf(s, 'me').mon, activeOf(s, 'foe').mon);
    s.events.push({ t: 'send', side, name: team[next].mon.name });
  }
}

/** 독·화상은 4초마다 최대 체력의 1/16, 잠은 2.5초 동안 못 움직이고 깬다 */
function tickStatus(s: RtState, side: SideKey, dt: number) {
  const f = activeOf(s, side);
  const st = f.mon.status;
  if (st === 'sleep') {
    f.sleepMs -= dt;
    if (f.sleepMs <= 0) { f.mon.status = null; f.sleepMs = 0; }
  } else if (st === 'poison' || st === 'burn') {
    f.dotMs -= dt;
    if (f.dotMs <= 0) {
      f.dotMs += DOT_MS;
      const n = Math.min(f.mon.hp, Math.max(1, Math.floor(f.mon.stats.hp / 16)));
      f.mon.hp -= n;
      s.events.push({ t: 'dot', side, amount: n, hp: f.mon.hp });
    }
  }
}

/** dtMs만큼 시간을 흘린다. rng는 전투 내내 같은 것을 쓴다 */
export function tick(state: RtState, dtMs: number, input: RtInput, rng: Rng): RtState {
  if (state.result) return state.events.length ? { ...state, events: [] } : state;
  const s = clone(state);
  const dt = Math.max(0, dtMs);
  s.fastCd = Math.max(0, s.fastCd - dt);
  s.switchCd = Math.max(0, s.switchCd - dt);
  s.dodgeMs = Math.max(0, s.dodgeMs - dt);

  if (input.run && s.kind === 'wild') {
    s.result = 'fled';
    s.events.push({ t: 'end', result: 'fled' });
    return s;
  }

  // 내 행동
  const sw = input.switchTo;
  if (sw !== undefined && sw !== s.myActive && s.switchCd === 0 && (s.me[sw]?.mon.hp ?? 0) > 0) {
    s.myActive = sw;
    s.switchCd = SWITCH_COOLDOWN_MS;
    s.fastCd = FAST_COOLDOWN_MS;
    s.events.push({ t: 'send', side: 'me', name: s.me[sw].mon.name });
  }
  const mine = activeOf(s, 'me');
  if (input.dodge && s.dodgeMs === 0) {
    s.dodgeMs = DODGE_MS;
    s.events.push({ t: 'dodge' });
  }
  const canAct = s.fastCd === 0 && s.dodgeMs === 0 && mine.mon.status !== 'sleep';
  const ch = input.charged !== undefined ? mine.charged[input.charged] : undefined;
  if (canAct && ch && mine.energy >= energyCost(ch)) {
    mine.energy -= energyCost(ch);
    s.events.push({ t: 'charged', side: 'me', move: ch.name, type: ch.type });
    strike(s, 'me', ch, true, rng);
    s.fastCd = FAST_COOLDOWN_MS;
  } else if (canAct && input.fast) {
    strike(s, 'me', mine.fast, false, rng);
    s.fastCd = FAST_COOLDOWN_MS * (mine.mon.status === 'paralysis' ? 1.5 : 1);
  }
  settleFaints(s);
  if (s.result) return s;

  // 상대 행동: 일정 간격으로 기본 공격, 에너지가 차면 1초 예고 뒤 필살기
  const foe = activeOf(s, 'foe');
  if (s.telegraph) {
    s.telegraph.ms -= dt;
    if (s.telegraph.ms <= 0) {
      const move = foe.charged[s.telegraph.charged];
      s.telegraph = null;
      foe.energy = Math.max(0, foe.energy - energyCost(move));
      s.events.push({ t: 'charged', side: 'foe', move: move.name, type: move.type });
      strike(s, 'foe', move, true, rng);
      s.foeNextMs = foeInterval(activeOf(s, 'me').mon, foe.mon);
    }
  } else if (foe.mon.status !== 'sleep') {
    s.foeNextMs -= dt;
    if (s.foeNextMs <= 0) {
      const move = foe.charged[0];
      if (move && foe.energy >= energyCost(move)) {
        s.telegraph = { ms: TELEGRAPH_MS, charged: 0 };
        s.events.push({ t: 'telegraph', move: move.name });
      } else {
        strike(s, 'foe', foe.fast, false, rng);
        s.foeNextMs = foeInterval(activeOf(s, 'me').mon, foe.mon);
      }
    }
  }
  tickStatus(s, 'me', dt);
  tickStatus(s, 'foe', dt);
  settleFaints(s);
  return s;
}

/** 전투가 끝났을 때 서 있는 내 오디(settleBattle의 alive) */
export const aliveMine = (s: RtState) => s.me.map((f) => f.mon.hp > 0);
