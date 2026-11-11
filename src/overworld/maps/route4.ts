import type { MapData, NpcLook } from './types.ts';
import { border, fill, grid, put, rng, rows, scatter } from './util.ts';

// 4번 길(화산): 설원 마을 동쪽에서 화산 마을까지. 재 바닥, 화산암, 용암 웅덩이, 그을린 나무, 재 풀숲
const W = 44;
const H = 16;
const g = grid(W, H, '.');
border(g, 'o', 1);
fill(g, 0, 14, W, 2, 'o');
const rand = rng(44);
scatter(g, rand, 'T', 12, 'o');

fill(g, 2, 2, 5, 3, 'v'); fill(g, 24, 13, 8, 1, 'v'); fill(g, 36, 2, 6, 2, 'v'); // 화산암 바닥
// 재 풀숲
for (const [x, y, w, h] of [[1, 9, 6, 4], [11, 5, 9, 3], [23, 5, 8, 3], [36, 9, 6, 4], [13, 10, 6, 3]] as const) fill(g, x, y, w, h, '"');
// 용암 웅덩이
for (const [x, y, w, h] of [[2, 5, 4, 2], [14, 8, 5, 2], [23, 8, 6, 2], [37, 2, 4, 2], [29, 12, 4, 2], [10, 1, 3, 2]] as const) fill(g, x, y, w, h, 'l');

// 길
fill(g, 0, 7, 10, 2, ':');
fill(g, 8, 3, 2, 6, ':');
fill(g, 8, 3, 15, 2, ':');
fill(g, 21, 3, 2, 10, ':');
fill(g, 21, 11, 14, 2, ':');
fill(g, 33, 6, 2, 7, ':');
fill(g, 33, 6, 11, 2, ':');

scatter(g, rand, 'o', 10);
scatter(g, rand, 'T', 6);
for (const [x, y] of [[5, 6], [15, 5], [28, 10], [2, 6], [42, 5]]) put(g, x, y, '.');
put(g, 2, 6, 'Y'); put(g, 42, 5, 'Y');

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#e8b890', shirt, pants, hat });

export const route4: MapData = {
  id: 'route4',
  name: '4번 길',
  region: 'volcano',
  rows: rows(g),
  warps: [
    { x: 0, y: 7, to: { map: 'snow-town', x: 28, y: 8, facing: 'left' } },
    { x: 0, y: 8, to: { map: 'snow-town', x: 28, y: 8, facing: 'left' } },
    { x: 43, y: 6, to: { map: 'volcano-town', x: 1, y: 9, facing: 'right' } },
    { x: 43, y: 7, to: { map: 'volcano-town', x: 1, y: 10, facing: 'right' } },
  ],
  npcs: [
    { id: 'route4-firebreather', name: '불 뿜는 곡예사', x: 5, y: 6, facing: 'down', look: look('#d94f3d', '#e0892f', '#3a2a2a'),
      lines: ['불은 무섭지만 아름다워.'],
      trainer: { sight: 2, before: ['내 불꽃 쇼를 구경할래?'], after: ['불이 꺼져 버렸네…'] } },
    { id: 'route4-miner', name: '광부', x: 15, y: 5, facing: 'up', look: look('#2a2a2a', '#5a4a48', '#3a2a2a', '#e0b030'),
      lines: ['화산암 속에는 보석이 숨어 있지.'],
      trainer: { sight: 2, before: ['곡괭이질로 단련한 내 오디다!'], after: ['오늘은 일찍 퇴근해야겠다.'] } },
    { id: 'route4-veteran', name: '노련한 트레이너', x: 28, y: 10, facing: 'down', look: look('#888888', '#8a2a2a', '#2a2a3a', '#2a2a2a'),
      lines: ['화산 마을 관장은 정말 강하다고.'],
      trainer: { sight: 2, before: ['여기까지 온 걸 보니 꽤 하는구나. 덤벼라!'], after: ['훌륭해. 챔피언도 노려 볼 만하겠어.'] } },
  ],
  signs: [
    { x: 2, y: 6, text: '4번 길 — 동쪽으로 화산 마을. 용암에 들어가지 마세요!' },
    { x: 42, y: 5, text: '→ 화산 마을' },
  ],
};
