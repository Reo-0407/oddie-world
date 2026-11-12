import type { MapData, NpcLook } from './types.ts';

// 2번 길(사막): 1번 길 동쪽 끝에서 사막 마을까지. 사암 절벽(o) 테두리, 고운 모래 언덕(s),
// 마른 풀숲, 선인장 무리(길섶은 비워 둔다), 동쪽 끝 야자수 오아시스
const ROWS = [
  'oooooooooooooooooooooooooooooooooooooooooooo',
  'ooTooooooooooooooooooooToooooooooooooooToooo',
  'oossss.C..o.........o.........""""""...Toooo',
  'oosssss.C..::::::::::::::::::."""""".C.T~~~o',
  'oossss.CC..::::::::::::::::::.."""""".T~~~~o',
  'oosss.o....::..............::..""""""..T~~To',
  'ooY........::."""""""""""".::..""""""".C.Coo',
  ':::::::::::::."""""""""""".::.o"""""""...ooo',
  ':::::::::::::."""""""""""..::...""""".C...oo',
  'oo.............C....o......::.............Yo',
  'oo"""""""".C..ssss.......C.:::::::::::::::::',
  'oo""""""""...o"""""""""""..:::::::::::::::::',
  'oo""""""".C.ss"""""""""".C.................o',
  'oosssC......o."""""""".sssss.C."""""""".C.oo',
  'oooooooooToooooooooooosssooooooooooooooooooo',
  'oooooooooooooooooooooooooooooooooooooooooooo',
];

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#e8b890', shirt, pants, hat });

export const route2: MapData = {
  id: 'route2',
  name: '2번 길',
  region: 'desert',
  rows: ROWS,
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
      lines: ['사막 마을은 바로 저 앞이야. 저 위 야자수 옆 물웅덩이도 가 봐!'],
      trainer: { sight: 2, before: ['순찰 중! 실력을 확인하겠다!'], after: ['좋아, 통과!'] } },
  ],
  items: [
    { id: 'r2-potion', x: 40, y: 7, gift: 'potion', n: 2 },
    { id: 'r2-coins', x: 3, y: 12, gift: 'coins', n: 100 },
  ],
  signs: [
    { x: 2, y: 6, text: '2번 길 — 동쪽으로 사막 마을. 선인장 가시 조심!' },
    { x: 42, y: 9, text: '→ 사막 마을' },
  ],
};
