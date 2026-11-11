import type { Rarity } from '../data/types.ts';
import type { Status } from '../engine/types.ts';
import { MAX_CATCH_CHANCE, catchChance, ropeSequence, type RopeKind } from '../game/capture.ts';

/** 포켓몬 고식 로프 던지기. 순수 모델이고 화면은 CatchScreen */

export const RING_PERIOD_MS = 2400;
export const RING_MIN = 0.3;
/** 오디 원(지름 1)의 절반: 옆으로 이만큼(거리 대비 비율) 안이면 맞는다 */
export const HIT_HALF = 0.25;
/** 힘이 이 범위면 오디까지 닿는다(1이 딱 맞음) */
export const POWER_RANGE: [number, number] = [0.7, 1.4];
/** 위로 쓸어 던지는 속도(px/ms)가 이만하면 힘 1 */
export const IDEAL_SWIPE_SPEED = 1.5;
/** 스페이스를 이만큼(ms) 누르면 힘 1 */
export const IDEAL_HOLD_MS = 800;
export const FLEE_CHANCE = 0.1;

export type ThrowGrade = 'miss' | 'plain' | 'nice' | 'great' | 'excellent';
export const GRADE_BONUS: Record<ThrowGrade, number> = { miss: 0, plain: 1, nice: 1.3, great: 1.6, excellent: 2 };
export const GRADE_LABEL: Record<ThrowGrade, string> = { miss: '빗나갔다!', plain: '', nice: 'Nice!', great: 'Great!', excellent: 'Excellent!' };

/** 원의 크기(오디 크기 대비 0.3~1.0): 줄어들었다 커지기를 반복한다 */
export function ringScale(timeMs: number): number {
  const phase = (timeMs % RING_PERIOD_MS) / RING_PERIOD_MS;
  return RING_MIN + (1 - RING_MIN) * (0.5 + 0.5 * Math.cos(phase * 2 * Math.PI));
}

/** 등급에 따른 원 색: 초록=쉬움, 노랑, 빨강=어려움 */
export function ringColor(rarity: Rarity): string {
  if (rarity === 'Common') return '#3bd16f';
  if (rarity === 'Rare' || rarity === 'Epic') return '#f5c518';
  return '#ef4b3c';
}

export interface Aim {
  /** 옆으로 빗나간 정도(거리 대비, 0=정중앙) */
  lateral: number;
  /** 날아간 힘(1=딱 오디까지) */
  power: number;
}

/** 쓸어 던진 속도(px/ms, 위쪽이 음수)를 조준으로. 위로 던지지 않았으면 null */
export function aimFromSwipe(vx: number, vy: number): Aim | null {
  if (vy >= -0.2) return null;
  return { lateral: vx / -vy, power: -vy / IDEAL_SWIPE_SPEED };
}

/** 키보드: 누른 시간만큼 힘, 방향은 정면 */
export const aimFromHold = (holdMs: number): Aim => ({ lateral: 0, power: holdMs / IDEAL_HOLD_MS });

/** 던진 순간의 원 크기로 판정한다. 원 안에 들어가면 원이 작을수록 보너스 */
export function judgeThrow(aim: Aim, ring: number): ThrowGrade {
  const [lo, hi] = POWER_RANGE;
  if (aim.power < lo || aim.power > hi || Math.abs(aim.lateral) > HIT_HALF) return 'miss';
  if (Math.abs(aim.lateral) > HIT_HALF * ring) return 'plain';
  if (ring <= 0.45) return 'excellent';
  if (ring <= 0.7) return 'great';
  return 'nice';
}

/** 최종 포획률: 쓰러진 오디(체력 0)의 포획률 × 던지기 보너스, 상한 0.95 */
export function throwChance(rarity: Rarity, status: Status | null, rope: RopeKind, grade: ThrowGrade): number {
  return Math.min(MAX_CATCH_CHANCE, catchChance(rarity, 0, status, rope) * GRADE_BONUS[grade]);
}

export interface ThrowOutcome {
  grade: ThrowGrade;
  chance: number;
  /** 감싼 뒤 흔들린 횟수(빗나가면 0) */
  shakes: number;
  caught: boolean;
  /** 놓친 뒤 도망갔다 */
  fled: boolean;
}

/** 한 번 던지기. 빗나가면 로프만 잃고, 놓치면 10% 확률로 도망간다 */
export function resolveThrow(
  rarity: Rarity, status: Status | null, rope: RopeKind, aim: Aim, ring: number, rng: () => number = Math.random,
): ThrowOutcome {
  const grade = judgeThrow(aim, ring);
  if (grade === 'miss') return { grade, chance: 0, shakes: 0, caught: false, fled: false };
  const chance = throwChance(rarity, status, rope, grade);
  const seq = ropeSequence(chance, rng);
  return { grade, chance, shakes: seq.shakes, caught: seq.success, fled: !seq.success && rng() < FLEE_CHANCE };
}
