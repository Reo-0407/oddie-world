import type { MapData, Npc } from './types.ts';
import { GYM_ENTRY } from './house.ts';

// 오디 마을(초원). 위: 센터·상점·체육관, 가운데 큰길, 아래: 집 두 채·꽃밭·연못·연구소.
// 동쪽 문지기(27,20) 너머 1번 길, 남쪽 문지기(14,24) 너머 오디 숲
// 문자: T 나무 . 풀 : 길 ~ 물 H 나무다리 f 꽃 = 울타리 Y 간판 b 벤치, 지붕 R/B/N/O/P/G
const ROWS = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTT..TTTTTTTTTTT...TTTTTTTT',
  'TT..f......TT.f.....f.......TT',
  'T..RRRRRRR..BBBBB..NNNNNNNNNTT',
  'TT.RRRRRRR..BBBBB..NNNNNNNNNTT',
  'T..RRRRRRRT.BBBBB.TNNNNNNNNNTT',
  'T.fWwWWWwW..WwWwW..WwWwWwWwWTT',
  'T..WWWDWWW.fWWDWW..WwWwWwWwWTT',
  'T.....:Y......:Y..YWWWWDWWWWTT',
  'T:::::::::::::::::::::::::::TT',
  'T:::::::::::::::::::::::::::TT',
  'T..f.....f..Y.:...~~~~~..::TTT',
  'T.OOOOO.PPPPP.:..~~~~~~~.::TTT',
  'T.OOOOO.PPPPP.:..~~~~~~~f::TTT',
  'TTOOOOO.PPPPP.:..f~~H~~..::TTT',
  'T.WwWwW.WwWwW.:......f...::TTT',
  'T.WWDWW.WWDWW.:..GGGGGGGG::TTT',
  'T...:Y....:Y..:..GGGGGGGG::TTT',
  'T...:::::::::::..GGGGGGGG::TTT',
  'T.ffff.fff....:..WwWwWwwW::TTT',
  'T.fffffff.ff..:..WwWwWwwW:::::',
  'T..ffff.ff....:..WWWDWWWW...TT',
  'T.==========..:::::::Yf..TTTTT',
  'T.......T.....:......TT..TTTTT',
  'TTTTTTTTTTTTT.:TTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTT:TTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTT:TTTTTTTTTTTTTTT',
];

const signs = [
  { x: 7, y: 8, text: '오디 센터 — 지친 오디를 쉬게 해 드립니다.' },
  { x: 15, y: 8, text: '오디 상점 — 로프와 회복약을 팔아요.' },
  { x: 18, y: 8, text: '초원 체육관 — 도전자를 기다립니다.' },
  { x: 12, y: 11, text: '오디 마을 — 동쪽(오른쪽 아래)은 1번 길, 남쪽은 오디 숲. 처음이라면 먼저 연구소(회색 지붕)에 들러 박사님을 만나세요!' },
  { x: 5, y: 17, text: '민수네 집' },
  { x: 11, y: 17, text: '할머니네 집' },
  { x: 21, y: 22, text: '오디 연구소 — 오디의 비밀을 연구하는 곳.' },
];

const look = (hair: string, shirt: string, pants = '#3a4a8a', hat?: string) => ({ hair, skin: '#f6d2b0', shirt, pants, hat });
const npcs: Npc[] = [
  { id: 'town-girl', name: '소녀', x: 8, y: 11, facing: 'down', look: look('#8a4a20', '#f283c1', '#6a3a8a'),
    lines: ['안녕! 이 마을은 오디가 많아서 좋아.', '풀숲에는 야생 오디가 숨어 있대!'] },
  { id: 'town-fisher', name: '낚시꾼', x: 20, y: 14, facing: 'up', look: look('#555555', '#3a9a4a', '#4a3a2a', '#e0c070'),
    role: 'fisher',
    lines: ['이 연못엔 물 타입 오디가 산단다.', '낚시는 기다림의 예술이지. 너도 한번 해 볼래? 이 낚싯대를 주마!'],
    linesIf: { flag: 'rod', lines: ['물가를 바라보고 A(화면 탭)로 낚싯대를 던져.', '찌가 흔들리고 "!"가 뜨면 바로 탭! 늦으면 도망간단다.', '오아시스나 얼음 구멍에서도 낚을 수 있어.'] } },
  { id: 'town-oldman', name: '할아버지', x: 24, y: 11, facing: 'left', look: look('#dddddd', '#8a6a4a', '#555555'),
    lines: ['이 길로 내려가면 동쪽 1번 길이야.', '풀숲에는 야생 오디가 살아. 풀숲을 걸으면 오디가 튀어나올지도 몰라.'] },
  { id: 'town-guide', name: '이웃 누나', x: 9, y: 8, facing: 'down', look: look('#c9822a', '#3f78d8', '#2a3a5a'),
    lines: ['일어났구나! 박사님이 너를 찾으셨어.', '연구소는 마을 남쪽의 회색 지붕 건물이야. 첫 오디를 주신대!'],
    linesIf: { flag: 'starter', lines: ['첫 오디가 생겼구나! 정말 귀엽다.', '오디가 지치면 빨간 지붕 오디 센터에서 쉬게 해 줘.'] } },
  { id: 'town-gate-east', name: '마을 아저씨', x: 27, y: 20, facing: 'left', look: look('#4a3a2a', '#8a6a4a', '#3a3a3a', '#5a4a3a'),
    lines: ['앗, 잠깐! 오디 없이 풀숲에 가면 위험해.', '먼저 연구소의 박사님을 만나고 와!'],
    gate: { flag: 'starter', aside: { x: 27, y: 21 }, open: ['오디가 있으니 이제 안심이야. 조심해서 다녀와!'] } },
  { id: 'town-gate-south', name: '마을 아주머니', x: 14, y: 24, facing: 'up', look: look('#5a3a6a', '#e0892f', '#3a3a5a'),
    lines: ['숲에는 야생 오디가 잔뜩 있단다.', '연구소에서 오디를 받기 전에는 나갈 수 없어!'],
    gate: { flag: 'starter', aside: { x: 13, y: 24 }, open: ['숲을 지나면 설원이래. 감기 조심하렴!'] } },
];

export const town: MapData = {
  id: 'town',
  name: '오디 마을',
  region: 'meadow',
  rows: ROWS,
  warps: [
    { x: 6, y: 7, to: { map: 'center', x: 4, y: 6, facing: 'up' } },
    { x: 14, y: 7, to: { map: 'shop', x: 3, y: 6, facing: 'up' } },
    { x: 23, y: 8, to: { map: 'gym', ...GYM_ENTRY, facing: 'up' } },
    { x: 4, y: 16, to: { map: 'house1', x: 3, y: 5, facing: 'up' } },
    { x: 10, y: 16, to: { map: 'house2', x: 3, y: 5, facing: 'up' } },
    { x: 20, y: 21, to: { map: 'lab', x: 4, y: 7, facing: 'up' } },
    { x: 29, y: 20, to: { map: 'route1', x: 1, y: 6, facing: 'right' } },
    { x: 14, y: 26, to: { map: 'forest', x: 12, y: 1, facing: 'down' } },
  ],
  npcs,
  signs,
};
