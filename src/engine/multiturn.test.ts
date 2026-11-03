import { describe, expect, test } from 'vitest';
import { battle, mon, tackle } from './testkit.ts';
import { isLegalAction, resolveForcedSwitch, resolveTurn } from './turn.ts';
import type { Action, BattleEvent } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const pass: Action = { kind: 'pass' };
const hasEvent = (events: BattleEvent[], t: BattleEvent['t']) => events.some((e) => e.t === t);
const tank = { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };

describe('충전', () => {
  const charge = tackle({ power: 100, effects: [{ kind: 'charge' }] });

  test('첫 턴은 모으기만 하고 다음 턴에 공격한다', () => {
    const state = battle([mon({ moves: [charge] })], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    expect(hasEvent(first.events, 'charge')).toBe(true);
    expect(hasEvent(first.events, 'damage')).toBe(false);
    expect(first.state.sides[0].team[0].charging).toBe(0);

    const second = resolveTurn(first.state, [pass, pass]);
    expect(hasEvent(second.events, 'damage')).toBe(true);
    expect(second.state.sides[0].team[0].charging).toBeNull();
  });

  test('충전 중에는 교체할 수 없고, 다른 행동을 골라도 충전한 기술이 나간다', () => {
    const state = battle([mon({ moves: [charge, tackle()] }), mon()], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    expect(isLegalAction(first.state, 0, { kind: 'switch', teamIndex: 1 })).toBe(false);
    const second = resolveTurn(first.state, [{ kind: 'move', moveIndex: 1 }, pass]);
    expect(second.events).toContainEqual(expect.objectContaining({ t: 'move', side: 0, moveName: '몸통박치기' }));
    expect(second.events.filter((e) => e.t === 'damage')).toHaveLength(1);
  });

  test('충전 중에 잠들면 충전이 풀린다', () => {
    const state = battle([mon({ moves: [charge] })], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    first.state.sides[0].team[0].status = 'sleep';
    first.state.sides[0].team[0].sleepTurns = 2;
    const second = resolveTurn(first.state, [pass, pass]);
    expect(second.state.sides[0].team[0].charging).toBeNull();
  });
});

describe('지연', () => {
  test('쓴 다음 턴 끝에 맞는다', () => {
    const delayed = tackle({ power: 80, effects: [{ kind: 'delayed' }] });
    const state = battle([mon({ moves: [delayed] })], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    expect(hasEvent(first.events, 'delayedSet')).toBe(true);
    expect(first.state.sides[1].team[0].hp).toBe(1000);
    expect(first.state.delayed).toHaveLength(1);

    const second = resolveTurn(first.state, [pass, pass]);
    expect(hasEvent(second.events, 'delayedHit')).toBe(true);
    expect(second.state.sides[1].team[0].hp).toBeLessThan(1000);
    expect(second.state.delayed).toHaveLength(0);
  });

  test('그 사이 교체해도 새로 나온 오디가 맞는다', () => {
    const delayed = tackle({ power: 80, effects: [{ kind: 'delayed' }] });
    const state = battle([mon({ moves: [delayed] })], [mon({ hp: 1000, stats: tank }), mon({ name: '후보', hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    const second = resolveTurn(first.state, [pass, { kind: 'switch', teamIndex: 1 }]);
    expect(second.state.sides[1].team[1].hp).toBeLessThan(1000);
  });
});

describe('교대 공격', () => {
  const pivot = tackle({ effects: [{ kind: 'pivot' }] });

  test('벤치가 있으면 턴이 끝난 뒤 교체를 고른다', () => {
    const state = battle([mon({ moves: [pivot] }), mon({ name: '후보' })], [mon({ hp: 1000, stats: tank })]);
    const { state: next, events } = resolveTurn(state, [useMove, pass]);
    expect(hasEvent(events, 'pivot')).toBe(true);
    expect(next.pendingSwitch).toEqual([true, false]);
    expect(resolveForcedSwitch(next, 0, 1).state.sides[0].active).toBe(1);
  });

  test('벤치가 없으면 그대로 남는다', () => {
    const state = battle([mon({ moves: [pivot] })], [mon({ hp: 1000, stats: tank })]);
    expect(resolveTurn(state, [useMove, pass]).state.pendingSwitch).toEqual([false, false]);
  });
});

describe('속박', () => {
  const trap = tackle({ effects: [{ kind: 'trap', turns: 3 }] });

  test('3턴 동안 교체할 수 없고 그 뒤에 풀린다', () => {
    const state = battle([mon({ moves: [trap] })], [mon({ hp: 1000, stats: tank }), mon({ name: '후보' })]);
    let current = resolveTurn(state, [useMove, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(false);
    current = resolveTurn(current, [pass, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(false);
    current = resolveTurn(current, [pass, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(false);
    current = resolveTurn(current, [pass, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(true);
  });

  test('교대 공격으로 억지로 나가야 하면 속박돼 있어도 바꿀 수 있다', () => {
    const state = battle([mon({ trapped: 3 }), mon({ name: '후보' })], [mon()]);
    state.pendingSwitch[0] = true;
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 1 })).toBe(true);
  });

  test('교대 공격 대기가 아니면 속박 중 교체는 여전히 막는다', () => {
    const state = battle([mon({ trapped: 3 }), mon({ name: '후보' })], [mon()]);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 1 })).toBe(false);
  });

  test('쓰러져서 바꾸는 것은 막지 않는다', () => {
    const state = battle([mon()], [mon({ hp: 0 }), mon({ name: '후보' })]);
    state.sides[1].team[0].trapped = 3;
    expect(isLegalAction(state, 1, { kind: 'switch', teamIndex: 1 })).toBe(true);
  });
});

test('전투 상태를 JSON으로 바꿨다 되돌려도 같은 결과가 나온다', () => {
  const delayed = tackle({ power: 80, effects: [{ kind: 'delayed' }] });
  const state = battle([mon({ moves: [delayed] })], [mon({ hp: 1000, stats: tank })], 7);
  const first = resolveTurn(state, [useMove, pass]);
  const copy = JSON.parse(JSON.stringify(first.state));
  expect(resolveTurn(copy, [pass, pass])).toEqual(resolveTurn(first.state, [pass, pass]));
});
