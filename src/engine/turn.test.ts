import { describe, expect, test } from 'vitest';
import { battle, mon, tackle } from './testkit.ts';
import { activeOf, isLegalAction, resolveForcedSwitch, resolveTurn } from './turn.ts';
import type { Action, BattleState } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const fast = (spe: number) => ({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe });
const ko = tackle({ power: 500 });

function moveOrder(events: ReturnType<typeof resolveTurn>['events']) {
  return events.filter((e) => e.t === 'move').map((e) => e.side);
}

describe('행동 순서', () => {
  test('스피드가 빠른 쪽이 먼저 움직인다', () => {
    const state = battle([mon({ stats: fast(50) })], [mon({ stats: fast(150) })]);
    expect(moveOrder(resolveTurn(state, [useMove, useMove]).events)).toEqual([1, 0]);
  });

  test('선공 기술이 스피드보다 우선한다', () => {
    const slow = mon({ stats: fast(10), moves: [tackle({ priority: 1 })] });
    const state = battle([slow], [mon({ stats: fast(200) })]);
    expect(moveOrder(resolveTurn(state, [useMove, useMove]).events)).toEqual([0, 1]);
  });

  test('마비는 스피드를 절반으로 만든다', () => {
    const state = battle(
      [mon({ stats: fast(100), status: 'paralysis' })],
      [mon({ stats: fast(60) })],
      3,
    );
    expect(moveOrder(resolveTurn(state, [useMove, useMove]).events)[0]).toBe(1);
  });

  test('교체는 기술보다 먼저 일어난다', () => {
    const state = battle([mon({ stats: fast(1) }), mon({ name: '후보' })], [mon({ stats: fast(200) })]);
    const { events, state: next } = resolveTurn(state, [{ kind: 'switch', teamIndex: 1 }, useMove]);
    expect(events[0].t).toBe('switch');
    expect(next.sides[0].active).toBe(1);
  });
});

describe('공격과 쓰러짐', () => {
  test('입력 상태를 바꾸지 않는다', () => {
    const state = battle([mon()], [mon()]);
    const before = JSON.stringify(state);
    resolveTurn(state, [useMove, useMove]);
    expect(JSON.stringify(state)).toBe(before);
  });

  test('쓰러진 오디는 행동하지 않고, 후보가 없으면 승패가 난다', () => {
    const state = battle([mon({ stats: fast(200), moves: [ko] })], [mon({ stats: fast(1) })]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(moveOrder(events)).toEqual([0]);
    expect(next.winner).toBe(0);
    expect(events.at(-1)).toEqual({ t: 'win', side: 0 });
  });

  test('후보가 있으면 강제 교체를 기다린다', () => {
    const state = battle([mon({ stats: fast(200), moves: [ko] })], [mon(), mon({ name: '후보' })]);
    const { state: next } = resolveTurn(state, [useMove, useMove]);
    expect(next.winner).toBeNull();
    expect(next.pendingSwitch).toEqual([false, true]);

    const after = resolveForcedSwitch(next, 1, 1);
    expect(activeOf(after.state, 1).name).toBe('후보');
    expect(after.state.pendingSwitch).toEqual([false, false]);
  });
});

describe('상태이상', () => {
  test('독과 화상은 턴 끝에 데미지를 준다', () => {
    const poisoned = battle(
      [mon({ status: 'poison', moves: [tackle({ power: 0, category: 'status' })] })],
      [mon({ moves: [tackle({ power: 0, category: 'status' })] })],
    );
    expect(resolveTurn(poisoned, [useMove, useMove]).state.sides[0].team[0].hp).toBe(88);

    const burned = battle(
      [mon({ status: 'burn', moves: [tackle({ power: 0, category: 'status' })] })],
      [mon({ moves: [tackle({ power: 0, category: 'status' })] })],
    );
    expect(resolveTurn(burned, [useMove, useMove]).state.sides[0].team[0].hp).toBe(94);
  });

  test('수면 중에는 움직이지 못하고 시간이 지나면 깬다', () => {
    let state: BattleState = battle([mon({ status: 'sleep', sleepTurns: 1 })], [mon({ moves: [tackle({ power: 1 })] })]);
    const first = resolveTurn(state, [useMove, useMove]);
    expect(first.events.some((e) => e.t === 'cantMove' && e.side === 0)).toBe(true);
    state = first.state;

    const second = resolveTurn(state, [useMove, useMove]);
    expect(second.events.some((e) => e.t === 'wake' && e.side === 0)).toBe(true);
    expect(moveOrder(second.events)).toContain(0);
  });

  test('독 타입은 독에 걸리지 않는다', () => {
    const toxic = tackle({ category: 'status', power: 0, effects: [{ kind: 'status', status: 'poison', chance: 100 }] });
    const state = battle([mon({ moves: [toxic] })], [mon({ types: ['poison'] })]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[1].team[0].status).toBeNull();
  });

  test('수면 기술은 대상을 재운다', () => {
    const sleepMove = tackle({ category: 'status', power: 0, effects: [{ kind: 'status', status: 'sleep', chance: 100 }] });
    const state = battle([mon({ stats: fast(200), moves: [sleepMove] })], [mon()]);
    const target = resolveTurn(state, [useMove, useMove]).state.sides[1].team[0];
    expect(target.status).toBe('sleep');
  });
});

describe('회복과 흡수', () => {
  test('회복은 최대 HP를 넘지 않는다', () => {
    const heal = tackle({ category: 'status', power: 0, effects: [{ kind: 'heal', ratio: 0.5 }] });
    const state = battle([mon({ hp: 80, moves: [heal] })], [mon({ moves: [tackle({ power: 0, category: 'status' })] })]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[0].team[0].hp).toBe(100);
  });

  test('흡수는 준 데미지의 비율만큼 회복한다', () => {
    const drain = tackle({ power: 80, type: 'rock', effects: [{ kind: 'drain', ratio: 0.5 }] });
    const state = battle(
      [mon({ hp: 10, stats: fast(200), moves: [drain] })],
      [mon({ moves: [tackle({ power: 0, category: 'status' })] })],
    );
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    const damage = events.find((e) => e.t === 'damage');
    if (damage?.t !== 'damage') throw new Error('damage 이벤트 없음');
    expect(next.sides[0].team[0].hp).toBe(10 + Math.floor(damage.amount * 0.5));
  });
});

describe('결정성과 합법성', () => {
  test('같은 시드면 결과가 같다', () => {
    const state = battle([mon()], [mon()], 99);
    expect(resolveTurn(state, [useMove, useMove])).toEqual(resolveTurn(state, [useMove, useMove]));
  });

  test('isLegalAction', () => {
    const state = battle([mon(), mon({ hp: 0 }), mon()], [mon()]);
    expect(isLegalAction(state, 0, { kind: 'move', moveIndex: 0 })).toBe(true);
    expect(isLegalAction(state, 0, { kind: 'move', moveIndex: 3 })).toBe(false);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 0 })).toBe(false);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 1 })).toBe(false);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 2 })).toBe(true);
  });
});
