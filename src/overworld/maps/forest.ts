import type { MapData } from './types.ts';
import { fill, grid, put, rng, rows, scatter } from './util.ts';

// 오디 숲(초원): 오디 마을 남쪽. 빽빽한 나무 사이 구불구불한 길, 남쪽 끝 문지기(사막 배지) 너머 3번 길(설원)
const W = 24;
const H = 30;
const g = grid(W, H, 'T');

// 빈터
for (const [x, y, w, h] of [[2, 8, 8, 5], [13, 8, 9, 5], [7, 17, 9, 5], [17, 16, 6, 6], [2, 18, 4, 8], [13, 2, 8, 4], [1, 2, 9, 3]] as const) fill(g, x, y, w, h, '.');
// 풀숲
for (const [x, y, w, h] of [[2, 9, 5, 3], [15, 9, 6, 3], [8, 18, 6, 3], [2, 20, 3, 5], [14, 3, 5, 2], [2, 2, 5, 2]] as const) fill(g, x, y, w, h, '"');
fill(g, 18, 17, 4, 3, '~'); // 숲속 연못

// 길
fill(g, 11, 0, 2, 6, ':');
fill(g, 5, 5, 8, 2, ':');
fill(g, 5, 5, 2, 11, ':');
fill(g, 5, 14, 13, 2, ':');
fill(g, 16, 14, 2, 11, ':');
fill(g, 11, 23, 7, 2, ':');
fill(g, 12, 25, 1, 5, ':'); // 남쪽 끝은 한 칸 폭(문지기)
put(g, 13, 27, '.'); // 문지기가 비켜설 칸

const rand = rng(7);
scatter(g, rand, 'f', 14);
scatter(g, rand, 'o', 3);
put(g, 10, 3, 'Y');
fill(g, 10, 10, 3, 1, '.'); put(g, 10, 2, '.'); put(g, 6, 19, '.'); // 빈터끼리 잇기

export const forest: MapData = {
  id: 'forest',
  name: '오디 숲',
  region: 'meadow',
  rows: rows(g),
  warps: [
    { x: 11, y: 0, to: { map: 'town', x: 16, y: 22, facing: 'up' } },
    { x: 12, y: 0, to: { map: 'town', x: 16, y: 22, facing: 'up' } },
    { x: 12, y: 29, to: { map: 'route3', x: 11, y: 1, facing: 'down' } },
  ],
  npcs: [
    { id: 'forest-bugboy', name: '곤충 소년', x: 8, y: 12, facing: 'down',
      look: { hair: '#2a2a2a', skin: '#f6d2b0', shirt: '#7ac04a', pants: '#4a3a2a', hat: '#e0c070' },
      lines: ['숲속 풀숲에는 벌레 오디랑 풀 오디가 많아.', '로프가 떨어지면 마을 상점에서 사 와!'] },
    { id: 'forest-hiker', name: '등산객', x: 15, y: 21, facing: 'right',
      look: { hair: '#5a3a20', skin: '#e8b890', shirt: '#d94f3d', pants: '#3a3a3a', hat: '#8a6a3a' },
      lines: ['이 숲을 빠져나가면 꽁꽁 언 설원이 나와.', '설원 오디들은 레벨이 높으니 충분히 키우고 가!'] },
    { id: 'gate-snow', name: '문지기', x: 12, y: 27, facing: 'up',
      look: { hair: '#2a2a2a', skin: '#e8b890', shirt: '#3a5a8a', pants: '#2a2a3a', hat: '#2a3a5a' },
      lines: ['이 앞은 설원으로 가는 3번 길이야.', '사막 배지가 있어야 지나갈 수 있어. 사막 마을 체육관을 이기고 와!'],
      gate: { badges: ['desert'], aside: { x: 13, y: 27 }, open: ['사막 배지구나! 지나가. 따뜻하게 입고 가!'] } },
  ],
  signs: [{ x: 10, y: 3, text: '오디 숲 — 남쪽 끝은 3번 길 · 설원 마을 (사막 배지가 필요해요)' }],
};
