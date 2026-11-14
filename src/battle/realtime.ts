import { MOVES, speciesById } from '../data/index.ts';
import { computeDamage } from '../engine/damage.ts';
import type { Rng } from '../engine/rng.ts';
import { changeStage } from '../engine/stages.ts';
import { typeEffectiveness } from '../engine/typeChart.ts';
import type { BattlePokemon, Move, StatKey, Status, TypeName } from '../engine/types.ts';
import { createBattlePokemon } from '../game/factory.ts';
import { potionHeal } from '../game/shop.ts';

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
export const FOE_MAX_MS = 1600;
export const DOT_MS = 4000;
export const SLEEP_MS = 2500;
/** 포켓몬 고처럼 면역 타입도 0이 아니라 0.39배 */
export const IMMUNE_SCALE = 0.39;
/** 맞은 쪽도 에너지가 찬다: 최대 체력만큼 맞으면 이만큼 */
export const HIT_ENERGY = 60;
/** 트레이너 오디는 에너지를 반쯤 채운 채로 나온다(피하기가 의미 있게) */
export const TRAINER_START_ENERGY = 50;
export const POTION_COOLDOWN_MS = 3000;
/** 야생 오디도 에너지를 조금 채운 채로 나온다(첫 필살기가 빨리 온다) */
export const WILD_START_ENERGY = 20;
/** 트레이너 이상은 필살기 예고 길이가 들쭉날쭉하다(빨개질 때 박자를 맞춰 피해야 한다) */
export const BAIT_MS: [number, number] = [600, 1200];
/** 상대가 교체한 뒤 다시 교체하기까지 */
export const FOE_SWITCH_CD = { trainer: 12000, leader: 8000, champion: 7000 } as const;
/** 피하는 걸 보고 기다렸다가 피하기가 끝나면 친다 */
export const DODGE_WAIT_MS = 120;
/** 레벨 차이 한 칸마다 피해 배율(야생전만, 높은 쪽이 더 세게 때린다, ±10레벨까지) */
export const LEVEL_GAP = 1.12;
/** 야생 오디의 공격 배율(야생은 1:1 승부라 조금 세게) */
export const WILD_POWER = 1.4;

/** 상대의 머리: 야생 < 트레이너 < 관장 < 챔피언 */
export type AiTier = 'wild' | 'trainer' | 'leader' | 'champion';

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
/** escaped: 야생전에서 내 오디가 쓰러져 야생 오디가 도망갔다 */
export type RtResult = 'won' | 'lost' | 'fled' | 'escaped';

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
  /** 상대가 물건을 썼다(관장·챔피언의 회복약) */
  | { t: 'item'; side: SideKey; name: string }
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
  /** 남은 회복약과 회복약 쿨타임 */
  potions: number;
  potionCd: number;
  /** 상대 필살기 예고 중이면 남은 시간과 기술 번호 */
  telegraph: { ms: number; charged: number } | null;
  result: RtResult | null;
  ai: AiTier;
  /** 상대 교체 쿨타임 */
  foeSwitchCd: number;
  /** 관장·챔피언이 회복약을 썼나(한 판에 한 번) */
  foePotionUsed: boolean;
  /** 최근에 상대가 받은 피해(최대 체력 비율, 서서히 줄어든다): 세게 맞으면 능력 낮추기 기술을 고른다 */
  pressure: number;
  /** 이번 tick에 일어난 일(화면 연출용) */
  events: RtEvent[];
  /** 제한 시간이 있으면 남은 ms(레이드). 0이 되면 진다 */
  timeLeft?: number;
  /** 내 교체 쿨타임(기본 3초, 레이드는 0.5초) */
  switchMs: number;
}

export interface RtOptions {
  /** 상대 체력 배율(레이드 보스 5배) */
  foeHp?: number;
  /** 제한 시간(ms) */
  timeMs?: number;
  switchMs?: number;
}

export interface RtInput {
  fast?: boolean;
  /** 필살기 번호(0 또는 1) */
  charged?: number;
  dodge?: boolean;
  switchTo?: number;
  run?: boolean;
  potion?: boolean;
}

const damaging = (moves: Move[]) => moves.filter((m) => m.category !== 'status' && m.power > 0);

/** 필살기 에너지: 위력이 셀수록 비싸다(35~80) */
export function energyCost(move: Move): number {
  return Math.min(80, Math.max(35, Math.round((move.power * 0.6) / 5) * 5));
}

/** moveLevel: 이 레벨까지 배운 기술 중에서 고른다(능력치는 level 그대로) */
export function makeFighter(speciesId: number, level: number, moveLevel = level): Fighter {
  const mon = createBattlePokemon(speciesById(speciesId), level, MOVES);
  if (moveLevel > level) mon.moves = createBattlePokemon(speciesById(speciesId), moveLevel, MOVES).moves;
  const moves = damaging(mon.moves);
  // 기본 공격은 가장 약한 자기 타입 기술(없으면 가장 약한 기술): 다들 박치기만 쓰지 않게
  const stab = moves.filter((m) => mon.types.includes(m.type));
  const pool = stab.length ? stab : moves;
  const fast = pool.length ? pool.reduce((a, b) => (b.power < a.power ? b : a)) : STRUGGLE;
  const rest = moves.filter((m) => m !== fast);
  const charged = (rest.length ? rest : [fast]).sort((a, b) => b.power - a.power).slice(0, 2);
  return { mon, fast, charged, energy: 0, dotMs: DOT_MS, sleepMs: 0 };
}

/** CP처럼 보이는 전투력 숫자 */
export const powerOf = (mon: BattlePokemon) => {
  const s = mon.stats;
  return Math.floor((s.hp + s.atk + s.def + s.spa + s.spd + s.spe) * 1.5);
};

/** 레벨 차이 배율: 상대가 높을수록 빨리(레벨당 5%, 0.7~1.2배) */
export const levelPace = (me: BattlePokemon, foe: BattlePokemon) => Math.min(1.2, Math.max(0.7, 1 - 0.05 * (foe.level - me.level)));

/** 상대 행동 간격: 상대가 빠를수록(1.0~1.6초), 레벨이 높을수록 짧다 */
export function foeInterval(me: BattlePokemon, foe: BattlePokemon): number {
  const ratio = me.stats.spe / Math.max(1, foe.stats.spe);
  const ms = Math.min(FOE_MAX_MS, Math.max(FOE_MIN_MS, 1500 * ratio)) * levelPace(me, foe) * (foe.status === 'paralysis' ? 1.5 : 1);
  return Math.round(ms);
}

/** 이 기술로 줄 피해의 어림값(난수·급소 없이): 위력 × 자속 × 상성 × 공/방 */
export function expectedDamage(att: BattlePokemon, def: BattlePokemon, move: Move): number {
  const phys = move.category === 'physical';
  const a = phys ? att.stats.atk : att.stats.spa;
  const d = phys ? def.stats.def : def.stats.spd;
  const stab = att.types.includes(move.type) ? 1.5 : 1;
  return move.power * stab * goEffectiveness(typeEffectiveness(move.type, def.types)) * (a / Math.max(1, d));
}

/** 내 공격을 약하게 하거나 자기를 단단하게 하는 기술인가 */
const defensive = (m: Move) => m.effects.some((e) => e.kind === 'stage'
  && ((e.target === 'foe' && e.delta < 0 && (e.stat === 'atk' || e.stat === 'spa')) || (e.target === 'self' && e.delta > 0 && (e.stat === 'def' || e.stat === 'spd'))));

/**
 * 상대가 쓸 필살기 번호. null이면 이번엔 기본 공격.
 * 야생: 첫 기술이 차면 바로. 트레이너 이상: 기대 피해가 가장 큰 기술(세게 맞는 중이면 능력 낮추기 기술 우대),
 * 훨씬 센 기술이 조금만 더 모으면 되면 아껴 둔다
 */
export function chooseCharged(foe: Fighter, target: BattlePokemon, tier: AiTier, pressure = 0): number | null {
  const moves = foe.charged;
  if (!moves.length) return null;
  if (tier === 'wild') return foe.energy >= energyCost(moves[0]) ? 0 : null;
  const score = (m: Move) => expectedDamage(foe.mon, target, m) * (pressure > 0.3 && defensive(m) ? 1.4 : 1);
  let best = -1;
  let top = 0;
  moves.forEach((m, i) => {
    if (score(m) > score(moves[top])) top = i;
    if (foe.energy >= energyCost(m) && (best < 0 || score(m) > score(moves[best]))) best = i;
  });
  if (best < 0) return null;
  const strong = moves[top];
  if (top !== best && score(strong) >= score(moves[best]) * 1.25 && foe.energy >= energyCost(strong) - 25) return null;
  return best;
}

/** a가 b를 상대로 얼마나 유리한가(1보다 크면 유리): 서로 줄 수 있는 최대 피해 비율의 비 */
export function matchup(a: Fighter, b: Fighter): number {
  const hit = (x: Fighter, y: Fighter) => Math.max(...[x.fast, ...x.charged].map((m) => expectedDamage(x.mon, y.mon, m))) / Math.max(1, y.mon.stats.hp);
  return hit(a, b) / Math.max(0.0001, hit(b, a));
}

/** 서 있는 상대 오디 중 내 지금 오디를 가장 잘 상대하는 쪽(없으면 -1) */
export function bestCounter(foes: Fighter[], mine: Fighter, except = -1): number {
  let best = -1;
  foes.forEach((f, i) => {
    if (i === except || f.mon.hp <= 0) return;
    if (best < 0 || matchup(f, mine) > matchup(foes[best], mine)) best = i;
  });
  return best;
}

export function createRealtime(
  kind: RtKind, team: { speciesId: number; level: number }[], foes: { speciesId: number; level: number; moveLevel?: number }[], potions = 0,
  ai: AiTier = kind === 'wild' ? 'wild' : 'trainer', opts: RtOptions = {},
): RtState {
  const me = team.map((o) => makeFighter(o.speciesId, o.level));
  const foe = foes.map((o) => {
    const f = { ...makeFighter(o.speciesId, o.level, o.moveLevel), energy: kind === 'trainer' ? TRAINER_START_ENERGY : WILD_START_ENERGY };
    if (opts.foeHp && opts.foeHp > 1) {
      const hp = Math.round(f.mon.stats.hp * opts.foeHp);
      f.mon = { ...f.mon, hp, stats: { ...f.mon.stats, hp } };
    }
    return f;
  });
  const s: RtState = {
    kind, me, foe, myActive: 0, foeActive: 0, fastCd: 0, switchCd: 0, dodgeMs: 0, potions, potionCd: 0,
    foeNextMs: foeInterval(me[0].mon, foe[0].mon), telegraph: null, result: null, events: [],
    ai, foeSwitchCd: 5000, foePotionUsed: false, pressure: 0, switchMs: opts.switchMs ?? SWITCH_COOLDOWN_MS,
  };
  if (opts.timeMs) s.timeLeft = opts.timeMs;
  return s;
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

/** 포켓몬 고 상성 배율: 2배→1.6, 0.5배→0.625, 면역→0.39(한 쪽 상성이 너무 세지 않게) */
export const goEffectiveness = (e: number) => (e === 0 ? IMMUNE_SCALE : 1.6 ** Math.log2(e));

/** 한 번의 공격: 피해, 에너지, 기술 효과(능력 변화·상태이상·흡수·반동). 명중률은 무시한다 */
function strike(s: RtState, by: SideKey, move: Move, charged: boolean, rng: Rng) {
  const att = activeOf(s, by);
  const target = other(by);
  const def = activeOf(s, target);
  const power = Math.max(1, Math.round(move.power * (charged ? CHARGED_POWER_SCALE : FAST_POWER_SCALE)));
  const raw = computeDamage(att.mon, def.mon, move, rng, { power });
  const immune = raw.effectiveness === 0;
  const base = immune ? computeDamage(att.mon, { ...def.mon, types: [] }, move, rng, { power }) : raw;
  const effectiveness = goEffectiveness(raw.effectiveness);
  const gap = s.kind !== 'wild' ? 1 : LEVEL_GAP ** Math.max(-10, Math.min(10, att.mon.level - def.mon.level));
  const wildBoost = by === 'foe' && s.kind === 'wild' ? WILD_POWER : 1;
  const r = { ...base, effectiveness, damage: Math.max(1, Math.floor((base.damage * effectiveness * gap * wildBoost) / base.effectiveness)) };
  const dodged = target === 'me' && s.dodgeMs > 0;
  const amount = Math.min(def.mon.hp, dodged ? Math.max(1, Math.floor(r.damage * (1 - DODGE_REDUCTION))) : r.damage);
  def.mon.hp -= amount;
  if (target === 'foe') s.pressure += amount / def.mon.stats.hp;
  if (!charged) att.energy = Math.min(MAX_ENERGY, att.energy + FAST_ENERGY);
  def.energy = Math.min(MAX_ENERGY, def.energy + Math.round((amount / def.mon.stats.hp) * HIT_ENERGY));
  s.events.push({ t: 'hit', side: target, amount, hp: def.mon.hp, type: move.type, charged, dodged, effectiveness: r.effectiveness, critical: r.critical, move: move.name });
  if (immune) return; // 면역이면 부가 효과는 없다
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
    // 트레이너 이상은 내 오디를 가장 잘 상대하는 오디를 내보낸다
    const next = side === 'foe' && s.ai !== 'wild' ? bestCounter(team, activeOf(s, 'me')) : team.findIndex((f) => f.mon.hp > 0);
    // 야생은 1:1 승부: 내 오디가 쓰러지면 야생 오디는 도망간다(전멸 벌칙 없음)
    if (side === 'me' && s.kind === 'wild') {
      s.result = 'escaped';
      s.events.push({ t: 'end', result: s.result });
      return;
    }
    const canNext = next >= 0 && (side === 'me' || s.kind === 'trainer');
    if (!canNext) {
      s.result = side === 'me' ? 'lost' : 'won';
      s.events.push({ t: 'end', result: s.result });
      return;
    }
    if (side === 'me') s.myActive = next;
    else s.foeActive = next;
    s.telegraph = null;
    s.pressure = 0;
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

/** 상대 행동: 일정 간격으로 기본 공격, 에너지가 차면 예고 뒤 필살기. 트레이너 이상은 교체·회복약·박자 바꾸기 */
function foeAct(s: RtState, dt: number, rng: Rng) {
  let foe = activeOf(s, 'foe');
  const me = activeOf(s, 'me');
  const smart = s.ai !== 'wild';
  if (s.telegraph) {
    s.telegraph.ms -= dt;
    if (s.telegraph.ms <= 0) {
      const move = foe.charged[s.telegraph.charged];
      s.telegraph = null;
      foe.energy = Math.max(0, foe.energy - energyCost(move));
      s.events.push({ t: 'charged', side: 'foe', move: move.name, type: move.type });
      strike(s, 'foe', move, true, rng);
      s.foeNextMs = foeInterval(me.mon, foe.mon);
    }
    return;
  }
  // 관장·챔피언: 체력이 25% 아래면 회복약 한 번
  if ((s.ai === 'leader' || s.ai === 'champion') && !s.foePotionUsed && foe.mon.hp > 0 && foe.mon.hp < foe.mon.stats.hp * 0.25) {
    const healed = potionHeal(foe.mon.hp, foe.mon.stats.hp);
    foe.mon.hp += healed;
    s.foePotionUsed = true;
    s.events.push({ t: 'item', side: 'foe', name: '회복약' }, { t: 'heal', side: 'foe', amount: healed, hp: foe.mon.hp });
    s.foeNextMs = Math.max(s.foeNextMs, 700);
    return;
  }
  // 트레이너 이상: 상성이 크게 불리하고 아직 건강하면 더 맞는 오디로 바꾼다
  if (smart && s.kind === 'trainer' && s.foeSwitchCd === 0 && foe.mon.hp > foe.mon.stats.hp * 0.5) {
    const now = matchup(foe, me);
    const alt = bestCounter(s.foe, me, s.foeActive);
    if (now < 0.6 && alt >= 0 && matchup(s.foe[alt], me) > now * 1.5) {
      s.foeActive = alt;
      s.foeSwitchCd = FOE_SWITCH_CD[s.ai as Exclude<AiTier, 'wild'>];
      s.pressure = 0;
      foe = s.foe[alt];
      s.foeNextMs = foeInterval(me.mon, foe.mon) + 300;
      s.events.push({ t: 'send', side: 'foe', name: foe.mon.name });
      return;
    }
  }
  if (foe.mon.status === 'sleep') return;
  s.foeNextMs -= dt;
  if (s.foeNextMs > 0) return;
  // 트레이너 이상: 내가 피하는 중이면 피하기가 끝날 때까지 기다렸다 친다
  if (smart && s.dodgeMs > 0) { s.foeNextMs = s.dodgeMs + DODGE_WAIT_MS; return; }
  const pick = chooseCharged(foe, me.mon, s.ai, s.pressure);
  if (pick !== null) {
    s.telegraph = { ms: smart ? rng.int(BAIT_MS[0], BAIT_MS[1]) : TELEGRAPH_MS, charged: pick };
    s.events.push({ t: 'telegraph', move: foe.charged[pick].name });
    return;
  }
  strike(s, 'foe', foe.fast, false, rng);
  // 트레이너 이상: 내 체력이 30% 아래면 몰아친다
  s.foeNextMs = foeInterval(me.mon, foe.mon) * (smart && me.mon.hp < me.mon.stats.hp * 0.3 ? 0.75 : 1);
}

/** dtMs만큼 시간을 흘린다. rng는 전투 내내 같은 것을 쓴다 */
export function tick(state: RtState, dtMs: number, input: RtInput, rng: Rng): RtState {
  if (state.result) return state.events.length ? { ...state, events: [] } : state;
  const s = clone(state);
  const dt = Math.max(0, dtMs);
  s.fastCd = Math.max(0, s.fastCd - dt);
  s.switchCd = Math.max(0, s.switchCd - dt);
  s.dodgeMs = Math.max(0, s.dodgeMs - dt);
  s.potionCd = Math.max(0, s.potionCd - dt);
  s.foeSwitchCd = Math.max(0, s.foeSwitchCd - dt);
  s.pressure = Math.max(0, s.pressure - dt / 5000);

  if (s.timeLeft !== undefined) {
    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (s.timeLeft === 0) {
      s.result = 'lost';
      s.events.push({ t: 'end', result: 'lost' });
      return s;
    }
  }
  if (input.run && (s.kind === 'wild' || s.timeLeft !== undefined)) {
    s.result = 'fled';
    s.events.push({ t: 'end', result: 'fled' });
    return s;
  }

  // 내 행동
  const sw = input.switchTo;
  if (sw !== undefined && sw !== s.myActive && s.switchCd === 0 && (s.me[sw]?.mon.hp ?? 0) > 0) {
    s.myActive = sw;
    s.switchCd = s.switchMs;
    s.fastCd = FAST_COOLDOWN_MS;
    s.events.push({ t: 'send', side: 'me', name: s.me[sw].mon.name });
  }
  const mine = activeOf(s, 'me');
  if (input.potion && s.potionCd === 0 && s.potions > 0 && mine.mon.hp > 0) {
    const healed = potionHeal(mine.mon.hp, mine.mon.stats.hp);
    if (healed > 0) {
      mine.mon.hp += healed;
      s.potions -= 1;
      s.potionCd = POTION_COOLDOWN_MS;
      s.events.push({ t: 'heal', side: 'me', amount: healed, hp: mine.mon.hp });
    }
  }
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

  foeAct(s, dt, rng);
  tickStatus(s, 'me', dt);
  tickStatus(s, 'foe', dt);
  settleFaints(s);
  return s;
}

/** 전투가 끝났을 때 서 있는 내 오디(settleBattle의 alive) */
export const aliveMine = (s: RtState) => s.me.map((f) => f.mon.hp > 0);
