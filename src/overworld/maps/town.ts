import type { MapData, Npc } from './types.ts';
import { building, fill, grid, put, rows } from './util.ts';

const W = 30;
const H = 24;
const g = grid(W, H, '.');

// 테두리 나무
fill(g, 0, 0, W, 2, 'T');
fill(g, 0, 22, W, 2, 'T');
fill(g, 0, 0, 1, H, 'T');
fill(g, 29, 0, 1, H, 'T');
for (let x = 2; x < W - 2; x += 3) put(g, x, 2, 'T');

// 길
fill(g, 1, 9, 28, 2, ':');
for (const x of [6, 14, 23]) put(g, x, 8, ':');
fill(g, 16, 11, 1, 10, ':');
fill(g, 5, 18, 12, 1, ':');
fill(g, 16, 20, 14, 1, ':');
fill(g, 27, 21, 3, 1, ':');

const center = building(g, { x: 3, y: 3, w: 7, roof: 3, wall: 2, color: 'R', door: 3, windows: [1, 5] });
const shop = building(g, { x: 12, y: 3, w: 5, roof: 3, wall: 2, color: 'B', door: 2, windows: [1, 3] });
const gym = building(g, { x: 19, y: 2, w: 9, roof: 3, wall: 3, color: 'N', door: 4, windows: [1, 3, 5, 7] });
const houseA = building(g, { x: 3, y: 13, w: 5, roof: 3, wall: 2, color: 'O', door: 2, windows: [1, 3] });
const houseB = building(g, { x: 10, y: 13, w: 5, roof: 3, wall: 2, color: 'P', door: 2, windows: [1, 3] });
const lab = building(g, { x: 18, y: 14, w: 8, roof: 3, wall: 3, color: 'G', door: 3, windows: [1, 3, 5, 6] });

fill(g, 19, 11, 6, 2, '~'); // 연못
fill(g, 3, 11, 6, 1, '='); fill(g, 11, 11, 4, 1, '='); fill(g, 2, 20, 12, 1, '='); // 울타리
for (const [x, y] of [
  [10, 4], [10, 5], [11, 6], [17, 4], [18, 6], [1, 3], [1, 5], [2, 6],
  [27, 12], [28, 13], [27, 14], [28, 15], [27, 16], [28, 17], [2, 14], [2, 16], [8, 14], [8, 15], [15, 14], [15, 15],
  [19, 21], [22, 21], [5, 21], [9, 21],
]) put(g, x, y, 'T');
for (const [x, y] of [[4, 8], [5, 12], [12, 8], [18, 12], [25, 12], [24, 13], [17, 13], [9, 19], [26, 18], [24, 21], [20, 8]]) put(g, x, y, 'f');
for (const [x, y] of [[10, 11], [26, 13], [1, 19]]) put(g, x, y, 'o');

// 간판(건물 앞)
const signs = [
  { x: 8, y: 8, text: '오디 센터 — 지친 오디를 쉬게 해 드립니다.' },
  { x: 11, y: 8, text: '오디 상점 — 로프와 회복약을 팔아요.' },
  { x: 21, y: 8, text: '초원 체육관 — 도전자를 기다립니다.' },
  { x: 8, y: 17, text: '민수네 집' },
  { x: 15, y: 17, text: '할머니네 집' },
  { x: 19, y: 21, text: '오디 연구소 — 오디의 비밀을 연구하는 곳.' },
  { x: 27, y: 19, text: '오디 마을 → 동쪽은 1번 길.' },
];
for (const s of signs) put(g, s.x, s.y, 'Y');
put(g, 28, 20, ':'); put(g, 29, 20, ':'); put(g, 29, 21, ':');

const look = (hair: string, shirt: string, pants = '#3a4a8a', hat?: string) => ({ hair, skin: '#f6d2b0', shirt, pants, hat });
const npcs: Npc[] = [
  { id: 'town-girl', name: '소녀', x: 10, y: 12, facing: 'right', look: look('#8a4a20', '#f283c1', '#6a3a8a'),
    lines: ['안녕! 이 마을은 오디가 많아서 좋아.', '풀숲에는 야생 오디가 숨어 있대!'] },
  { id: 'town-fisher', name: '낚시꾼', x: 18, y: 11, facing: 'right', look: look('#555555', '#3a9a4a', '#4a3a2a', '#e0c070'),
    lines: ['이 연못에는 물고기가 한 마리도 없어.', '그래도 여기 앉아 있으면 마음이 편해져. 너도 그렇지?'],
    choice: { options: ['응', '아니'], replies: [['그렇지? 역시 말이 통하는구나!'], ['그래? 그럼 한 바퀴 더 걸어 봐.']] } },
  { id: 'town-oldman', name: '할아버지', x: 25, y: 9, facing: 'left', look: look('#dddddd', '#8a6a4a', '#555555'),
    lines: ['동쪽 1번 길의 풀숲에는 야생 오디가 살아.', '풀숲을 걸으면 오디가 튀어나올지도 몰라.'] },
];

export const town: MapData = {
  id: 'town',
  name: '오디 마을',
  region: 'meadow',
  rows: rows(g),
  warps: [
    { x: center.x, y: center.y, to: { map: 'center', x: 4, y: 6, facing: 'up' } },
    { x: shop.x, y: shop.y, to: { map: 'shop', x: 3, y: 6, facing: 'up' } },
    { x: gym.x, y: gym.y, to: { map: 'gym', x: 5, y: 10, facing: 'up' } },
    { x: houseA.x, y: houseA.y, to: { map: 'house1', x: 3, y: 5, facing: 'up' } },
    { x: houseB.x, y: houseB.y, to: { map: 'house2', x: 3, y: 5, facing: 'up' } },
    { x: lab.x, y: lab.y, to: { map: 'lab', x: 4, y: 7, facing: 'up' } },
    { x: 29, y: 20, to: { map: 'route1', x: 1, y: 6, facing: 'right' } },
    { x: 29, y: 21, to: { map: 'route1', x: 1, y: 7, facing: 'right' } },
  ],
  npcs,
  signs,
};
