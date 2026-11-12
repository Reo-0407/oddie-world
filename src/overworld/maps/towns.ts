import type { MapData, NpcLook } from './types.ts';
import { GYM_ENTRY } from './house.ts';

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#f6d2b0', shirt, pants, hat });
const enter = (map: string, x: number, y: number) => ({ map, x, y, facing: 'up' as const });
const guard = (shirt: string, hat: string): NpcLook => ({ hair: '#2a2a2a', skin: '#e8b890', shirt, pants: '#2a2a3a', hat });

// ---------- 사막 마을 (북동) ----------
// 위: 센터·상점·체육관, 가운데 큰길, 아래: 야자수 둘린 오아시스(서), 차양 노점 시장(동). A 노점 u 항아리
const DESERT_ROWS = [
  'oooooooooooooooooooooooooooooo',
  'ooTooooooooToooooooooooooToooo',
  'oo.......T....C...ss.......ooo',
  'ooRRRRRRR..BBBBB..OOOOOOOOOooo',
  'o.RRRRRRR..BBBBB..OOOOOOOOO.oo',
  'oTRRRRRRR.CBBBBB..OOOOOOOOO.oo',
  'o.WwWWWwW..WwWwW..WwWwWwWwW.oo',
  'o.WWWDWWWu.WWDWW.uWwWwWwWwW.oo',
  'o....:Y......:Y..YWWWWDWWWW.oo',
  '::::::::::::::::::::::::::::oo',
  '::::::::::::::::::::::::::::oo',
  'o.Y.T........T.:............oo',
  'o..T..~~~~~~...:.AA.u.AA.u.Coo',
  'o.C..~~~~~~~~..::::::::::::.oo',
  'o...~~~~~~~~~~.:.sssss.sss.Too',
  'o.T..~~~~~~~~.T:.sTssssuu.s.oo',
  'o.....~~~~~~...:............oo',
  'o.u.T........T.::::::::::...oo',
  'oT..u.T....T....AA.u.AA..T.Too',
  'o...T.ss.T..ss.T.....u..T..ooo',
  'ooooTooooooooooToooooooooooooo',
  'oooooooooooooooooooooooooooooo',
];

export const desert: MapData = {
  id: 'desert-town', name: '사막 마을', region: 'desert', rows: DESERT_ROWS,
  warps: [
    { x: 0, y: 9, to: { map: 'route2', x: 42, y: 10, facing: 'left' } },
    { x: 0, y: 10, to: { map: 'route2', x: 42, y: 11, facing: 'left' } },
    { x: 5, y: 7, to: enter('center-desert', 4, 6) },
    { x: 13, y: 7, to: enter('shop-desert', 3, 6) },
    { x: 22, y: 8, to: enter('gym-desert', GYM_ENTRY.x, GYM_ENTRY.y) },
  ],
  npcs: [
    { id: 'desert-girl', name: '오아시스 소녀', x: 9, y: 17, facing: 'up', look: look('#2a2a2a', '#4ab0d8', '#e0b030'),
      lines: ['이 오아시스 물은 정말 시원해!', '사막 오디들은 땅과 바위 타입이 많대.'] },
    { id: 'desert-elder', name: '사막 할아버지', x: 20, y: 16, facing: 'up', look: look('#dddddd', '#c27a44', '#5a4a2a', '#f4d49a'),
      lines: ['모래 관장은 땅 타입 오디를 쓴단다.', '물이나 풀 타입 오디가 있으면 든든하지.'] },
    { id: 'desert-merchant', name: '노점 상인', x: 19, y: 12, facing: 'down', look: look('#3a2a20', '#d94f3d', '#5a4a2a', '#f4d49a'),
      lines: ['어서 와! 선인장 열매 주스 한 잔 어때?', '…농담이야. 로프랑 회복약은 파란 지붕 상점에서 팔아.'] },
  ],
  signs: [
    { x: 6, y: 8, text: '오디 센터 — 지친 오디를 쉬게 해 드립니다.' },
    { x: 14, y: 8, text: '오디 상점 — 로프와 회복약을 팔아요.' },
    { x: 17, y: 8, text: '사막 체육관 — 관장 모래. 뜨거운 승부를 기다립니다!' },
    { x: 2, y: 11, text: '사막 마을 — 모래 바람이 부는 오아시스 마을. 남동쪽은 시장!' },
  ],
};

// ---------- 설원 마을 (남서) ----------
// 북쪽 3번 길에서 내려오는 길, 위: 센터·상점·체육관(서로 띄움), 아래: 눈사람과 벤치가 있는 꽁꽁 언 호수
const SNOW_ROWS = [
  'TTTTTTTTTT::TTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTT.::.TTTTTTTTTTTTTTTTTTT',
  'TT.n..TT..::..n.TT...nn.......TT',
  'T.RRRRRRR.::.BBBBB..ZZZZZZZZZ.TT',
  'TTRRRRRRR.::.BBBBB..ZZZZZZZZZ.TT',
  'T.RRRRRRRn::.BBBBBn.ZZZZZZZZZ.TT',
  'T.WwWWWwW.::.WwWwW..WwWwWwWwW.TT',
  'T.WWWDWWW.::.WWDWW.SWwWwWwWwWnTT',
  'T....:Y...::...:Y..YWWWWDWWWW.TT',
  'T:::::::::::::::::::::::::::::::',
  'T::::::::::::::::::::::::::::TTT',
  'T..Y.n....T......n.....T...n..TT',
  'Tn....S........S......nn.T....TT',
  'T..T...iiiiiii...n.....nn.....TT',
  'T....iiiiiiiiiii..b........T..TT',
  'Tn..iiiiiiiiiiiii.b....S.....TTT',
  'Tnn.iiiiioiiiiiii...nnn....n..TT',
  'TT...iiiiiiiiiii.S.....T......TT',
  'Tn.....iiiiiii....nnn....S....TT',
  'TTT...n.........T....TT..n....TT',
  'TTT...TT.....TTTT....TTT.....TTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];

export const snow: MapData = {
  id: 'snow-town', name: '설원 마을', region: 'snow', rows: SNOW_ROWS,
  warps: [
    { x: 10, y: 0, to: { map: 'route3', x: 9, y: 38, facing: 'up' } },
    { x: 11, y: 0, to: { map: 'route3', x: 10, y: 38, facing: 'up' } },
    { x: 31, y: 9, to: { map: 'route4', x: 1, y: 7, facing: 'right' } },
    { x: 5, y: 7, to: enter('center-snow', 4, 6) },
    { x: 15, y: 7, to: enter('shop-snow', 3, 6) },
    { x: 24, y: 8, to: enter('gym-snow', GYM_ENTRY.x, GYM_ENTRY.y) },
  ],
  npcs: [
    { id: 'snow-kid', name: '눈사람 꼬마', x: 12, y: 19, facing: 'up', look: look('#3a2a20', '#e8484f', '#3a3a5a', '#ffffff'),
      lines: ['호수가 꽁꽁 얼어서 그 위를 걸을 수 있어! 눈사람은 내가 만들었어.', '서리 관장님은 얼음 타입 오디를 써. 불 타입이 강하대.'] },
    { id: 'snow-lady', name: '털모자 아주머니', x: 22, y: 14, facing: 'left', look: look('#8a4a20', '#8a5ac8', '#3a3a5a', '#e8484f'),
      lines: ['벤치에 앉아 언 호수를 보는 게 내 낙이란다. 감기 조심하렴.', '동쪽 4번 길 너머는 펄펄 끓는 화산이란다.'] },
    { id: 'gate-volcano', name: '문지기', x: 29, y: 9, facing: 'left', look: guard('#3a5a8a', '#2a3a5a'),
      lines: ['이 앞은 화산으로 가는 4번 길이야.', '설원 배지가 있어야 지나갈 수 있어. 설원 체육관에 도전해 봐!'],
      gate: { badges: ['snow'], aside: { x: 29, y: 8 }, open: ['설원 배지구나! 화산은 뜨거우니 조심해!'] } },
  ],
  signs: [
    { x: 6, y: 8, text: '오디 센터 — 지친 오디를 쉬게 해 드립니다.' },
    { x: 16, y: 8, text: '오디 상점 — 로프와 회복약을 팔아요.' },
    { x: 19, y: 8, text: '설원 체육관 — 관장 서리. 얼음처럼 차가운 승부!' },
    { x: 3, y: 11, text: '설원 마을 — 눈과 얼음의 마을. 동쪽은 4번 길(설원 배지가 필요해요)' },
  ],
};

// ---------- 화산 마을 (남동) + 챔피언의 전당 ----------
// 위: 센터·상점·체육관, 큰길. 남서: 용암 못과 대장간 터. 남동: 용암 해자로 둘린 전당 —
// 문지기(27,11)를 지나 오른쪽 길로 내려가 횃불(t)이 늘어선 세 칸 폭 참배길을 올라 전당 문으로
const VOLCANO_ROWS = [
  'oooooooooooooooooooooooooooooo',
  'oooToooooooooTooooooooooTooooo',
  'oo.v....o...vv.....v.....T.ooo',
  'o.RRRRRRR..BBBBB..QQQQQQQQQ.oo',
  'ooRRRRRRR..BBBBB..QQQQQQQQQ.oo',
  'o.RRRRRRR.oBBBBB..QQQQQQQQQToo',
  'o.WwWWWwW..WwWwWt.WwWwWwWwW.oo',
  'o.WWWDWWW..WWDWW..WwWwWwWwW.oo',
  'o....:Y......:Y..YWWWWDWWWW.oo',
  ':::::::::::::::::::::::::::::o',
  ':::::::::::::::::::::::::::::o',
  'o.Y....v................Y..:to',
  'o..vvvv..o.....looooooooooo::o',
  'o.vllllv.......lUUUUUUUUUll::o',
  'ovllllllv......lUUUUUUUUUll::o',
  'ovllllll..o....lUUUUUUUUUlo::o',
  'o.vllllv.......lUUUUUUUUUll::o',
  'o..vvv.........lWwWwWwWwWll::o',
  'o....o.........lWwWwWwWwWol::o',
  'o....llll......lWWWWDWWWWll::o',
  'o...llllll.....lvvt:::tvvll::o',
  'o....llll......lvv.:::.vvlo::o',
  'o.T............lvvt:::tvvvv::o',
  'o...o..........l:::::::::::::o',
  'o..............lvvtvvvtvvvvv.o',
  'oooooooooooooooooooooooooooooo',
  'oooooooooooooooooooooooooooooo',
];

export const volcano: MapData = {
  id: 'volcano-town', name: '화산 마을', region: 'volcano', rows: VOLCANO_ROWS,
  warps: [
    { x: 0, y: 9, to: { map: 'route4', x: 42, y: 6, facing: 'left' } },
    { x: 0, y: 10, to: { map: 'route4', x: 42, y: 7, facing: 'left' } },
    { x: 5, y: 7, to: enter('center-volcano', 4, 6) },
    { x: 13, y: 7, to: enter('shop-volcano', 3, 6) },
    { x: 22, y: 8, to: enter('gym-volcano', GYM_ENTRY.x, GYM_ENTRY.y) },
    { x: 20, y: 19, to: enter('hall', GYM_ENTRY.x, GYM_ENTRY.y) },
  ],
  npcs: [
    { id: 'volcano-smith', name: '대장장이', x: 11, y: 18, facing: 'up', look: look('#2a2a2a', '#5a4a48', '#3a2a2a', '#d94f3d'),
      lines: ['용암 웅덩이는 절대 밟으면 안 돼!', '불꽃 관장은 불 타입. 물 타입이 잘 통하지.'] },
    { id: 'volcano-fan', name: '챔피언 팬', x: 19, y: 11, facing: 'up', look: look('#e8c040', '#8a5ac8', '#3a3a5a'),
      lines: ['저 금색 지붕이 챔피언의 전당이야! 횃불 길이 정말 멋지지?', '배지 네 개를 모은 트레이너만 들어갈 수 있대.'] },
    { id: 'gate-hall', name: '전당 문지기', x: 27, y: 11, facing: 'up', look: guard('#e0b030', '#8a5ac8'),
      lines: ['이 앞은 챔피언의 전당이다.', '초원·사막·설원·화산 배지 네 개가 모두 있어야 지나갈 수 있어.'],
      gate: { badges: ['meadow', 'desert', 'snow', 'volcano'], aside: { x: 26, y: 11 }, open: ['배지 네 개! 챔피언이 기다리고 있다. 행운을 빈다!'] } },
  ],
  signs: [
    { x: 6, y: 8, text: '오디 센터 — 지친 오디를 쉬게 해 드립니다.' },
    { x: 14, y: 8, text: '오디 상점 — 로프와 회복약을 팔아요.' },
    { x: 17, y: 8, text: '화산 체육관 — 관장 불꽃. 불타는 승부!' },
    { x: 2, y: 11, text: '화산 마을 — 용암이 흐르는 마을. 용암 조심!' },
    { x: 24, y: 11, text: '→ 챔피언의 전당 (배지 4개가 필요해요)' },
  ],
};
