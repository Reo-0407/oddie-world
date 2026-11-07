import { describe, expect, test } from 'vitest';
import { computeDamage, HIGH_CRITICAL_CHANCE } from './damage.ts';
import type { Rng } from './rng.ts';
import { battle, mon, tackle } from './testkit.ts';
import { movePower, resolveTurn } from './turn.ts';
import type { Action, MoveEffect } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const rngWith = (next: number): Rng => ({ next: () => next, int: (_min, max) => max, chance: () => false, state: 0 });
const base = (effects: MoveEffect[]) => tackle({ power: 80, effects });

describe('위력 보정', () => {
  test('역전: 체력이 낮을수록 세다', () => {
    const attacker = mon({ hp: 25 });
    expect(movePower(base([{ kind: 'lowHp' }]), attacker, mon(), rngWith(0))).toBe(116); // 1 + 0.6 × 0.75 = 1.45배
    expect(movePower(base([{ kind: 'lowHp' }]), mon(), mon(), rngWith(0))).toBe(80);
  });

  test('보복: 이번 턴에 맞았을 때만 2배', () => {
    const attacker = mon();
    expect(movePower(base([{ kind: 'revenge' }]), attacker, mon(), rngWith(0))).toBe(80);
    attacker.hitThisTurn = true;
    expect(movePower(base([{ kind: 'revenge' }]), attacker, mon(), rngWith(0))).toBe(160);
  });

  test('약점 사냥: 상태이상인 상대에게 1.6배', () => {
    expect(movePower(base([{ kind: 'punish' }]), mon(), mon({ status: 'burn' }), rngWith(0))).toBe(128);
    expect(movePower(base([{ kind: 'punish' }]), mon(), mon(), rngWith(0))).toBe(80);
  });

  test('도박: 난수에 따라 0.4~1.6배', () => {
    const move = base([{ kind: 'gamble', min: 0.4, max: 1.6 }]);
    expect(movePower(move, mon(), mon(), rngWith(0))).toBe(32);
    expect(movePower(move, mon(), mon(), rngWith(0.5))).toBe(80);
  });
});

describe('급소와 비례 피해', () => {
  test('급소 효과는 급소 확률 인자를 넘긴다', () => {
    let seen = -1;
    const rng: Rng = { next: () => 0, int: (_min, max) => max, chance: (p) => { seen = p; return false; }, state: 0 };
    computeDamage(mon(), mon(), tackle(), rng, { criticalChance: HIGH_CRITICAL_CHANCE });
    expect(seen).toBe(1 / 3);
  });

  test('비례 피해는 방어와 상관없이 상대 현재 체력의 35%', () => {
    const wall = mon({ stats: { hp: 100, atk: 100, def: 9999, spa: 100, spd: 9999, spe: 100 } });
    const move = tackle({ power: 1, effects: [{ kind: 'percent', ratio: 0.35 }] });
    const state = battle([mon({ moves: [move] })], [wall]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(events).toContainEqual(expect.objectContaining({ t: 'damage', side: 1, amount: 35 }));
  });

  test('타입 무효면 비례 피해도 들어가지 않는다', () => {
    const move = tackle({ type: 'normal', effects: [{ kind: 'percent', ratio: 0.35 }] });
    const state = battle([mon({ moves: [move] })], [mon({ types: ['ghost'] })]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(events.some((e) => e.t === 'noEffect' && e.side === 0)).toBe(true);
    expect(next.sides[1].team[0].hp).toBe(100);
  });
});
