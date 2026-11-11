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
fill(g, 37, 6, 3, 1, ':'); put(g, 37, 7, '.'); // 사막으로 가는 좁은 길(문지기)
put(g, 2, 5, 'Y');
put(g, 35, 5, 'Y');

export const route1: MapData = {
  id: 'route1',
  name: '1번 길',
  region: 'meadow',
  rows: rows(g),
  warps: [
    { x: 0, y: 6, to: { map: 'town', x: 28, y: 20, facing: 'left' } },
    { x: 0, y: 7, to: { map: 'town', x: 28, y: 20, facing: 'left' } },
    { x: 39, y: 6, to: { map: 'route2', x: 1, y: 7, facing: 'right' } },
  ],
  npcs: [
    { id: 'route1-kid', name: '꼬마 트레이너', x: 24, y: 6, facing: 'left',
      look: { hair: '#2a2a2a', skin: '#f6d2b0', shirt: '#e0892f', pants: '#2a4a7a', hat: '#d94f3d' },
      lines: ['나는 풀숲 지킴이야!'],
      trainer: { sight: 4, before: ['어? 너 오디 트레이너지?', '나랑 승부하자!'], after: ['으앙, 졌다…'] } },
    { id: 'route1-lass', name: '꽃 소녀', x: 17, y: 5, facing: 'down',
      look: { hair: '#8a4a20', skin: '#f6d2b0', shirt: '#f283c1', pants: '#6a3a8a' },
      lines: ['꽃밭에서 키운 내 오디들, 귀엽지?'],
      trainer: { sight: 3, before: ['꽃향기 맡으러 왔니?', '내 오디들이랑 놀아 줘!'], after: ['다음엔 꼭 이길 거야!'] } },
    { id: 'gate-desert', name: '문지기', x: 37, y: 6, facing: 'left',
      look: { hair: '#2a2a2a', skin: '#e8b890', shirt: '#3a5a8a', pants: '#2a2a3a', hat: '#2a3a5a' },
      lines: ['이 앞은 사막으로 가는 2번 길이야.', '초원 배지가 있어야 지나갈 수 있어. 오디 마을 체육관에 도전해 봐!'],
      gate: { badges: ['meadow'], aside: { x: 37, y: 7 }, open: ['초원 배지가 있구나! 지나가도 좋아. 사막은 덥다고!'] } },
  ],
  signs: [
    { x: 2, y: 5, text: '1번 길 — 풀숲에는 야생 오디가 있어요!' },
    { x: 35, y: 5, text: '→ 2번 길 · 사막 마을 (초원 배지가 필요해요)' },
  ],
};
