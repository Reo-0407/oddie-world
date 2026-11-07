import { staged } from './stages.ts';
import { activeOf, effectOf, isStatusImmune } from './turn.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { Action, BattlePokemon, BattleState, Move, SideIndex } from './types.ts';

/*
 * 점수는 모두 "위력 × 자속 × 상성" 크기(보통 80~250)에 맞춘다.
 * 그래야 변화 기술과 선공/보복 같은 효과가 상황이 맞을 때 공격 기술과 겨룰 수 있다.
 */
const FIXED_PERCENT_POWER = 120; // 상대 체력의 40%는 위력 80짜리 한 방의 1.5배쯤

const hpRatio = (pokemon: BattlePokemon) => pokemon.hp / pokemon.stats.hp;

function speedOf(pokemon: BattlePokemon): number {
  const speed = staged(pokemon.stats.spe, pokemon.stages.spe);
  return pokemon.status === 'paralysis' ? Math.floor(speed / 2) : speed;
}

function attackScore(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const accuracy = move.accuracy === 0 ? 1 : move.accuracy / 100;
  const matchup = typeEffectiveness(move.type, defender.types);
  const defenderRatio = hpRatio(defender);
  let power = move.power;
  const gamble = effectOf(move, 'gamble');
  if (gamble) power *= (gamble.min + gamble.max) / 2;
  // 비례 피해는 상대 현재 체력에 비례하므로 상대가 멀쩡할수록 값어치가 있다
  if (effectOf(move, 'percent')) power = FIXED_PERCENT_POWER * Math.min(1, 0.4 + defenderRatio);
  // 역전: 내 체력이 낮을수록 위력이 오른다
  if (effectOf(move, 'lowHp')) power *= 1 + 0.6 * (1 - hpRatio(attacker));
  const hits = effectOf(move, 'multiHit')?.hits ?? 1;
  let score = power * hits * stab * accuracy * matchup;

  const faster = speedOf(attacker) > speedOf(defender);
  // 선공: 먼저 때릴 수 있고, 상대가 낮은 체력이면 마무리로 값어치가 크다
  if (move.priority > 0) score *= defenderRatio < 0.35 ? 1.8 : faster ? 1.1 : 1.3;
  if (move.priority < 0) score *= 0.9;
  if (effectOf(move, 'crit')) score *= 1.25;
  // 보복: 내가 느려서 먼저 맞은 뒤에 움직일 때 위력이 2배가 된다
  if (effectOf(move, 'revenge')) score *= faster ? 0.85 : 1.7;
  if (effectOf(move, 'flinch') && faster) score *= 1.15;
  if (effectOf(move, 'drain')) score *= 1 + 0.2 * (1 - hpRatio(attacker));
  if (effectOf(move, 'trap')) score *= 1.1;
  if (effectOf(move, 'pivot')) score *= 0.9;
  if (effectOf(move, 'recoil')) score *= 0.85;
  if (effectOf(move, 'delayed')) score *= 0.8;
  if (effectOf(move, 'charge')) score *= 0.5;
  if (effectOf(move, 'punish') && defender.status !== null) score *= 1.6;
  for (const effect of move.effects) {
    // 쓰고 나서 내 능력이 떨어지는 기술(무리)은 조금 깎는다
    if (effect.kind === 'stage' && effect.target === 'self' && effect.delta < 0) score *= 0.85;
  }
  return score;
}

function statusScore(state: BattleState, side: SideIndex, attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  const myRatio = hpRatio(attacker);
  const foeRatio = hpRatio(defender);
  const hasPhysical = attacker.moves.some((m) => m.category === 'physical' && m.power > 0);
  const hasSpecial = attacker.moves.some((m) => m.category === 'special' && m.power > 0);
  // 기술 타입이 상대에게 무효이면 상대를 향한 변화 효과(상태이상, 혼란, 능력 낮추기)는 막힌다
  const blocked = typeEffectiveness(move.type, defender.types) === 0;
  let best = 0;
  for (const effect of move.effects) {
    let score = 0;
    if (effect.kind === 'status') {
      if (!blocked && defender.status === null && !isStatusImmune(defender.types, effect.status)) {
        const base = { sleep: 120, paralysis: 95, poison: 90, burn: 95 }[effect.status];
        score = base * (0.4 + 0.6 * foeRatio);
        if (effect.status === 'paralysis' && speedOf(attacker) <= speedOf(defender)) score *= 1.2;
      }
    }
    if (effect.kind === 'confuse') score = !blocked && defender.confusion === 0 ? 80 * (0.5 + 0.5 * foeRatio) : 0;
    if (effect.kind === 'heal') score = myRatio < 0.35 ? 150 : myRatio < 0.5 ? 120 : myRatio < 0.7 ? 50 : 0;
    if (effect.kind === 'cleanse') {
      score = attacker.status !== null ? (myRatio < 0.5 ? 140 : 100) : myRatio < 0.5 ? 100 : 0;
    }
    if (effect.kind === 'shield') {
      if (attacker.shieldStreak > 0) score = 0;
      else if (defender.charging !== null) score = 180; // 충전하는 상대의 큰 공격을 막는다
      else if (state.delayed.some((hit) => hit.targetSide === side)) score = 170;
      else score = 45;
    }
    if (effect.kind === 'stage') {
      if (effect.target === 'self' && effect.delta > 0) {
        const current = attacker.stages[effect.stat];
        const relevance = effect.stat === 'atk' ? (hasPhysical ? 1 : 0.2)
          : effect.stat === 'spa' ? (hasSpecial ? 1 : 0.2)
          : effect.stat === 'spe' ? (speedOf(attacker) < speedOf(defender) ? 1 : 0.5)
          : 0.8;
        let base = (effect.delta >= 2 ? 135 : 80) * relevance * (1 - 0.15 * Math.max(0, current));
        if (current >= 4) base = 0;
        if (myRatio < 0.4) base *= 0.5; // 위험할 때는 올릴 시간이 없다
        if (foeRatio < 0.3) base *= 0.5; // 상대가 곧 쓰러지면 굳이
        score = base;
      }
      if (effect.target === 'foe' && effect.delta < 0 && !blocked) {
        const current = defender.stages[effect.stat];
        let base = effect.delta <= -2 ? 130 : 75;
        if (current <= -4) base = 0;
        if (foeRatio < 0.3) base *= 0.5;
        score = base;
      }
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
    const score = move.category === 'status'
      ? statusScore(state, side, attacker, defender, move)
      : attackScore(attacker, defender, move);
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
