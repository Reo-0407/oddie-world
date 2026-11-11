import { describe, expect, it } from 'vitest';
import { clampToArea, distance, inputToWorld, isWithin, joystickToMove, keysToMove } from './math.ts';
import { wildLevel } from './spawns.ts';
import { stepChase, stepWander, type WanderState } from './wander.ts';

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

describe('야생 레벨', () => {
  it('플레이어 레벨 ±2', () => {
    expect(wildLevel(10, () => 0)).toBe(8);
    expect(wildLevel(10, () => 0.999)).toBe(12);
    expect(wildLevel(1, () => 0)).toBe(1);
  });
});
