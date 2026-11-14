import type { Rarity } from '../data/types.ts';
import type { Status } from '../engine/types.ts';

/** golden: 레이드에서만 주는 황금 로프(저장하지 않는다) */
export type RopeKind = 'basic' | 'sturdy' | 'golden';

export const ROPE_NAMES: Record<RopeKind, string> = { basic: '로프', sturdy: '튼튼한 로프', golden: '황금 로프' };

/** 등급별 기본 포획률 */
export const RARITY_CATCH_RATE: Record<Rarity, number> = {
  Common: 0.6, Rare: 0.45, Epic: 0.3, Legendary: 0.15, Secret: 0.08, '???': 0.04,
};

export const ROPE_MULTIPLIER: Record<RopeKind, number> = { basic: 1, sturdy: 1.8, golden: 2 };
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

/** 필드에서 전투 없이 바로 던질 때는 확률이 반으로 줄어든다 */
export const FIELD_THROW_MULTIPLIER = 0.5;

export function fieldCatchChance(rarity: Rarity, hpRatio: number, status: Status | null, rope: RopeKind): number {
  return catchChance(rarity, hpRatio, status, rope) * FIELD_THROW_MULTIPLIER;
}

export interface RopeSequence {
  /** 로프가 흔들리는 횟수 (1~3). 성공이면 항상 3 */
  shakes: number;
  success: boolean;
}

/**
 * 로프가 오디를 감싼 뒤 세 번 흔들린다. 흔들릴 때마다 chance의 세제곱근 확률로 버티고,
 * 세 번 다 버티면 잡힌다(전체 확률 = chance). 중간에 못 버티면 그 흔들림에서 풀려난다.
 * forceSuccess는 첫 전투(튜토리얼)용 100% 성공.
 */
export function ropeSequence(chance: number, rng: () => number = Math.random, forceSuccess = false): RopeSequence {
  if (forceSuccess) return { shakes: 3, success: true };
  const hold = Math.cbrt(Math.min(1, Math.max(0, chance)));
  for (let shake = 1; shake <= 3; shake += 1) {
    if (rng() >= hold) return { shakes: shake, success: false };
  }
  return { shakes: 3, success: true };
}
