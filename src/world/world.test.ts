import { describe, expect, it } from 'vitest';
import { clampToArea, distance, inputToWorld, isWithin, joystickToMove, keysToMove } from './math.ts';
import { clearSave, loadSave, newSave, parseSave, SAVE_KEY, writeSave } from './save.ts';
import { wildLevel } from './spawns.ts';
import { stepChase, stepWander, type WanderState } from './wander.ts';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('거리 판정', () => {
  it('거리와 범위 안 여부를 계산한다', () => {
    expect(distance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(isWithin({ x: 0, z: 0 }, { x: 2.5, z: 0 }, 2.5)).toBe(true);
    expect(isWithin({ x: 0, z: 0 }, { x: 2.6, z: 0 }, 2.5)).toBe(false);
  });
});

describe('입력 변환', () => {
  it('조이스틱 데드존 안은 멈춤', () => {
    expect(joystickToMove(2, 2, 50)).toEqual({ x: 0, z: 0 });
  });
  it('조이스틱 위로 밀면 앞(z 음수), 반지름 넘으면 길이 1', () => {
    const m = joystickToMove(0, -100, 50);
    expect(m.x).toBeCloseTo(0);
    expect(m.z).toBeCloseTo(-1);
  });
  it('반지름 절반이면 길이 0.5', () => {
    expect(joystickToMove(25, 0, 50).x).toBeCloseTo(0.5);
  });
  it('키보드 대각선도 길이 1, 반대 키는 상쇄', () => {
    const m = keysToMove(new Set(['w', 'd']));
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1);
    expect(keysToMove(new Set(['a', 'd']))).toEqual({ x: 0, z: 0 });
    expect(keysToMove(new Set(['arrowup'])).z).toBe(-1);
  });
  it('카메라 방향이 0이면 입력 그대로, 90도면 돌아간다', () => {
    const same = inputToWorld({ x: 0, z: -1 }, 0);
    expect(same.x).toBeCloseTo(0);
    expect(same.z).toBeCloseTo(-1);
    const r = inputToWorld({ x: 0, z: -1 }, Math.PI / 2);
    expect(Math.abs(r.x)).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });
  it('영역 밖은 잘라낸다', () => {
    expect(clampToArea({ x: 99, z: -99 }, 10)).toEqual({ x: 10, z: -10 });
  });
});

describe('배회 AI', () => {
  const base: WanderState = { x: 0, z: 0, heading: 0, mode: 'walk', timer: 5 };
  it('걷는 중이면 heading 방향으로 이동', () => {
    const next = stepWander(base, 1, () => 0.5, 50);
    expect(next.z).toBeGreaterThan(0);
    expect(next.timer).toBeCloseTo(4);
  });
  it('시간이 다 되면 멈춤으로 바뀌고 제자리', () => {
    const next = stepWander({ ...base, timer: 0.1 }, 0.2, () => 0.5, 50);
    expect(next.mode).toBe('idle');
    expect(next.z).toBe(0);
  });
  it('멈춤이 끝나면 새 방향으로 걷기 시작', () => {
    const next = stepWander({ ...base, mode: 'idle', timer: 0.1 }, 0.2, () => 0.25, 50);
    expect(next.mode).toBe('walk');
    expect(next.heading).toBeCloseTo(Math.PI / 2);
  });
  it('경계를 넘지 않는다', () => {
    const next = stepWander({ ...base, z: 9.9 }, 1, () => 0.5, 10);
    expect(next.z).toBeLessThanOrEqual(10);
  });
  it('추적: 멈출 거리까지만 다가간다', () => {
    const next = stepChase(base, { x: 0, z: 10 }, 1, 2.5);
    expect(next.z).toBeCloseTo(2.6);
    const near = stepChase(base, { x: 0, z: 3 }, 10, 2.5);
    expect(near.z).toBeCloseTo(0.5);
    expect(stepChase(near, { x: 0, z: 3 }, 1, 2.5).mode).toBe('idle');
  });
});

describe('저장', () => {
  const data = {
    ...newSave('준우', 2),
    team: [{ speciesId: 42, level: 12, exp: 30 }],
    box: [{ speciesId: 3, level: 8, exp: 0 }],
    ropes: { basic: 3, sturdy: 2 },
    coins: 120,
    potions: 2,
    playerLevel: 12,
    tutorialDone: true,
  };
  it('쓰고 읽는다', () => {
    const s = fakeStorage();
    expect(writeSave(data, s)).toBe(true);
    expect(loadSave(s)).toEqual(data);
    clearSave(s);
    expect(loadSave(s)).toBeNull();
  });
  it('옛 v1 저장(starterId)은 v2로 옮긴다', () => {
    const old = JSON.stringify({ name: '준우', characterIndex: 3, starterId: 42 });
    expect(parseSave(old)).toEqual({
      ...newSave('준우', 3),
      coins: 0, // 옛 저장은 시작 코인을 받지 않는다
      team: [{ speciesId: 42, level: 10, exp: 0 }],
    });
    expect(loadSave(fakeStorage({ [SAVE_KEY]: old }))?.ropes).toEqual({ basic: 5, sturdy: 1 });
  });
  it('v2 저장은 potions 0으로 옮기고 나머지는 그대로', () => {
    const { potions: _p, version: _v, ...rest } = data;
    const parsed = parseSave(JSON.stringify({ ...rest, version: 2 }));
    expect(parsed).toEqual({ ...data, potions: 0 });
    expect(parsed?.version).toBe(3);
  });
  it('새 저장은 코인 100, 회복약 0', () => {
    expect(newSave('a', 0)).toMatchObject({ coins: 100, potions: 0, version: 3 });
  });
  it('옛 v1에 스타터가 없으면 빈 팀', () => {
    expect(parseSave(JSON.stringify({ name: 'a', characterIndex: 0 }))?.team).toEqual([]);
  });
  it('망가진 값은 무시한다', () => {
    expect(parseSave('{{')).toBeNull();
    expect(parseSave(JSON.stringify({ name: '', characterIndex: 0 }))).toBeNull();
    expect(parseSave(JSON.stringify({ name: 'a', characterIndex: 9 }))).toBeNull();
    expect(parseSave(JSON.stringify({ version: 99, name: 'a', characterIndex: 0 }))).toBeNull();
    expect(loadSave(fakeStorage({ [SAVE_KEY]: 'x' }))).toBeNull();
  });
  it('v2의 이상한 항목은 걸러내고 팀은 6마리까지', () => {
    const raw = JSON.stringify({
      ...data,
      team: [...Array(8).fill({ speciesId: 1, level: 5, exp: 0 }), { speciesId: -1, level: 5 }, 'x'],
      ropes: { basic: -3, sturdy: 'a' },
      coins: 'many',
      potions: -4,
    });
    const parsed = parseSave(raw);
    expect(parsed?.team).toHaveLength(6);
    expect(parsed?.ropes).toEqual({ basic: 5, sturdy: 0 });
    expect(parsed?.coins).toBe(0);
    expect(parsed?.potions).toBe(0);
  });
  it('tutorialDone: 없으면 false(코인이 있으면 true), 있으면 그대로', () => {
    const { tutorialDone: _omit, ...rest } = data;
    expect(parseSave(JSON.stringify({ ...rest, coins: 0 }))?.tutorialDone).toBe(false);
    expect(parseSave(JSON.stringify(rest))?.tutorialDone).toBe(true);
    expect(parseSave(JSON.stringify({ ...data, tutorialDone: false }))?.tutorialDone).toBe(false);
    expect(newSave('a', 0).tutorialDone).toBe(false);
  });
  it('저장소가 던져도 죽지 않는다', () => {
    const boom = () => { throw new Error('x'); };
    const bad = { getItem: boom, setItem: boom, removeItem: boom };
    expect(loadSave(bad)).toBeNull();
    expect(writeSave(data, bad)).toBe(false);
    expect(() => clearSave(bad)).not.toThrow();
  });
});

describe('야생 레벨', () => {
  it('플레이어 레벨 ±2', () => {
    expect(wildLevel(10, () => 0)).toBe(8);
    expect(wildLevel(10, () => 0.999)).toBe(12);
    expect(wildLevel(1, () => 0)).toBe(1);
  });
});
