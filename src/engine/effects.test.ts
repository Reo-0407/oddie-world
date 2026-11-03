import { describe, expect, test } from 'vitest';
import { battle, mon, tackle } from './testkit.ts';
import { isLegalAction, resolveTurn } from './turn.ts';
import type { Action, BattleEvent } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const spe = (value: number) => ({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: value });
const big = { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
const count = (events: BattleEvent[], t: BattleEvent['t'], side?: number) =>
  events.filter((e) => e.t === t && (side === undefined || ('side' in e && e.side === side))).length;

describe('연타', () => {
  test('3연타는 피해 이벤트 3번과 연타 횟수를 남긴다', () => {
    const move = tackle({ power: 10, effects: [{ kind: 'multiHit', hits: 3 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 1000, stats: big })]);
    const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(count(events, 'damage')).toBe(3);
    expect(events).toContainEqual({ t: 'hits', count: 3 });
  });

  test('도중에 쓰러지면 멈춘다', () => {
    const move = tackle({ power: 500, effects: [{ kind: 'multiHit', hits: 2 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 5 })]);
    const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(count(events, 'damage')).toBe(1);
    expect(count(events, 'hits')).toBe(0);
  });
});

describe('반동', () => {
  test('준 피해의 1/4을 자신도 받는다', () => {
    const move = tackle({ power: 60, effects: [{ kind: 'recoil', ratio: 0.25 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 1000, stats: big })]);
    const { events, state: next } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    const damage = events.find((e) => e.t === 'damage');
    const recoil = events.find((e) => e.t === 'recoil');
    if (damage?.t !== 'damage' || recoil?.t !== 'recoil') throw new Error('이벤트 없음');
    expect(recoil.amount).toBe(Math.max(1, Math.floor(damage.amount * 0.25)));
    expect(next.sides[0].team[0].hp).toBe(100 - recoil.amount);
  });
});

describe('움찔', () => {
  const flinch = tackle({ effects: [{ kind: 'flinch', chance: 100 }] });

  test('먼저 움직이면 상대가 이번 턴 못 움직인다', () => {
    const state = battle([mon({ stats: spe(200), moves: [flinch] })], [mon({ stats: spe(100) })]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(events).toContainEqual({ t: 'cantMove', side: 1, name: '테스트몬', reason: 'flinch' });
    expect(count(events, 'move', 1)).toBe(0);
  });

  test('늦게 움직이면 움찔시키지 못한다', () => {
    const state = battle([mon({ stats: spe(50), moves: [flinch] })], [mon({ stats: spe(100) })]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(count(events, 'cantMove')).toBe(0);
  });
});

describe('혼란', () => {
  const confuseMove = tackle({ category: 'status', power: 0, effects: [{ kind: 'confuse', chance: 100 }] });

  test('변화 기술로 혼란에 빠뜨린다', () => {
    const state = battle([mon({ moves: [confuseMove] })], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(next.sides[1].team[0].confusion).toBeGreaterThanOrEqual(2);
    expect(count(events, 'confused')).toBe(1);
  });

  test('혼란 중에는 가끔 자신을 때리고 그 턴에는 움직이지 못한다', () => {
    let selfHits = 0;
    let moved = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const confused = mon();
      confused.confusion = 5;
      const state = battle([confused], [mon({ hp: 1000, stats: big })], seed);
      const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
      if (events.some((e) => e.t === 'confusionHit')) {
        selfHits += 1;
        expect(count(events, 'move', 0)).toBe(0);
      } else if (count(events, 'move', 0) === 1) {
        moved += 1;
      }
    }
    expect(selfHits).toBeGreaterThan(5);
    expect(moved).toBeGreaterThan(20);
  });

  test('마지막 혼란 횟수에서는 풀리고 움직인다', () => {
    const confused = mon();
    confused.confusion = 1;
    const state = battle([confused], [mon({ hp: 1000, stats: big })]);
    const { events, state: next } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(events).toContainEqual({ t: 'confusionEnd', side: 0, name: '테스트몬' });
    expect(count(events, 'move', 0)).toBe(1);
    expect(next.sides[0].team[0].confusion).toBe(0);
  });

  test('공격에 붙은 혼란', () => {
    const move = tackle({ effects: [{ kind: 'confuse', chance: 100 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 1000, stats: big })]);
    expect(resolveTurn(state, [useMove, { kind: 'pass' }]).state.sides[1].team[0].confusion).toBeGreaterThan(0);
  });
});

describe('방어 태세', () => {
  const shield = tackle({ category: 'status', power: 0, accuracy: 0, priority: 4, effects: [{ kind: 'shield' }] });

  test('이번 턴 공격을 막는다', () => {
    const state = battle([mon({ moves: [shield] })], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(events).toContainEqual({ t: 'shieldBlock', side: 0, name: '테스트몬' });
    expect(next.sides[0].team[0].hp).toBe(100);
    expect(next.sides[0].team[0].shielded).toBe(false);
  });

  test('연달아 쓰면 실패할 때가 있다', () => {
    let success = 0;
    let fail = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const user = mon({ moves: [shield] });
      user.shieldStreak = 1;
      const state = battle([user], [mon()], seed);
      const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
      if (count(events, 'shield') === 1) success += 1;
      else fail += 1;
    }
    expect(success).toBeGreaterThan(10);
    expect(fail).toBeGreaterThan(10);
  });

  test('다른 기술을 쓰면 연속 횟수가 초기화된다', () => {
    const user = mon({ moves: [tackle()] });
    user.shieldStreak = 3;
    const { state: next } = resolveTurn(battle([user], [mon()]), [useMove, useMove]);
    expect(next.sides[0].team[0].shieldStreak).toBe(0);
  });
});

describe('정화', () => {
  test('상태이상을 낫고 체력을 1/4 회복한다', () => {
    const cleanse = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'cleanse', healRatio: 0.25 }] });
    const user = mon({ hp: 50, status: 'burn', moves: [cleanse] });
    const state = battle([user], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(next.sides[0].team[0].status).toBeNull();
    expect(next.sides[0].team[0].hp).toBe(75);
    expect(events).toContainEqual({ t: 'cure', side: 0, name: '테스트몬' });
  });
});

test('isLegalAction은 pass를 허용하지 않는다', () => {
  expect(isLegalAction(battle([mon()], [mon()]), 0, { kind: 'pass' })).toBe(false);
});
