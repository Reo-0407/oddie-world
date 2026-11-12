import type { MapData } from './types.ts';

// 오디 숲(초원): 오디 마을 남쪽. 두 칸 폭 숲길, 가운데 햇살 드는 쉼터(연못·벤치·간판),
// 북동쪽 작은 꽃 빈터, 남서쪽 풀숲 빈터. 남쪽 끝 문지기(사막 배지) 너머 3번 길(설원)
// L = 햇살 드는 풀, b = 벤치
const ROWS = [
  'TTTTTTTTTTT::TTTTTTTTTTT',
  'TTTTTTTTTT.::.TTTTTTTTTT',
  'TTTTT..TT..::..TT..""TTT',
  'TTT."""".fY::.L.T."""".T',
  'TT.""::::::::...."""""TT',
  'TT.""::::::::.fL."""".TT',
  'TTT."::..TTTTTLfTT.""TTT',
  'TT.""::.TTTTTTTTTTTTTTTT',
  'TTT."::."TTTTTTTTTTTTTTT',
  'TT.""::""".TTTTTTTTTTTTT',
  'TTT."::""..TTTTT..TTTTTT',
  'TT.f.::.L.f..T.f..L.TTTT',
  'TTf..::....~~~~.f..f.TTT',
  'TT...::..b~~~~~~..L..TTT',
  'TT.f.::.Y.~~~~~~.f....TT',
  'TT...::....~~~~..f.L.TTT',
  'TTT.f::.f...L.......TTTT',
  'TTT..:::::::::::::..TTTT',
  'TTTT.:::::::::::::.TTTTT',
  'TTTT""""".TTTTTT::"".TTT',
  'TTT."""""LTTTTTT::"""TTT',
  'TTTf"""".fTTTTT"::""".TT',
  'TTTT.f..TTTTTTT"::"".TTT',
  'TTTTTTTTTTTTT.".::.TTTTT',
  'TTTTTTTTT.f:::::::".TTTT',
  'TTTTTTTTT".:::::::.TTTTT',
  'TTTTTTTTTT"::..TTTTTTTTT',
  'TTTTTTTTTTTT:.TTTTTTTTTT',
  'TTTTTTTTTTTT:TTTTTTTTTTT',
  'TTTTTTTTTTTT:TTTTTTTTTTT',
];

export const forest: MapData = {
  id: 'forest',
  name: '오디 숲',
  region: 'meadow',
  rows: ROWS,
  warps: [
    { x: 11, y: 0, to: { map: 'town', x: 14, y: 25, facing: 'up' } },
    { x: 12, y: 0, to: { map: 'town', x: 14, y: 25, facing: 'up' } },
    { x: 12, y: 29, to: { map: 'route3', x: 11, y: 1, facing: 'down' } },
  ],
  npcs: [
    { id: 'forest-bugboy', name: '곤충 소년', x: 17, y: 13, facing: 'left',
      look: { hair: '#2a2a2a', skin: '#f6d2b0', shirt: '#7ac04a', pants: '#4a3a2a', hat: '#e0c070' },
      lines: ['여기는 숲속 쉼터야. 햇살이 드는 곳엔 벌레 오디가 모여.', '로프가 떨어지면 마을 상점에서 사 와!'] },
    { id: 'forest-hiker', name: '등산객', x: 6, y: 22, facing: 'up',
      look: { hair: '#5a3a20', skin: '#e8b890', shirt: '#d94f3d', pants: '#3a3a3a', hat: '#8a6a3a' },
      lines: ['이 숲을 빠져나가면 꽁꽁 언 설원이 나와.', '설원 오디들은 레벨이 높으니 충분히 키우고 가!'] },
    { id: 'gate-snow', name: '문지기', x: 12, y: 27, facing: 'up',
      look: { hair: '#2a2a2a', skin: '#e8b890', shirt: '#3a5a8a', pants: '#2a2a3a', hat: '#2a3a5a' },
      lines: ['이 앞은 설원으로 가는 3번 길이야.', '사막 배지가 있어야 지나갈 수 있어. 사막 마을 체육관을 이기고 와!'],
      gate: { badges: ['desert'], aside: { x: 13, y: 27 }, open: ['사막 배지구나! 지나가. 따뜻하게 입고 가!'] } },
  ],
  items: [
    { id: 'forest-sturdy', x: 9, y: 20, gift: 'sturdy', n: 1 },
    { id: 'forest-rope', x: 21, y: 5, gift: 'rope', n: 3 },
  ],
  signs: [
    { x: 10, y: 3, text: '오디 숲 — 남쪽 끝은 3번 길 · 설원 마을 (사막 배지가 필요해요)' },
    { x: 8, y: 14, text: '숲속 쉼터 — 벤치에 앉아 연못을 바라보며 쉬어 가세요.' },
  ],
};
