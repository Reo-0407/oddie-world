import type { TypeName } from '../engine/types.ts';

/** 실제 시계에 맞춘 낮과 밤 */
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export const PHASE_ICON: Record<DayPhase, string> = { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' };
export const PHASE_NAME: Record<DayPhase, string> = { dawn: '새벽', day: '낮', dusk: '저녁', night: '밤' };

/** hour는 0~24(소수 = 분) */
export function dayPhase(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 7.5) return 'dawn';
  if (h >= 7.5 && h < 16.5) return 'day';
  if (h >= 16.5 && h < 19.5) return 'dusk';
  return 'night';
}

export interface Tint { r: number; g: number; b: number; a: number }
/** 시각별 화면 색(사이는 부드럽게 섞는다): 새벽 주황, 낮 그대로, 저녁 보라, 밤 짙은 파랑 */
const KEYS: [number, Tint][] = [
  [0, { r: 16, g: 24, b: 72, a: 0.42 }],
  [4.5, { r: 16, g: 24, b: 72, a: 0.42 }],
  [6, { r: 255, g: 140, b: 60, a: 0.16 }],
  [7.5, { r: 255, g: 200, b: 140, a: 0 }],
  [16.5, { r: 255, g: 200, b: 140, a: 0 }],
  [18, { r: 120, g: 60, b: 160, a: 0.24 }],
  [19.5, { r: 16, g: 24, b: 72, a: 0.42 }],
  [24, { r: 16, g: 24, b: 72, a: 0.42 }],
];

export function skyTint(hour: number): Tint {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < KEYS.length; i += 1) {
    const [h1, b] = KEYS[i];
    if (h > h1) continue;
    const [h0, a] = KEYS[i - 1];
    const k = h1 === h0 ? 1 : (h - h0) / (h1 - h0);
    const mix = (x: number, y: number) => x + (y - x) * k;
    return { r: Math.round(mix(a.r, b.r)), g: Math.round(mix(a.g, b.g)), b: Math.round(mix(a.b, b.b)), a: mix(a.a, b.a) };
  }
  return KEYS[0][1];
}

/** 밤에는 고스트·악 타입이 두 배로, 낮에는 절반만 나온다 */
export function timeWeight(types: readonly TypeName[], phase: DayPhase): number {
  if (!types.some((t) => t === 'ghost' || t === 'dark')) return 1;
  return phase === 'night' ? 2 : phase === 'day' ? 0.5 : 1;
}

let override: number | null = null;
/** 개발용: 시각을 고정한다(null이면 실제 시계) */
export function setHourOverride(hour: number | null) { override = hour; }
export function nowHour(date = new Date()): number {
  return override ?? date.getHours() + date.getMinutes() / 60;
}
