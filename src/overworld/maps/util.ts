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

/** 지도마다 늘 같은 모양이 나오게 하는 작은 난수 */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** on 문자인 칸 n곳에 ch를 흩뿌린다 */
export function scatter(g: Grid, rand: () => number, ch: string, n: number, on = '.') {
  const h = g.length;
  const w = g[0].length;
  for (let k = 0, tries = 0; k < n && tries < n * 60; tries += 1) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h);
    if (g[y][x] === on) { g[y][x] = ch; k += 1; }
  }
}

/** 사각형 테두리를 ch로 */
export function border(g: Grid, ch: string, t = 1) {
  const h = g.length;
  const w = g[0].length;
  fill(g, 0, 0, w, t, ch); fill(g, 0, h - t, w, t, ch);
  fill(g, 0, 0, t, h, ch); fill(g, w - t, 0, t, h, ch);
}
