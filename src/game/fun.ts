import type { Ropes } from './save.ts';

// ---------- 반짝이 오디 ----------
export const SHINY_ODDS = 1 / 64;
/** 연속 잡기 한 번마다 반짝이 확률 +10%, 최대 두 배 */
export function shinyChance(combo = 0, mult = 1): number {
  return SHINY_ODDS * (1 + Math.min(10, Math.max(0, combo)) * 0.1) * mult;
}
export const rollShiny = (rand: () => number, combo = 0, mult = 1) => rand() < shinyChance(combo, mult);

// ---------- 잡기 연속 보너스 ----------
export interface Combo { speciesId: number; count: number }

/** 같은 종을 또 잡으면 +1, 다른 종이면 1부터 */
export function nextCombo(prev: Combo | undefined, speciesId: number): Combo {
  return prev && prev.speciesId === speciesId ? { speciesId, count: prev.count + 1 } : { speciesId, count: 1 };
}

/** 2연속부터 보너스: 코인·경험치(상한 있음) */
export function comboBonus(count: number): { coins: number; exp: number } | null {
  if (count < 2) return null;
  const k = Math.min(count - 1, 9);
  return { coins: 15 * k, exp: 8 * k };
}

// ---------- 필드 레벨 표 ----------
export type LevelTag = 'red' | 'yellow' | 'green';
/** 내 선두보다 3 이상 높으면 빨강, ±2 안이면 노랑, 더 낮으면 초록 */
export function levelTag(wildLevel: number, leadLevel: number): LevelTag {
  const d = wildLevel - leadLevel;
  if (d >= 3) return 'red';
  if (d >= -2) return 'yellow';
  return 'green';
}

// ---------- 오디 센터 무료 로프 ----------
export const NURSE_ROPES = 3;
/** 로프가 하나도 없고 이번 방문에 아직 안 받았으면 준다(갇히지 않게) */
export const nurseGivesRopes = (ropes: Ropes, givenThisVisit: boolean) => !givenThisVisit && ropes.basic + ropes.sturdy === 0;
