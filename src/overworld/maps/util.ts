export type Grid = string[][];

export const grid = (w: number, h: number, ch: string): Grid => Array.from({ length: h }, () => Array<string>(w).fill(ch));
export const put = (g: Grid, x: number, y: number, ch: string) => {
  if (g[y]?.[x] !== undefined) g[y][x] = ch;
};
export const fill = (g: Grid, x: number, y: number, w: number, h: number, ch: string) => {
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) put(g, x + i, y + j, ch);
};
export const rows = (g: Grid) => g.map((r) => r.join(''));

interface Building {
  x: number; y: number; w: number;
  roof: number; wall: number;
  color: string;
  /** 문 위치(건물 왼쪽 끝 기준) */
  door: number;
  /** 창문 칸(건물 왼쪽 끝 기준), 맨 아래 줄을 뺀 벽 줄마다 */
  windows: number[];
}

/** 여러 타일로 건물을 쌓고 문 칸 좌표를 돌려준다 */
export function building(g: Grid, b: Building): { x: number; y: number } {
  fill(g, b.x, b.y, b.w, b.roof, b.color);
  for (let r = 0; r < b.wall; r += 1) {
    const y = b.y + b.roof + r;
    fill(g, b.x, y, b.w, 1, 'W');
    if (r < b.wall - 1) for (const wx of b.windows) put(g, b.x + wx, y, 'w');
  }
  const door = { x: b.x + b.door, y: b.y + b.roof + b.wall - 1 };
  put(g, door.x, door.y, 'D');
  return door;
}
