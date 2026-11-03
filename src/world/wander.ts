import { clampToArea, distance, type Vec2 } from './math.ts';

export interface WanderState {
  x: number;
  z: number;
  heading: number; // 라디안, 이동 방향
  mode: 'idle' | 'walk';
  timer: number; // 현재 행동이 끝날 때까지 남은 초
}

export const WANDER_SPEED = 1.2;
export const CHASE_SPEED = 2.6;

/** 0 이상 1 미만 난수를 돌려주는 함수 */
export type Random = () => number;

/** 배회 한 걸음: 걷다가 멈추고, 멈췄다가 새 방향으로 걷는다. 경계 밖으로는 나가지 않는다 */
export function stepWander(state: WanderState, dt: number, rand: Random, half: number): WanderState {
  let { mode, timer, heading } = state;
  let { x, z } = state;
  timer -= dt;
  if (timer <= 0) {
    if (mode === 'walk') {
      mode = 'idle';
      timer = 1 + rand() * 2.5;
    } else {
      mode = 'walk';
      timer = 1.5 + rand() * 3;
      heading = rand() * Math.PI * 2;
    }
  }
  if (mode === 'walk') {
    x += Math.sin(heading) * WANDER_SPEED * dt;
    z += Math.cos(heading) * WANDER_SPEED * dt;
    const clamped = clampToArea({ x, z }, half);
    if (clamped.x !== x || clamped.z !== z) {
      // 벽에 닿으면 안쪽으로 돌아선다
      heading = Math.atan2(-clamped.x, -clamped.z);
      x = clamped.x;
      z = clamped.z;
    }
  }
  return { x, z, heading, mode, timer };
}

/** 플레이어를 향해 한 걸음 다가간다 (멈춰야 할 거리 stopAt 안이면 제자리) */
export function stepChase(state: WanderState, target: Vec2, dt: number, stopAt: number): WanderState {
  const dist = distance(state, target);
  const heading = Math.atan2(target.x - state.x, target.z - state.z);
  if (dist <= stopAt) return { ...state, heading, mode: 'idle' };
  const move = Math.min(CHASE_SPEED * dt, dist - stopAt);
  return {
    ...state,
    x: state.x + Math.sin(heading) * move,
    z: state.z + Math.cos(heading) * move,
    heading,
    mode: 'walk',
    timer: 0,
  };
}
