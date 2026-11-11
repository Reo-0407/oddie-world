import type { LearnEntry, Rarity } from '../data/types.ts';

export const MAX_LEVEL = 50;

const EXP_MULTIPLIER: Record<Rarity, number> = {
  Common: 1, Rare: 1.2, Epic: 1.5, Legendary: 2, Secret: 2.5, '???': 3,
};

/** 다음 레벨까지 필요한 경험치 */
export function expToNext(level: number): number {
  return Math.floor(level * level * 1.2) + 10;
}

/** 쓰러뜨린 상대의 레벨과 등급으로 받는 경험치 (레벨 5 스타터가 길 야생·트레이너만으로 챔피언 Lv 32~35까지 자랄 수 있게 12배) */
export function gainExp(defeatedLevel: number, rarity: Rarity): number {
  return Math.round(defeatedLevel * 12 * EXP_MULTIPLIER[rarity]);
}

/** 이겼을 때 받는 코인 */
export function coinReward(defeatedLevel: number, rarity: Rarity): number {
  return Math.round(defeatedLevel * 4 * EXP_MULTIPLIER[rarity]);
}

export interface ExpResult {
  level: number;
  exp: number;
  /** 이번에 새로 배우는 기술 번호 */
  newMoveIds: number[];
}

/** 경험치를 더해 레벨업을 처리한다. 새 기술은 learnset 기준으로 (예전 레벨, 새 레벨] 구간 */
export function applyExp(level: number, exp: number, gained: number, learnset: readonly LearnEntry[]): ExpResult {
  let current = level;
  let total = exp + gained;
  while (current < MAX_LEVEL && total >= expToNext(current)) {
    total -= expToNext(current);
    current += 1;
  }
  if (current >= MAX_LEVEL) total = 0;
  const newMoveIds = learnset
    .filter((entry) => entry.level > level && entry.level <= current)
    .map((entry) => entry.moveId);
  return { level: current, exp: total, newMoveIds };
}
