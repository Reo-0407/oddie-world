import type { MapData } from './types.ts';

// 1번 길(초원): 오디 마을 동쪽. 모양이 제각각인 풀숲, 가운데 연못을 건너는 나무다리, 꽃밭.
// 동쪽 끝 한 칸 틈에 문지기(초원 배지) — 너머는 2번 길(사막)
const ROWS = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTT..TTTTTTTTTTTTT....TTTTTTTTTTT',
  'TT..""""..TTT.TTT.TT.""""".TT.""""..TTTT',
  'T.""""""".f..T.~~~.T."""""".o."""""".TTT',
  'T..""""""..f..~~~~~..""""".f.."""""..TTT',
  'T.Y.."""""...~~~~~~~."""".ff.......Y.TTT',
  ':::::::::::::HHHHHHH::::..f.....f.::::::',
  ':::::::::::::HHHHHHH:::::::::::::::::.TT',
  'T..."""""....~~~~~~~.f..::::::::::..oTTT',
  'T.."""""""....~~~~~.T.....fffff."""""TTT',
  'T."""""""......~~~.TT."""ffff.f."""""TTT',
  'TT""""""...o......T.""""""ffff.."""".TTT',
  'TTT""""...TT...TT."""""..TTf.....""".TTT',
  'TTTTT..TTTTT..TTTT..""".TTTTT..TTT..TTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];

export const route1: MapData = {
  id: 'route1',
  name: '1번 길',
  region: 'meadow',
  rows: ROWS,
  warps: [
    { x: 0, y: 6, to: { map: 'town', x: 28, y: 20, facing: 'left' } },
    { x: 0, y: 7, to: { map: 'town', x: 28, y: 20, facing: 'left' } },
    { x: 39, y: 6, to: { map: 'route2', x: 1, y: 7, facing: 'right' } },
  ],
  npcs: [
    // 길이 아래로 꺾이는 모퉁이 풀밭에서 윗줄 길을 지켜본다(아랫줄로 걸으면 피할 수 있다)
    { id: 'route1-kid', name: '꼬마 트레이너', x: 24, y: 6, facing: 'left',
      look: { hair: '#2a2a2a', skin: '#f6d2b0', shirt: '#e0892f', pants: '#2a4a7a', hat: '#d94f3d' },
      lines: ['나는 풀숲 지킴이야!'],
      trainer: { sight: 4, before: ['어? 너 오디 트레이너지?', '나랑 승부하자!'], after: ['으앙, 졌다…'] } },
    { id: 'route1-lass', name: '꽃 소녀', x: 29, y: 10, facing: 'up',
      look: { hair: '#8a4a20', skin: '#f6d2b0', shirt: '#f283c1', pants: '#6a3a8a' },
      lines: ['꽃밭에서 키운 내 오디들, 귀엽지?'],
      trainer: { sight: 3, before: ['꽃향기 맡으러 왔니?', '내 오디들이랑 놀아 줘!'], after: ['다음엔 꼭 이길 거야!'] } },
    { id: 'gate-desert', name: '문지기', x: 37, y: 6, facing: 'left',
      look: { hair: '#2a2a2a', skin: '#e8b890', shirt: '#3a5a8a', pants: '#2a2a3a', hat: '#2a3a5a' },
      lines: ['이 앞은 사막으로 가는 2번 길이야.', '초원 배지가 있어야 지나갈 수 있어. 오디 마을 체육관에 도전해 봐!'],
      gate: { badges: ['meadow'], aside: { x: 37, y: 7 }, open: ['초원 배지가 있구나! 지나가도 좋아. 사막은 덥다고!'] } },
  ],
  items: [
    { id: 'r1-potion', x: 1, y: 10, gift: 'potion', n: 1 },
    { id: 'r1-coins', x: 36, y: 4, gift: 'coins', n: 50 },
  ],
  signs: [
    { x: 2, y: 5, text: '1번 길 — 풀숲에는 야생 오디가 있어요! 연못 다리를 건너 동쪽으로.' },
    { x: 35, y: 5, text: '→ 2번 길 · 사막 마을 (초원 배지가 필요해요)' },
  ],
};
