import type { MapData, NpcLook } from './types.ts';

// 4번 길(화산): 설원 마을 동쪽에서 화산 마을까지. 재 바닥, 화산암 바닥(v), 모양이 제각각인 용암 웅덩이, 그을린 나무, 재 풀숲
const ROWS = [
  'oooooooooooooooooooooooooooooooooooooooooooo',
  'oooooooTooooooooooooooooToooooooooooooTooooo',
  'o.ll..v...o....vvv...........o........llll.o',
  'ollll.v.:::::::::::::::.........o....lllv..o',
  'o.lll...:::::::::::::::.""""""""......vvvv.o',
  'o.....T.::.""""."""".::.""""""".o.........Yo',
  'o.Y.....::.""""""""".::.""""""...:::::::::::',
  '::::::::::....lll....::..llll....:::::::::::',
  '::::::::::...lllll...::.llvvll...::...o....o',
  'o""""""..v....llv....::..llll....::."""""".o',
  'o""""""".ll...v......::..........::."""""""o',
  'o""""".olll."""""""".::::::::::::::."""""".o',
  'o""""..vll.."""""""..::::::::::::::.T"""".vo',
  'o..T......vv.""""".......vvv.llll...vv.....o',
  'oooooooooooooooooooooooooooooooooooooooooooo',
  'oooooooooooooooooooooooooooooooooooooooooooo',
];

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#e8b890', shirt, pants, hat });

export const route4: MapData = {
  id: 'route4',
  name: '4번 길',
  region: 'volcano',
  rows: ROWS,
  warps: [
    { x: 0, y: 7, to: { map: 'snow-town', x: 30, y: 9, facing: 'left' } },
    { x: 0, y: 8, to: { map: 'snow-town', x: 30, y: 9, facing: 'left' } },
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
  items: [
    { id: 'r4-potion', x: 42, y: 13, gift: 'potion', n: 3 },
    { id: 'r4-sturdy', x: 30, y: 2, gift: 'sturdy', n: 2 },
  ],
  signs: [
    { x: 2, y: 6, text: '4번 길 — 동쪽으로 화산 마을. 용암에 들어가지 마세요!' },
    { x: 42, y: 5, text: '→ 화산 마을' },
  ],
};
