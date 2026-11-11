import type { MapData, NpcLook } from './types.ts';
import { border, fill, grid, put, rng, rows, scatter } from './util.ts';

// 2번 길(사막): 1번 길 동쪽 끝에서 사막 마을까지. 모래 물결, 선인장, 사암 바위, 마른 풀숲
const W = 44;
const H = 16;
const g = grid(W, H, '.');
border(g, 'o', 2);
const rand = rng(22);
scatter(g, rand, 'T', 10, 'o');

fill(g, 2, 2, 6, 4, 's'); fill(g, 34, 2, 7, 2, 's'); fill(g, 6, 12, 10, 2, 's'); // 고운 모래 언덕
// 마른 풀숲
for (const [x, y, w, h] of [[2, 10, 8, 3], [14, 6, 11, 4], [31, 5, 9, 4], [15, 10, 10, 3], [33, 12, 9, 2], [20, 2, 6, 1]] as const) fill(g, x, y, w, h, '"');

// 길: 서쪽 7~8줄 → 위로 → 3~4줄 → 아래로 → 10~11줄 → 동쪽
fill(g, 0, 7, 13, 2, ':');
fill(g, 11, 3, 2, 6, ':');
fill(g, 11, 3, 18, 2, ':');
fill(g, 27, 3, 2, 9, ':');
fill(g, 27, 10, 17, 2, ':');

scatter(g, rand, 'C', 22);
scatter(g, rand, 'o', 8);
for (const [x, y] of [[6, 6], [20, 5], [35, 9], [2, 6], [42, 9]]) put(g, x, y, '.');
put(g, 2, 6, 'Y');
put(g, 42, 9, 'Y');

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#e8b890', shirt, pants, hat });

export const route2: MapData = {
  id: 'route2',
  name: '2번 길',
  region: 'desert',
  rows: rows(g),
  warps: [
    { x: 0, y: 7, to: { map: 'route1', x: 38, y: 6, facing: 'left' } },
    { x: 0, y: 8, to: { map: 'route1', x: 38, y: 6, facing: 'left' } },
    { x: 43, y: 10, to: { map: 'desert-town', x: 1, y: 9, facing: 'right' } },
    { x: 43, y: 11, to: { map: 'desert-town', x: 1, y: 10, facing: 'right' } },
  ],
  npcs: [
    { id: 'route2-hiker', name: '사막 등산가', x: 6, y: 6, facing: 'down', look: look('#5a3a20', '#c27a44', '#4a3a2a', '#8a6a3a'),
      lines: ['모래 언덕은 걷기 힘들어.'],
      trainer: { sight: 3, before: ['사막 한가운데서 만났으니 승부다!'], after: ['물… 물 좀…'] } },
    { id: 'route2-camper', name: '캠핑족', x: 20, y: 5, facing: 'up', look: look('#2a2a2a', '#3a9a4a', '#3a3a2a', '#e0892f'),
      lines: ['밤이 되면 사막은 엄청 추워져.'],
      trainer: { sight: 2, before: ['내 텐트 앞을 지나가려면 이겨야지!'], after: ['캠핑은 역시 쉬는 게 최고야.'] } },
    { id: 'route2-ranger', name: '사막 순찰대', x: 35, y: 9, facing: 'down', look: look('#3a2a20', '#e0b030', '#5a4a2a', '#c27a44'),
      lines: ['사막 마을은 바로 저 앞이야.'],
      trainer: { sight: 2, before: ['순찰 중! 실력을 확인하겠다!'], after: ['좋아, 통과!'] } },
  ],
  signs: [
    { x: 2, y: 6, text: '2번 길 — 동쪽으로 사막 마을. 선인장 가시 조심!' },
    { x: 42, y: 9, text: '→ 사막 마을' },
  ],
};
