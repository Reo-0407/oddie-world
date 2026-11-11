import type { Dir, NpcLook } from './maps/types.ts';

/** 캐릭터 6색 (머리, 옷, 바지) */
export const PLAYER_LOOKS: NpcLook[] = [
  { hair: '#3b2a20', skin: '#f6d2b0', shirt: '#d94f3d', pants: '#3a4a8a', hat: '#d94f3d' },
  { hair: '#c9822a', skin: '#f6d2b0', shirt: '#3f78d8', pants: '#2c3a5c', hat: '#3f78d8' },
  { hair: '#222222', skin: '#e8b890', shirt: '#3a9a4a', pants: '#4a4a3a', hat: '#3a9a4a' },
  { hair: '#8a3a6a', skin: '#f6d2b0', shirt: '#8a5ac8', pants: '#3a3a5a' },
  { hair: '#e8c040', skin: '#f6d2b0', shirt: '#e0892f', pants: '#5a3a2a' },
  { hair: '#4a5a8a', skin: '#e8b890', shirt: '#f283c1', pants: '#4a3a6a' },
];

export const SPRITE_W = 32;
export const SPRITE_H = 36; // 머리가 타일 위로 4px 나온다
const U = 2; // 논리 픽셀 한 칸 = 2px
const OUT = '#2b2024';

interface Part { x: number; y: number; w: number; h: number; c: string }

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** 오른쪽 방향(옆모습)은 'right', 왼쪽은 좌우 반전. frame 0=서기, 1/2=걷기 */
function parts(look: NpcLook, dir: Dir, frame: number): Part[] {
  const p: Part[] = [];
  const add = (x: number, y: number, w: number, h: number, c: string) => p.push({ x, y, w, h, c });
  const lift = frame === 1 ? 1 : 0; // 왼발 들기
  const lift2 = frame === 2 ? 1 : 0;
  const darkPants = shade(look.pants, 0.75);
  const shoe = '#3a2a2a';
  if (dir === 'down' || dir === 'up') {
    // 다리
    add(5, 14 - 0, 3, 3 - lift, look.pants); add(8, 14, 3, 3 - lift2, look.pants);
    add(5, 16 - lift, 3, 1, shoe); add(8, 16 - lift2, 3, 1, shoe);
    add(7, 14, 2, 2, darkPants);
    // 몸통과 팔
    add(4, 9, 8, 5, look.shirt); add(4, 13, 8, 1, shade(look.shirt, 0.8));
    add(3, 10 + (frame === 1 ? 1 : 0), 1, 4, look.shirt); add(12, 10 + (frame === 2 ? 1 : 0), 1, 4, look.shirt);
    add(3, 14 + (frame === 1 ? 1 : 0) - 0, 1, 1, look.skin); add(12, 14 + (frame === 2 ? 1 : 0), 1, 1, look.skin);
    // 머리
    add(4, 2, 8, 7, look.skin);
    if (dir === 'down') {
      add(4, 1, 8, 3, look.hair); add(3, 2, 1, 5, look.hair); add(12, 2, 1, 5, look.hair);
      add(5, 4, 2, 1, look.hair); add(9, 4, 2, 1, look.hair);
      add(5, 6, 2, 2, '#2b2024'); add(9, 6, 2, 2, '#2b2024');
      add(5, 6, 1, 1, '#ffffff'); add(9, 6, 1, 1, '#ffffff');
      add(4, 7, 1, 1, '#f0a0a0'); add(11, 7, 1, 1, '#f0a0a0');
    } else {
      add(3, 1, 10, 8, look.hair); add(4, 8, 8, 1, shade(look.hair, 0.8));
    }
    if (look.hat) {
      add(3, 0, 10, 3, look.hat); add(4, dir === 'down' ? 3 : 8, 8, 1, shade(look.hat, 0.8));
      if (dir === 'down') add(4, 3, 8, 1, shade(look.hat, 0.8));
    }
  } else {
    // 옆모습(오른쪽을 본다)
    add(6, 14, 3, 3 - lift, look.pants); add(7, 14, 3, 3 - lift2, darkPants);
    add(7, 16 - lift, 4, 1, shoe); add(7, 16 - lift2, 4, 1, shoe);
    add(5, 9, 7, 5, look.shirt); add(5, 13, 7, 1, shade(look.shirt, 0.8));
    add(6, 10, 3, 4, shade(look.shirt, 0.85));
    add(7 + (frame === 1 ? 1 : 0) - (frame === 2 ? 1 : 0), 14, 2, 1, look.skin);
    add(5, 2, 8, 7, look.skin);
    add(4, 1, 8, 4, look.hair); add(4, 4, 3, 5, look.hair);
    add(11, 4, 1, 1, look.hair);
    add(10, 6, 2, 2, '#2b2024'); add(10, 6, 1, 1, '#ffffff');
    add(13, 6, 1, 2, look.skin);
    if (look.hat) { add(4, 0, 9, 3, look.hat); add(11, 3, 3, 1, look.hat); add(4, 3, 3, 1, shade(look.hat, 0.8)); }
  }
  return p;
}

/** 캐릭터 한 명을 (x, y)에 그린다. (x, y)는 서 있는 타일의 왼쪽 위 모서리 */
export function drawCharacter(c: CanvasRenderingContext2D, look: NpcLook, dir: Dir, frame: number, x: number, y: number) {
  const flip = dir === 'left';
  c.save();
  c.translate(x + (flip ? SPRITE_W : 0), y - 4);
  if (flip) c.scale(-1, 1);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.fillRect(4 * U, 33, 8 * U, 2);
  c.fillRect(5 * U, 32, 6 * U, 1);
  const list = parts(look, dir === 'left' ? 'right' : dir, frame);
  // 윤곽선: 모든 부분을 1칸 부풀려 어둡게 먼저 칠한다
  c.fillStyle = OUT;
  for (const q of list) c.fillRect((q.x - 1) * U, (q.y - 1) * U, (q.w + 2) * U, (q.h + 2) * U);
  for (const q of list) { c.fillStyle = q.c; c.fillRect(q.x * U, q.y * U, q.w * U, q.h * U); }
  c.restore();
}
