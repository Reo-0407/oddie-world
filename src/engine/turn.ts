import { computeDamage, confusionDamage, HIGH_CRITICAL_CHANCE } from './damage.ts';
import { resetVolatile } from './fighter.ts';
import { createRng, type Rng } from './rng.ts';
import { changeStage, staged } from './stages.ts';
import { typeEffectiveness } from './typeChart.ts';
import type {
  Action, BattleEvent, BattlePokemon, BattleState, DelayedHit, Move, MoveEffect, SideIndex, Status, TurnResult, TypeName,
} from './types.ts';

const STATUS_IMMUNITY: Partial<Record<Status, TypeName[]>> = {
  poison: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
};

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

export function activeOf(state: BattleState, side: SideIndex): BattlePokemon {
  const { team, active } = state.sides[side];
  return team[active];
}

export function isLegalAction(state: BattleState, side: SideIndex, action: Action): boolean {
  if (action.kind === 'move') {
    return action.moveIndex >= 0 && action.moveIndex < activeOf(state, side).moves.length;
  }
  if (action.kind === 'pass') return false;
  const { team, active } = state.sides[side];
  const current = team[active];
  if (current.hp > 0 && !state.pendingSwitch[side] && (current.trapped > 0 || current.charging !== null)) return false;
  const target = team[action.teamIndex];
  return action.teamIndex !== active && target !== undefined && target.hp > 0;
}

function hasBench(state: BattleState, side: SideIndex): boolean {
  const { team, active } = state.sides[side];
  return team.some((pokemon, index) => index !== active && pokemon.hp > 0);
}

/** 충전 중이면 무엇을 골랐든 충전한 기술이 나간다 */
function normalizeAction(state: BattleState, side: SideIndex, action: Action): Action {
  const charging = activeOf(state, side).charging;
  return charging !== null ? { kind: 'move', moveIndex: charging } : action;
}

function effectiveSpeed(pokemon: BattlePokemon): number {
  const speed = staged(pokemon.stats.spe, pokemon.stages.spe);
  return pokemon.status === 'paralysis' ? Math.floor(speed / 2) : speed;
}

function actionPriority(state: BattleState, side: SideIndex, action: Action): number {
  if (action.kind === 'switch') return 100;
  if (action.kind === 'pass') return 0;
  return activeOf(state, side).moves[action.moveIndex].priority;
}

function actionOrder(state: BattleState, actions: [Action, Action], rng: Rng): [SideIndex, SideIndex] {
  const priorityGap = actionPriority(state, 0, actions[0]) - actionPriority(state, 1, actions[1]);
  if (priorityGap !== 0) return priorityGap > 0 ? [0, 1] : [1, 0];
  const speedGap = effectiveSpeed(activeOf(state, 0)) - effectiveSpeed(activeOf(state, 1));
  if (speedGap !== 0) return speedGap > 0 ? [0, 1] : [1, 0];
  return rng.chance(0.5) ? [0, 1] : [1, 0];
}

function switchIn(state: BattleState, side: SideIndex, teamIndex: number, events: BattleEvent[]) {
  resetVolatile(activeOf(state, side));
  state.sides[side].active = teamIndex;
  const pokemon = activeOf(state, side);
  events.push({ t: 'switch', side, teamIndex, name: pokemon.name, hp: pokemon.hp });
}

const CONFUSION_SELF_HIT = 1 / 3;

/** 턴 시작 전에 움직일 수 있는지 판단한다 */

function canAct(pokemon: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]): boolean {
  const blocked = (reason: 'sleep' | 'paralysis' | 'flinch') => {
    pokemon.charging = null;
    events.push({ t: 'cantMove', side, name: pokemon.name, reason });
    return false;
  };
  if (pokemon.status === 'sleep') {
    if (pokemon.sleepTurns > 0) {
      pokemon.sleepTurns -= 1;
      return blocked('sleep');
    }
    pokemon.status = null;
    events.push({ t: 'wake', side, name: pokemon.name });
  }
  if (pokemon.flinched) {
    pokemon.flinched = false;
    return blocked('flinch');
  }
  if (pokemon.status === 'paralysis' && rng.chance(0.25)) return blocked('paralysis');
  if (pokemon.confusion > 0) {
    pokemon.confusion -= 1;
    if (pokemon.confusion === 0) {
      events.push({ t: 'confusionEnd', side, name: pokemon.name });
    } else if (rng.chance(CONFUSION_SELF_HIT)) {
      const amount = Math.min(confusionDamage(pokemon), pokemon.hp);
      pokemon.hp -= amount;
      pokemon.charging = null;
      pokemon.hitThisTurn = true; // 스스로 맞은 것도 맞은 것이다(보복 위력이 켜진다)
      events.push({ t: 'confusionHit', side, name: pokemon.name, amount, hp: pokemon.hp });
      if (pokemon.hp <= 0) events.push({ t: 'faint', side, name: pokemon.name });
      return false;
    }
  }
  return true;
}

export function isStatusImmune(types: TypeName[], status: Status): boolean {
  return STATUS_IMMUNITY[status]?.some((type) => types.includes(type)) ?? false;
}

function applyStatus(target: BattlePokemon, side: SideIndex, status: Status, rng: Rng, events: BattleEvent[]): boolean {
  if (target.hp <= 0 || target.status !== null) return false;
  if (isStatusImmune(target.types, status)) return false;
  target.status = status;
  if (status === 'sleep') target.sleepTurns = rng.int(1, 3);
  events.push({ t: 'status', side, name: target.name, status });
  return true;
}

function heal(pokemon: BattlePokemon, side: SideIndex, amount: number, events: BattleEvent[]): boolean {
  const healed = Math.min(amount, pokemon.stats.hp - pokemon.hp);
  if (healed <= 0) return false;
  pokemon.hp += healed;
  events.push({ t: 'heal', side, name: pokemon.name, amount: healed, hp: pokemon.hp });
  return true;
}

export function effectOf<K extends MoveEffect['kind']>(move: Move, kind: K): Extract<MoveEffect, { kind: K }> | undefined {
  return move.effects.find((effect) => effect.kind === kind) as Extract<MoveEffect, { kind: K }> | undefined;
}

/** 이번에 실제로 쓰는 위력. 도박은 난수를 하나 쓴다 */
/** 역전: 체력이 바닥일 때 위력이 최대 이 비율만큼 오른다 (1.6배) */
const LOW_HP_BONUS = 0.6;

export function movePower(move: Move, attacker: BattlePokemon, defender: BattlePokemon, rng: Rng): number {
  let power = move.power;
  for (const effect of move.effects) {
    if (effect.kind === 'lowHp') power *= 1 + LOW_HP_BONUS * (1 - attacker.hp / attacker.stats.hp);
    if (effect.kind === 'revenge' && attacker.hitThisTurn) power *= 2;
    if (effect.kind === 'punish' && defender.status !== null) power *= 1.6;
    if (effect.kind === 'gamble') power *= effect.min + rng.next() * (effect.max - effect.min);
  }
  return Math.max(1, Math.round(power));
}

function roll(rng: Rng, chance: number): boolean {
  return chance >= 100 || rng.int(1, 100) <= chance;
}

function applyStage(
  target: BattlePokemon,
  side: SideIndex,
  effect: Extract<MoveEffect, { kind: 'stage' }>,
  events: BattleEvent[],
): boolean {
  if (target.hp <= 0) return false;
  const applied = changeStage(target.stages, effect.stat, effect.delta);
  if (applied === 0) return false;
  events.push({ t: 'stage', side, name: target.name, stat: effect.stat, delta: applied });
  return true;
}

function applyConfusion(target: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]): boolean {
  if (target.hp <= 0 || target.confusion > 0) return false;
  target.confusion = rng.int(3, 5);
  events.push({ t: 'confused', side, name: target.name });
  return true;
}

function cleanse(pokemon: BattlePokemon, side: SideIndex, ratio: number, events: BattleEvent[]): boolean {
  let did = false;
  if (pokemon.status !== null) {
    pokemon.status = null;
    pokemon.sleepTurns = 0;
    events.push({ t: 'cure', side, name: pokemon.name });
    did = true;
  }
  return heal(pokemon, side, Math.floor(pokemon.stats.hp * ratio), events) || did;
}

function useShield(attacker: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]) {
  const success = attacker.shieldStreak === 0 || rng.chance(0.5 ** attacker.shieldStreak);
  if (!success) {
    attacker.shieldStreak = 0;
    events.push({ t: 'noEffect', side });
    return;
  }
  attacker.shielded = true;
  attacker.shieldStreak += 1;
  events.push({ t: 'shield', side, name: attacker.name });
}

function targetsFoe(move: Move): boolean {
  return (
    move.category !== 'status' ||
    move.effects.some((e) => e.kind === 'status' || e.kind === 'confuse' || (e.kind === 'stage' && e.target === 'foe'))
  );
}

function executeMove(
  state: BattleState, side: SideIndex, moveIndex: number, rng: Rng, events: BattleEvent[], movedFirst: boolean,
) {
  const attacker = activeOf(state, side);
  const move = attacker.moves[moveIndex];
  const targetSide = other(side);
  const defender = activeOf(state, targetSide);
  if (!effectOf(move, 'shield')) attacker.shieldStreak = 0;
  events.push({ t: 'move', side, name: attacker.name, moveName: move.name });

  if (effectOf(move, 'charge') && attacker.charging === null) {
    attacker.charging = moveIndex;
    events.push({ t: 'charge', side, name: attacker.name });
    return;
  }
  attacker.charging = null;

  if (effectOf(move, 'shield')) {
    useShield(attacker, side, rng, events);
    return;
  }
  if (targetsFoe(move) && defender.shielded) {
    events.push({ t: 'shieldBlock', side: targetSide, name: defender.name });
    return;
  }
  if (move.accuracy !== 0 && rng.int(1, 100) > move.accuracy) {
    events.push({ t: 'miss', side });
    return;
  }

  if (move.category === 'status') {
    const immune = typeEffectiveness(move.type, defender.types) === 0;
    let worked = false;
    for (const effect of move.effects) {
      if (effect.kind === 'heal') worked = heal(attacker, side, Math.floor(attacker.stats.hp * effect.ratio), events) || worked;
      if (effect.kind === 'cleanse') worked = cleanse(attacker, side, effect.healRatio, events) || worked;
      if (effect.kind === 'status' && !immune) worked = applyStatus(defender, targetSide, effect.status, rng, events) || worked;
      if (effect.kind === 'confuse' && !immune) worked = applyConfusion(defender, targetSide, rng, events) || worked;
      if (effect.kind === 'stage') {
        const toSelf = effect.target === 'self';
        if (toSelf || !immune) worked = applyStage(toSelf ? attacker : defender, toSelf ? side : targetSide, effect, events) || worked;
      }
    }
    if (!worked && move.effects.length > 0) events.push({ t: 'noEffect', side });
    return;
  }

  if (typeEffectiveness(move.type, defender.types) === 0) {
    events.push({ t: 'noEffect', side });
    return;
  }

  const percent = effectOf(move, 'percent');
  const power = movePower(move, attacker, defender, rng);
  const criticalChance = effectOf(move, 'crit') ? HIGH_CRITICAL_CHANCE : undefined;
  if (effectOf(move, 'delayed')) {
    const { damage } = computeDamage(attacker, defender, move, rng, { power, criticalChance });
    state.delayed.push({ targetSide, amount: damage, userName: attacker.name, moveName: move.name, turnsLeft: 2 });
    events.push({ t: 'delayedSet', side, name: attacker.name, moveName: move.name });
    return;
  }
  const hits = effectOf(move, 'multiHit')?.hits ?? 1;
  let total = 0;
  let landed = 0;
  for (let i = 0; i < hits && defender.hp > 0; i++) {
    let amount: number;
    let effectiveness = typeEffectiveness(move.type, defender.types);
    let critical = false;
    if (percent) {
      amount = Math.max(1, Math.floor(defender.hp * percent.ratio));
    } else {
      const result = computeDamage(attacker, defender, move, rng, { power, criticalChance });
      amount = result.damage;
      effectiveness = result.effectiveness;
      critical = result.critical;
    }
    const dealt = Math.min(amount, defender.hp);
    defender.hp -= dealt;
    total += dealt;
    landed += 1;
    events.push({ t: 'damage', side: targetSide, amount: dealt, hp: defender.hp, effectiveness, critical });
  }
  if (landed > 1) events.push({ t: 'hits', count: landed });
  defender.hitThisTurn = true;
  if (defender.hp <= 0) events.push({ t: 'faint', side: targetSide, name: defender.name });

  for (const effect of move.effects) {
    if (effect.kind === 'drain') heal(attacker, side, Math.floor(total * effect.ratio), events);
    if (effect.kind === 'recoil') {
      const amount = Math.min(Math.max(1, Math.floor(total * effect.ratio)), attacker.hp);
      attacker.hp -= amount;
      events.push({ t: 'recoil', side, name: attacker.name, amount, hp: attacker.hp });
      if (attacker.hp <= 0) events.push({ t: 'faint', side, name: attacker.name });
    }
    if (effect.kind === 'status' && defender.hp > 0 && roll(rng, effect.chance)) {
      applyStatus(defender, targetSide, effect.status, rng, events);
    }
    if (effect.kind === 'confuse' && defender.hp > 0 && roll(rng, effect.chance)) {
      applyConfusion(defender, targetSide, rng, events);
    }
    if (effect.kind === 'flinch' && movedFirst && defender.hp > 0 && roll(rng, effect.chance)) {
      defender.flinched = true;
    }
    if (effect.kind === 'trap' && defender.hp > 0 && defender.trapped === 0) {
      defender.trapped = effect.turns + 1;
      events.push({ t: 'trap', side: targetSide, name: defender.name });
    }
    if (effect.kind === 'pivot' && attacker.hp > 0) {
      state.pivoting[side] = true;
      events.push({ t: 'pivot', side, name: attacker.name });
    }
    if (effect.kind === 'stage') {
      const toSelf = effect.target === 'self';
      const target = toSelf ? attacker : defender;
      if (target.hp > 0 && roll(rng, effect.chance)) applyStage(target, toSelf ? side : targetSide, effect, events);
    }
  }
}

function deliverDelayed(state: BattleState, events: BattleEvent[]) {
  const remaining: DelayedHit[] = [];
  for (const hit of state.delayed) {
    hit.turnsLeft -= 1;
    if (hit.turnsLeft > 0) {
      remaining.push(hit);
      continue;
    }
    const target = activeOf(state, hit.targetSide);
    if (target.hp <= 0) continue;
    const amount = Math.min(hit.amount, target.hp);
    target.hp -= amount;
    events.push({ t: 'delayedHit', side: hit.targetSide, name: target.name, moveName: hit.moveName, amount, hp: target.hp });
    if (target.hp <= 0) events.push({ t: 'faint', side: hit.targetSide, name: target.name });
  }
  state.delayed = remaining;
}

function endOfTurnDamage(state: BattleState, side: SideIndex, events: BattleEvent[]) {
  const pokemon = activeOf(state, side);
  if (pokemon.hp <= 0 || (pokemon.status !== 'poison' && pokemon.status !== 'burn')) return;
  const divisor = pokemon.status === 'poison' ? 8 : 16;
  const amount = Math.min(Math.max(1, Math.floor(pokemon.stats.hp / divisor)), pokemon.hp);
  pokemon.hp -= amount;
  events.push({ t: 'statusDamage', side, name: pokemon.name, status: pokemon.status, amount, hp: pokemon.hp });
  if (pokemon.hp <= 0) events.push({ t: 'faint', side, name: pokemon.name });
}

function hasLivingPokemon(state: BattleState, side: SideIndex): boolean {
  return state.sides[side].team.some((pokemon) => pokemon.hp > 0);
}

function settleFaints(state: BattleState, rng: Rng, events: BattleEvent[]) {
  const alive = [hasLivingPokemon(state, 0), hasLivingPokemon(state, 1)];
  if (!alive[0] || !alive[1]) {
    const winner: SideIndex = alive[0] ? 0 : alive[1] ? 1 : rng.chance(0.5) ? 0 : 1;
    state.winner = winner;
    state.pivoting = [false, false];
    events.push({ t: 'win', side: winner });
    return;
  }
  state.pendingSwitch = [0, 1].map((index) => {
    const side = index as SideIndex;
    return activeOf(state, side).hp <= 0 || (state.pivoting[side] && hasBench(state, side));
  }) as [boolean, boolean];
  state.pivoting = [false, false];
}

export function resolveTurn(previous: BattleState, actions: [Action, Action]): TurnResult {
  const state = structuredClone(previous);
  const rng = createRng(state.rngState);
  const events: BattleEvent[] = [];
  for (const side of [0, 1] as const) activeOf(state, side).hitThisTurn = false;

  const acts: [Action, Action] = [normalizeAction(state, 0, actions[0]), normalizeAction(state, 1, actions[1])];
  const order = actionOrder(state, acts, rng);
  for (const side of order) {
    const action = acts[side];
    if (action.kind === 'switch') {
      switchIn(state, side, action.teamIndex, events);
      continue;
    }
    if (action.kind === 'pass') continue;
    const attacker = activeOf(state, side);
    if (attacker.hp <= 0 || activeOf(state, other(side)).hp <= 0) continue;
    if (canAct(attacker, side, rng, events)) {
      executeMove(state, side, action.moveIndex, rng, events, side === order[0]);
    }
  }

  deliverDelayed(state, events);
  endOfTurnDamage(state, 0, events);
  endOfTurnDamage(state, 1, events);
  for (const side of [0, 1] as const) {
    const pokemon = activeOf(state, side);
    pokemon.flinched = false;
    pokemon.shielded = false;
    pokemon.trapped = Math.max(0, pokemon.trapped - 1);
  }
  settleFaints(state, rng, events);
  state.turn += 1;
  state.rngState = rng.state;
  return { state, events };
}

export function resolveForcedSwitch(previous: BattleState, side: SideIndex, teamIndex: number): TurnResult {
  const state = structuredClone(previous);
  const events: BattleEvent[] = [];
  switchIn(state, side, teamIndex, events);
  state.pendingSwitch[side] = false;
  return { state, events };
}
