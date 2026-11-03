import type { Rng } from './rng.ts';
import { staged } from './stages.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { BattlePokemon, Move } from './types.ts';

const CRITICAL_CHANCE = 1 / 24;
export const HIGH_CRITICAL_CHANCE = 1 / 3;

export interface DamageResult {
  damage: number;
  effectiveness: number;
  critical: boolean;
}

export interface DamageOptions {
  power?: number;
  criticalChance?: number;
}

export function computeDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
  options: DamageOptions = {},
): DamageResult {
  const effectiveness = typeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) return { damage: 0, effectiveness: 0, critical: false };

  const physical = move.category === 'physical';
  const attack = staged(physical ? attacker.stats.atk : attacker.stats.spa, physical ? attacker.stages.atk : attacker.stages.spa);
  const defense = staged(physical ? defender.stats.def : defender.stats.spd, physical ? defender.stages.def : defender.stages.spd);
  const power = options.power ?? move.power;
  const levelFactor = Math.floor((2 * attacker.level) / 5 + 2);
  const base = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50) + 2;

  const critical = rng.chance(options.criticalChance ?? CRITICAL_CHANCE);
  let damage = base * (critical ? 1.5 : 1) * (rng.int(85, 100) / 100);
  if (attacker.types.includes(move.type)) damage *= 1.5;
  damage *= effectiveness;
  if (physical && attacker.status === 'burn') damage *= 0.5;

  return { damage: Math.max(1, Math.floor(damage)), effectiveness, critical };
}

/** 혼란에 빠진 오디가 자신을 때리는 피해. 위력 40의 물리 공격이고 난수가 없다 */
export function confusionDamage(pokemon: BattlePokemon): number {
  const attack = staged(pokemon.stats.atk, pokemon.stages.atk);
  const defense = staged(pokemon.stats.def, pokemon.stages.def);
  const levelFactor = Math.floor((2 * pokemon.level) / 5 + 2);
  return Math.max(1, Math.floor(Math.floor((levelFactor * 40 * attack) / defense) / 50) + 2);
}
