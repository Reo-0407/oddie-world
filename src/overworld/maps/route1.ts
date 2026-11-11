import type { MapData } from './types.ts';
import { fill, grid, put, rows } from './util.ts';

const W = 40;
const H = 14;
const g = grid(W, H, '.');
fill(g, 0, 0, W, 2, 'T');
fill(g, 0, 12, W, 2, 'T');
fill(g, 0, 0, 1, H, 'T');
fill(g, 37, 0, 3, H, 'T');
for (let x = 3; x < 37; x += 4) put(g, x, 2, 'T');
fill(g, 0, 6, 37, 2, ':');
for (const [x, y, w, h] of [[3, 3, 7, 3], [3, 8, 7, 3], [14, 8, 8, 3], [14, 3, 8, 2], [27, 3, 8, 3], [27, 8, 7, 3]] as const) fill(g, x, y, w, h, '"');
for (const [x, y] of [[11, 3], [12, 9], [12, 4], [24, 4], [25, 9], [26, 10], [11, 10], [23, 3], [35, 4], [35, 9], [2, 10], [1, 4]]) put(g, x, y, 'T');
for (const [x, y] of [[13, 3], [23, 10], [32, 11]]) put(g, x, y, 'o');
for (const [x, y] of [[5, 7 - 2], [12, 11], [20, 5], [31, 8], [24, 8], [2, 8], [18, 11]]) put(g, x, y, 'f');
fill(g, 36, 4, 1, 5, '=');
fill(g, 36, 6, 1, 2, ':'); // 울타리 사이 길 끝(막다른 곳)
put(g, 2, 5, 'Y');
put(g, 35, 5, 'Y');

export const route1: MapData = {
  id: 'route1',
  name: '1번 길',
  region: 'meadow',
  rows: rows(g),
  warps: [
    { x: 0, y: 6, to: { map: 'town', x: 28, y: 20, facing: 'left' } },
    { x: 0, y: 7, to: { map: 'town', x: 28, y: 21, facing: 'left' } },
  ],
  npcs: [
    { id: 'route1-kid', name: '꼬마 트레이너', x: 24, y: 6, facing: 'left',
      look: { hair: '#2a2a2a', skin: '#f6d2b0', shirt: '#e0892f', pants: '#2a4a7a', hat: '#d94f3d' },
      lines: ['나는 풀숲 지킴이야!'],
      trainer: { sight: 4, before: ['어? 너 오디 트레이너지?', '나랑 승부하자!'], after: ['으앙, 졌다…'] } },
  ],
  signs: [
    { x: 2, y: 5, text: '1번 길 — 풀숲에는 야생 오디가 있어요!' },
    { x: 35, y: 5, text: '이 앞은 공사 중입니다. (다음 구역은 아직 열리지 않았어요)' },
  ],
};
