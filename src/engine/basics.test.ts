import { describe, expect, test } from 'vitest';
import { createRng } from './rng.ts';
import { calcStats } from './stats.ts';
import { typeEffectiveness } from './typeChart.ts';

describe('createRng', () => {
  test('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  test('저장한 state에서 이어가면 같은 수가 나온다', () => {
    const a = createRng(7);
    a.next();
    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  test('int는 양 끝을 포함한 범위 안의 값을 준다', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(85, 100);
      expect(n).toBeGreaterThanOrEqual(85);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});

describe('typeEffectiveness', () => {
  test('약점, 반감, 무효, 복합 타입', () => {
    expect(typeEffectiveness('water', ['fire'])).toBe(2);
    expect(typeEffectiveness('water', ['grass'])).toBe(0.5);
    expect(typeEffectiveness('electric', ['ground'])).toBe(0);
    expect(typeEffectiveness('normal', ['fire'])).toBe(1);
    expect(typeEffectiveness('electric', ['water', 'flying'])).toBe(4);
    expect(typeEffectiveness('ground', ['fire', 'flying'])).toBe(0);
  });
});

describe('calcStats', () => {
  test('레벨 50 피카츄의 종족값 계산', () => {
    const stats = calcStats({ hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 }, 50);
    expect(stats).toEqual({ hp: 95, atk: 60, def: 45, spa: 55, spd: 55, spe: 95 });
  });
});
