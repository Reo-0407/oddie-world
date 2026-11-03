/** 월드에서 쓰는 순수 계산 함수들 (x, z 평면) */

export interface Vec2 { x: number; z: number }

export const DUEL_RANGE = 2.5;
export const NOTICE_RANGE = 6;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function isWithin(a: Vec2, b: Vec2, range: number): boolean {
  return distance(a, b) <= range;
}

/** 가상 조이스틱: 손가락 이동량(px)을 -1~1 길이의 방향 벡터로 바꾼다. 위쪽(화면 y 음수)이 앞(z 음수) */
export function joystickToMove(dx: number, dy: number, radius: number, deadZone = 0.15): Vec2 {
  if (radius <= 0) return { x: 0, z: 0 };
  const length = Math.hypot(dx, dy);
  const strength = Math.min(length / radius, 1);
  if (strength < deadZone || length === 0) return { x: 0, z: 0 };
  return { x: (dx / length) * strength, z: (dy / length) * strength };
}

/** 키보드: 눌린 키 집합을 방향 벡터로 (대각선도 길이 1) */
export function keysToMove(keys: ReadonlySet<string>): Vec2 {
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const z = (down ? 1 : 0) - (up ? 1 : 0);
  const length = Math.hypot(x, z);
  return length === 0 ? { x: 0, z: 0 } : { x: x / length, z: z / length };
}

/**
 * 화면 기준 입력(위=앞)을 카메라가 보는 방향에 맞춰 월드 이동으로 돌린다.
 * cameraYaw: 카메라의 회전(라디안, 0이면 -z를 본다)
 */
export function inputToWorld(input: Vec2, cameraYaw: number): Vec2 {
  const cos = Math.cos(cameraYaw);
  const sin = Math.sin(cameraYaw);
  return { x: input.x * cos + input.z * sin, z: -input.x * sin + input.z * cos };
}

export function clampToArea(p: Vec2, half: number): Vec2 {
  return { x: Math.max(-half, Math.min(half, p.x)), z: Math.max(-half, Math.min(half, p.z)) };
}
