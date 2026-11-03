import { describe, expect, test } from 'vitest';
import { computeDamage } from './damage.ts';
import type { Rng } from './rng.ts';
import { changeStage, stageMultiplier } from './stages.ts';
import { battle, mon, tackle } from './testkit.ts';
import { resolveTurn } from './turn.ts';
import type { Action } from './types.ts';

const noCrit: Rng = { next: () => 0, int: (_min, max) => max, chance: () => false, state: 0 };
const useMove: Action = { kind: 'move', moveIndex: 0 };
const hit = tackle({ power: 80 });

describe('능력 단계', () => {
  test('배수', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-2)).toBe(0.5);
  });

  test('changeStage는 한계에서 멈추고 실제 변화량을 돌려준다', () => {
    const stages = { atk: 5, def: -6, spa: 0, spd: 0, spe: 0 };
    expect(changeStage(stages, 'atk', 2)).toBe(1);
    expect(stages.atk).toBe(6);
    expect(changeStage(stages, 'def', -1)).toBe(0);
    expect(changeStage(stages, 'spa', -2)).toBe(-2);
  });
});

describe('데미지에 반영', () => {
  const ground = { types: ['ground' as const] };

  test('공격 +2단계', () => {
    const attacker = mon({ ...ground });
    attacker.stages.atk = 2;
    expect(computeDamage(attacker, mon({ ...ground }), hit, noCrit).damage).toBe(72);
  });

  test('방어 +2단계', () => {
    const defender = mon({ ...ground });
    defender.stages.def = 2;
    expect(computeDamage(mon({ ...ground }), defender, hit, noCrit).damage).toBe(19);
  });
});

describe('기술 효과로 단계가 바뀐다', () => {
  const buff = tackle({ effects: [{ kind: 'stage', target: 'self', stat: 'atk', delta: 1, chance: 100 }] });
  const debuff = tackle({ effects: [{ kind: 'stage', target: 'foe', stat: 'def', delta: -1, chance: 100 }] });

  test('자신 +1', () => {
    const state = battle([mon({ moves: [buff] })], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(next.sides[0].team[0].stages.atk).toBe(1);
    expect(events).toContainEqual({ t: 'stage', side: 0, name: '테스트몬', stat: 'atk', delta: 1 });
  });

  test('상대 -1, 한계에서는 이벤트가 없다', () => {
    const state = battle([mon({ moves: [debuff] })], [mon()]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[1].team[0].stages.def).toBe(-1);

    const capped = battle([mon({ moves: [debuff] })], [mon()]);
    capped.sides[1].team[0].stages.def = -6;
    const { events } = resolveTurn(capped, [useMove, useMove]);
    expect(events.some((e) => e.t === 'stage' && e.side === 1)).toBe(false);
  });

  test('변화 기술로 2단계를 올린다', () => {
    const buff2 = tackle({
      category: 'status', power: 0,
      effects: [{ kind: 'stage', target: 'self', stat: 'spe', delta: 2, chance: 100 }],
    });
    const state = battle([mon({ moves: [buff2] })], [mon()]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[0].team[0].stages.spe).toBe(2);
  });
});

describe('속도와 교체', () => {
  test('속도 단계가 순서를 바꾼다', () => {
    const slow = mon({ stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 50 } });
    slow.stages.spe = 2;
    const fast = mon({ stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 80 } });
    const state = battle([slow], [fast]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(events.filter((e) => e.t === 'move').map((e) => e.side)).toEqual([0, 1]);
  });

  test('교체해서 빠지면 단계가 초기화된다', () => {
    const state = battle([mon(), mon({ name: '후보' })], [mon()]);
    state.sides[0].team[0].stages.atk = 3;
    const { state: next } = resolveTurn(state, [{ kind: 'switch', teamIndex: 1 }, useMove]);
    expect(next.sides[0].team[0].stages.atk).toBe(0);
  });
});
