import { describe, expect, it } from 'vitest';
import { catchChance } from '../game/capture.ts';
import {
  IDEAL_HOLD_MS, IDEAL_SWIPE_SPEED, RING_MIN, RING_PERIOD_MS,
  aimFromHold, aimFromSwipe, judgeThrow, resolveThrow, ringScale, throwChance,
} from './throw.ts';

describe('원', () => {
  it('1.0에서 줄어들었다(0.3) 다시 커진다', () => {
    expect(ringScale(0)).toBeCloseTo(1);
    expect(ringScale(RING_PERIOD_MS / 2)).toBeCloseTo(RING_MIN);
    expect(ringScale(RING_PERIOD_MS)).toBeCloseTo(1);
    for (let t = 0; t < RING_PERIOD_MS; t += 100) {
      expect(ringScale(t)).toBeGreaterThanOrEqual(RING_MIN - 1e-9);
      expect(ringScale(t)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('던지기 판정', () => {
  const straight = aimFromSwipe(0, -IDEAL_SWIPE_SPEED)!;
  it('아래로 쓸면 던지지 않는다', () => expect(aimFromSwipe(0, 0.5)).toBeNull());
  it('정면으로 힘 1이면 원 크기로 등급', () => {
    expect(judgeThrow(straight, 1)).toBe('nice');
    expect(judgeThrow(straight, 0.6)).toBe('great');
    expect(judgeThrow(straight, 0.35)).toBe('excellent');
  });
  it('힘이 모자라거나 넘치거나 옆으로 새면 빗나감', () => {
    expect(judgeThrow({ lateral: 0, power: 0.5 }, 1)).toBe('miss');
    expect(judgeThrow({ lateral: 0, power: 2 }, 1)).toBe('miss');
    expect(judgeThrow(aimFromSwipe(1, -1.5)!, 1)).toBe('miss');
  });
  it('오디에는 맞았지만 원 밖이면 보너스 없음', () => {
    expect(judgeThrow({ lateral: 0.2, power: 1 }, 0.4)).toBe('plain');
  });
  it('키보드: 누른 시간이 힘', () => {
    expect(aimFromHold(IDEAL_HOLD_MS).power).toBe(1);
    expect(judgeThrow(aimFromHold(200), 1)).toBe('miss');
  });
});

describe('포획률과 결과', () => {
  it('보너스를 곱하고 0.95를 넘지 않는다', () => {
    const base = catchChance('Legendary', 0, null, 'basic');
    expect(throwChance('Legendary', null, 'basic', 'plain')).toBeCloseTo(base);
    expect(throwChance('Legendary', null, 'basic', 'nice')).toBeCloseTo(base * 1.3);
    expect(throwChance('Legendary', null, 'basic', 'great')).toBeCloseTo(base * 1.6);
    expect(throwChance('Legendary', null, 'basic', 'excellent')).toBeCloseTo(base * 2);
    expect(throwChance('Common', 'sleep', 'sturdy', 'excellent')).toBe(0.95);
  });
  it('빗나가면 흔들림 없이 끝', () => {
    expect(resolveThrow('Common', null, 'basic', { lateral: 0, power: 0.1 }, 1, () => 0)).toMatchObject({ grade: 'miss', shakes: 0, caught: false, fled: false });
  });
  it('난수가 작으면 3번 흔들리고 잡힌다', () => {
    expect(resolveThrow('Rare', null, 'basic', { lateral: 0, power: 1 }, 1, () => 0)).toMatchObject({ shakes: 3, caught: true, fled: false });
  });
  it('놓치면 10% 확률로 도망', () => {
    const seq = (values: number[]) => () => values.shift() ?? 0;
    // 첫 흔들림에서 풀림(0.99), 도망 굴림 0.05 < 0.1
    expect(resolveThrow('Secret', null, 'basic', { lateral: 0, power: 1 }, 1, seq([0.99, 0.05]))).toMatchObject({ shakes: 1, caught: false, fled: true });
    expect(resolveThrow('Secret', null, 'basic', { lateral: 0, power: 1 }, 1, seq([0.99, 0.5]))).toMatchObject({ caught: false, fled: false });
  });
});
