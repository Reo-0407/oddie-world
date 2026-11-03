import { describe, expect, test } from 'vitest';
import { computeDamage } from './damage.ts';
import type { Rng } from './rng.ts';
import { mon, tackle } from './testkit.ts';

/** 급소 없음, 난수 최대(100%)로 고정 */
const noCrit: Rng = { next: () => 0, int: (_min, max) => max, chance: () => false, state: 0 };
const alwaysCrit: Rng = { ...noCrit, chance: () => true };

const fighter = mon({ types: ['ground'] });
const target = mon({ types: ['ground'] });
const hit = tackle({ power: 80 });

describe('computeDamage', () => {
  test('기본 공식: 레벨 50, 위력 80, 공방 같음', () => {
    expect(computeDamage(fighter, target, hit, noCrit).damage).toBe(37);
  });

  test('자속 보정 1.5배', () => {
    const attacker = mon({ types: ['normal'] });
    expect(computeDamage(attacker, target, hit, noCrit).damage).toBe(55);
  });

  test('타입 약점 2배', () => {
    const result = computeDamage(fighter, mon({ types: ['ice'] }), tackle({ power: 80, type: 'fire' }), noCrit);
    expect(result).toEqual({ damage: 74, effectiveness: 2, critical: false });
  });

  test('무효면 0', () => {
    const result = computeDamage(fighter, target, tackle({ power: 80, type: 'electric' }), noCrit);
    expect(result).toEqual({ damage: 0, effectiveness: 0, critical: false });
  });

  test('화상은 물리 공격만 반감', () => {
    const burned = mon({ types: ['ground'], status: 'burn' });
    expect(computeDamage(burned, target, hit, noCrit).damage).toBe(18);
    expect(computeDamage(burned, target, tackle({ power: 80, category: 'special' }), noCrit).damage).toBe(37);
  });

  test('특수기는 특공과 특방을 쓴다', () => {
    const smart = mon({ types: ['ground'], stats: { hp: 100, atk: 1, def: 100, spa: 200, spd: 100, spe: 100 } });
    expect(computeDamage(smart, target, tackle({ power: 80, category: 'special' }), noCrit).damage).toBe(72);
  });

  test('급소 1.5배', () => {
    const result = computeDamage(fighter, target, hit, alwaysCrit);
    expect(result.damage).toBe(55);
    expect(result.critical).toBe(true);
  });

  test('최소 1', () => {
    const weak = mon({ types: ['ground'], level: 1, stats: { hp: 10, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } });
    const wall = mon({ types: ['ground'], stats: { hp: 100, atk: 1, def: 500, spa: 1, spd: 1, spe: 1 } });
    expect(computeDamage(weak, wall, tackle({ power: 10, type: 'rock' }), noCrit).damage).toBeGreaterThanOrEqual(1);
  });
});
