import type { Rarity } from '../data/types.ts';
import type { Status } from '../engine/types.ts';

export type RopeKind = 'basic' | 'sturdy';

export const ROPE_NAMES: Record<RopeKind, string> = { basic: '로프', sturdy: '튼튼한 로프' };

/** 등급별 기본 포획률 */
export const RARITY_CATCH_RATE: Record<Rarity, number> = {
  Common: 0.6, Rare: 0.45, Epic: 0.3, Legendary: 0.15, Secret: 0.08, '???': 0.04,
};

export const ROPE_MULTIPLIER: Record<RopeKind, number> = { basic: 1, sturdy: 1.8 };
export const STATUS_MULTIPLIER = 1.3;
export const MAX_CATCH_CHANCE = 0.95;

/** 체력이 낮을수록(최대 ×2), 상태이상이면(×1.3), 튼튼한 로프면(×1.8) 잘 잡힌다. 상한 0.95 */
export function catchChance(rarity: Rarity, hpRatio: number, status: Status | null, rope: RopeKind): number {
  const ratio = Math.min(1, Math.max(0, hpRatio));
  const chance = RARITY_CATCH_RATE[rarity]
    * (1 + (1 - ratio))
    * (status ? STATUS_MULTIPLIER : 1)
    * ROPE_MULTIPLIER[rope];
  return Math.min(MAX_CATCH_CHANCE, chance);
}

/** rng는 0 이상 1 미만을 돌려주는 함수 (테스트에서 고정값을 넣는다) */
export function tryCatch(
  rarity: Rarity, hpRatio: number, status: Status | null, rope: RopeKind, rng: () => number = Math.random,
): { success: boolean; chance: number } {
  const chance = catchChance(rarity, hpRatio, status, rope);
  return { success: rng() < chance, chance };
}
