import { activeOf, effectOf, isStatusImmune } from './turn.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { Action, BattlePokemon, BattleState, Move, SideIndex } from './types.ts';

const STATUS_MOVE_SCORE = 60;
const BUFF_SCORE = 50;
const FIXED_PERCENT_POWER = 70;

function attackScore(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const accuracy = move.accuracy === 0 ? 1 : move.accuracy / 100;
  const matchup = typeEffectiveness(move.type, defender.types);
  let power = move.power;
  const gamble = effectOf(move, 'gamble');
  if (gamble) power *= (gamble.min + gamble.max) / 2;
  if (effectOf(move, 'percent')) power = FIXED_PERCENT_POWER;
  const hits = effectOf(move, 'multiHit')?.hits ?? 1;
  let score = power * hits * stab * accuracy * matchup;
  if (effectOf(move, 'recoil')) score *= 0.85;
  if (effectOf(move, 'delayed')) score *= 0.8;
  if (effectOf(move, 'charge')) score *= 0.5;
  if (effectOf(move, 'punish') && defender.status !== null) score *= 1.6;
  return score;
}

function statusScore(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  let best = 0;
  for (const effect of move.effects) {
    let score = 0;
    if (effect.kind === 'status') {
      score = defender.status === null && !isStatusImmune(defender.types, effect.status) ? STATUS_MOVE_SCORE : 0;
    }
    if (effect.kind === 'confuse') score = defender.confusion === 0 ? BUFF_SCORE : 0;
    if (effect.kind === 'heal') score = attacker.hp * 2 < attacker.stats.hp ? STATUS_MOVE_SCORE + 10 : 0;
    if (effect.kind === 'cleanse') score = attacker.status !== null || attacker.hp * 2 < attacker.stats.hp ? BUFF_SCORE : 0;
    if (effect.kind === 'shield') score = attacker.shieldStreak === 0 ? 20 : 0;
    if (effect.kind === 'stage') {
      const target = effect.target === 'self' ? attacker : defender;
      const current = target.stages[effect.stat];
      const useful = effect.delta > 0 ? current < 2 : current > -2;
      score = useful ? BUFF_SCORE : 0;
    }
    best = Math.max(best, score);
  }
  return best;
}

export function chooseAiAction(state: BattleState, side: SideIndex): Action {
  const attacker = activeOf(state, side);
  const defender = activeOf(state, side === 0 ? 1 : 0);
  if (attacker.charging !== null) return { kind: 'move', moveIndex: attacker.charging };
  let moveIndex = 0;
  let best = -1;
  attacker.moves.forEach((move, index) => {
    const score = move.category === 'status' ? statusScore(attacker, defender, move) : attackScore(attacker, defender, move);
    if (score > best) {
      best = score;
      moveIndex = index;
    }
  });
  return { kind: 'move', moveIndex };
}

export function chooseAiSwitch(state: BattleState, side: SideIndex): number {
  return state.sides[side].team.findIndex((pokemon, index) => index !== state.sides[side].active && pokemon.hp > 0);
}
