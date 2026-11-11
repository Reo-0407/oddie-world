import type { MapData, NpcLook } from './types.ts';
import { border, fill, grid, put, rng, rows, scatter } from './util.ts';

// 3번 길(설원): 오디 숲 남쪽에서 설원 마을까지 위에서 아래로. 눈 덮인 전나무, 얼음판, 눈 풀숲
const W = 22;
const H = 40;
const g = grid(W, H, '.');
border(g, 'T', 1);
const rand = rng(33);

fill(g, 12, 9, 7, 5, 'i'); fill(g, 2, 33, 5, 4, 'i'); // 얼음판
fill(g, 17, 22, 3, 6, 'n'); fill(g, 2, 13, 2, 5, 'n'); // 눈 더미
// 눈 풀숲
for (const [x, y, w, h] of [[13, 3, 7, 5], [7, 10, 5, 7], [1, 22, 3, 8], [6, 23, 8, 5], [17, 32, 4, 5], [12, 34, 3, 3]] as const) fill(g, x, y, w, h, '"');

// 길
fill(g, 10, 0, 2, 9, ':');
fill(g, 4, 7, 8, 2, ':');
fill(g, 4, 7, 2, 14, ':');
fill(g, 4, 19, 13, 2, ':');
fill(g, 15, 19, 2, 13, ':');
fill(g, 9, 30, 8, 2, ':');
fill(g, 9, 30, 2, 10, ':');

scatter(g, rand, 'T', 34);
scatter(g, rand, 'o', 6);
for (const [x, y] of [[8, 9], [6, 14], [13, 29], [12, 2]]) put(g, x, y, '.');
put(g, 12, 2, 'Y');

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#f6d2b0', shirt, pants, hat });

export const route3: MapData = {
  id: 'route3',
  name: '3번 길',
  region: 'snow',
  rows: rows(g),
  warps: [
    { x: 10, y: 0, to: { map: 'forest', x: 12, y: 28, facing: 'up' } },
    { x: 11, y: 0, to: { map: 'forest', x: 12, y: 28, facing: 'up' } },
    { x: 9, y: 39, to: { map: 'snow-town', x: 14, y: 1, facing: 'down' } },
    { x: 10, y: 39, to: { map: 'snow-town', x: 15, y: 1, facing: 'down' } },
  ],
  npcs: [
    { id: 'route3-skier', name: '스키어', x: 8, y: 9, facing: 'up', look: look('#e8c040', '#4ab0d8', '#2a3a6a', '#e8484f'),
      lines: ['눈 위를 미끄러지는 건 정말 신나!'],
      trainer: { sight: 2, before: ['내 스키보다 빠를 수 있어?'], after: ['넘어져 버렸다…'] } },
    { id: 'route3-diver', name: '얼음 낚시꾼', x: 6, y: 14, facing: 'left', look: look('#5a3a20', '#3a5a8a', '#3a3a3a', '#ffffff'),
      lines: ['얼음 구멍 아래에도 오디가 산대.'],
      trainer: { sight: 2, before: ['낚싯대 대신 오디로 승부다!'], after: ['오늘은 허탕이군.'] } },
    { id: 'route3-climber', name: '설산 등반가', x: 13, y: 29, facing: 'right', look: look('#3a2a20', '#d94f3d', '#3a3a5a', '#4ab0d8'),
      lines: ['설원 마을은 이 길 끝이야.'],
      trainer: { sight: 3, before: ['정상에 오르기 전에 몸 좀 풀자!'], after: ['너야말로 진짜 산사나이구나.'] } },
  ],
  signs: [{ x: 12, y: 2, text: '3번 길 — 남쪽으로 설원 마을. 꽁꽁 언 얼음판 주의!' }],
};
