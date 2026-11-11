import type { RegionId } from '../regions.ts';
import type { Dir, MapData, Npc, NpcLook } from './types.ts';
import { fill, grid, put, rows } from './util.ts';

const look = (hair: string, shirt: string, pants = '#3a4a8a', hat?: string): NpcLook => ({ hair, skin: '#f6d2b0', shirt, pants, hat });
type Out = { map: string; x: number; y: number };

/** 작은 실내: 위 두 줄은 뒷벽, 아래 줄 가운데 카펫 두 칸이 출구 */
function room(id: string, name: string, region: RegionId, w: number, h: number, floor: string, decorate: (g: string[][]) => void, npcs: Npc[], out: Out): MapData {
  const g = grid(w, h, floor);
  fill(g, 0, 0, w, 1, 'I'); fill(g, 0, 1, w, 1, 'J');
  fill(g, 0, 0, 1, h, 'I'); fill(g, w - 1, 0, 1, h, 'I');
  fill(g, 0, h - 1, w, 1, 'I');
  const cx = Math.floor(w / 2) - 1;
  fill(g, cx, h - 1, 2, 1, 'c');
  decorate(g);
  const to = { ...out, facing: 'down' as Dir };
  return {
    id, name, region, rows: rows(g), npcs, signs: [],
    warps: [{ x: cx, y: h - 1, to }, { x: cx + 1, y: h - 1, to }],
  };
}

/** 오디 센터(간호사가 회복). 들어오면 (4,6)에 선다 */
export const centerRoom = (id: string, region: RegionId, out: Out) => room(id, '오디 센터', region, 10, 8, '_', (g) => {
  fill(g, 4, 1, 2, 1, 'h'); fill(g, 3, 3, 4, 1, 'K'); put(g, 1, 1, 'h'); put(g, 8, 1, 'h'); put(g, 1, 5, 'h'); put(g, 8, 5, 'h');
  put(g, 2, 1, 'm');
}, [{ id: `${id}-nurse`, name: '간호사', x: 4, y: 2, facing: 'down', look: look('#f283c1', '#ffffff', '#f283c1'), role: 'nurse',
  lines: ['어서 오세요! 오디 센터예요.', '지친 오디들을 쉬게 해 드릴게요.'] }], out);

/** 오디 상점(점원이 상점 창을 연다). 들어오면 (3,6)에 선다 */
export const shopRoom = (id: string, region: RegionId, out: Out) => room(id, '오디 상점', region, 8, 8, '_', (g) => {
  put(g, 1, 1, 'h'); put(g, 2, 1, 'h'); put(g, 5, 1, 'h'); put(g, 6, 1, 'h'); fill(g, 2, 3, 4, 1, 'K'); put(g, 1, 5, 'h'); put(g, 6, 5, 'h');
}, [{ id: `${id}-clerk`, name: '점원', x: 3, y: 2, facing: 'down', look: look('#3a2a20', '#3f78d8', '#2a3a6a', '#3f78d8'), role: 'clerk',
  lines: ['어서 오세요! 무엇을 드릴까요?'] }], out);

export const GYM_ENTRY = { x: 5, y: 14 };

/**
 * 체육관: 가운데 통로(x 5~6) 양옆에 장식 기둥이 벽을 이루고, 기둥 틈 옆 칸에 트레이너가 통로를 지켜본다.
 * 맨 안쪽(5,2)에 관장. 들어오면 GYM_ENTRY에 선다
 */
export function gymRoom(id: string, name: string, region: RegionId, out: Out, npcs: Npc[]): MapData {
  const gaps = new Set(npcs.filter((n) => n.trainer && n.y > 3).map((n) => `${n.x < 5 ? 4 : 7},${n.y}`));
  return room(id, name, region, 12, 16, 'x', (g) => {
    put(g, 1, 1, 'm'); put(g, 10, 1, 'm');
    for (const x of [2, 3, 8, 9]) put(g, x, 2, 'X');
    for (let y = 4; y <= 13; y += 1) for (const x of [4, 7]) if (!gaps.has(`${x},${y}`)) put(g, x, y, 'X');
    // 양옆 칸은 막혀 있다: 트레이너 앞 틈으로만 통로가 보인다
    for (const y of [3, 14]) { fill(g, 1, y, 4, 1, 'X'); fill(g, 7, y, 4, 1, 'X'); }
  }, npcs, out);
}

const town = (x: number, y: number): Out => ({ map: 'town', x, y });

export const center = centerRoom('center', 'meadow', town(6, 8));
export const shop = shopRoom('shop', 'meadow', town(14, 8));

export const lab = room('lab', '오디 연구소', 'meadow', 10, 9, '_', (g) => {
  put(g, 1, 1, 'm'); put(g, 2, 1, 'm'); put(g, 7, 1, 'm'); put(g, 8, 1, 'm'); put(g, 4, 1, 'h'); put(g, 5, 1, 'h');
  fill(g, 3, 4, 4, 1, 'K'); put(g, 1, 5, 'h'); put(g, 8, 5, 'h');
}, [
  { id: 'lab-prof', name: '박사님', x: 4, y: 3, facing: 'down', look: look('#cccccc', '#ffffff', '#555555'), role: 'professor',
    lines: ['오, 왔구나! 나는 오디 박사야.', '오디와 함께라면 어디든 갈 수 있지.', '자, 함께할 첫 오디를 골라 보렴!'],
    linesIf: { flag: 'starter', lines: ['오디와는 잘 지내고 있니?', '네 구역의 체육관 관장을 모두 이기면 챔피언의 전당에 갈 수 있단다.', '풀숲에서 오디를 만나면 이기고 로프를 던져 잡아 보렴. 도감도 채워 주고!'] } },
  { id: 'lab-aide', name: '조수', x: 7, y: 6, facing: 'left', look: look('#3a2a20', '#ffffff', '#3a6a8a'),
    lines: ['박사님은 오디 165종을 모두 보는 게 꿈이래.', '도감은 메뉴에서 볼 수 있어.'] },
], town(21, 20));

export const house1 = room('house1', '민수네 집', 'meadow', 8, 7, '_', (g) => {
  put(g, 1, 1, 'h'); put(g, 6, 1, 'h'); put(g, 3, 3, 'K'); put(g, 4, 3, 'K');
}, [{ id: 'house1-boy', name: '민수', x: 5, y: 4, facing: 'left', look: look('#2a2a2a', '#e8484f'),
  lines: ['우리 집에 놀러 왔구나!', '밖으로 나가면 모험이 시작돼.'] }], town(5, 18));

export const house2 = room('house2', '할머니네 집', 'meadow', 8, 7, '_', (g) => {
  put(g, 1, 1, 'h'); put(g, 6, 1, 'h'); put(g, 3, 3, 'K'); put(g, 4, 3, 'K');
}, [{ id: 'house2-granny', name: '할머니', x: 2, y: 4, facing: 'right', look: look('#e0e0e0', '#8a5ac8', '#555555'),
  lines: ['오디들은 참 똑똑하단다.', '무리하지 말고 쉬엄쉬엄 다니렴.'] }], town(12, 18));

const trainer = (id: string, name: string, x: number, y: number, facing: Dir, l: NpcLook, before: string[], after: string[], sight = 4): Npc =>
  ({ id, name, x, y, facing, look: l, lines: after, trainer: { sight, before, after } });
/** 관장·챔피언은 시야가 없다: 말을 걸어야 싸운다 */
const leader = (id: string, name: string, l: NpcLook, before: string[], after: string[]): Npc =>
  ({ ...trainer(id, name, 5, 2, 'down', l, before, after, 0) });

export const gymMeadow = gymRoom('gym', '초원 체육관', 'meadow', town(23, 8), [
  trainer('gym-meadow-1', '정원사', 3, 10, 'right', look('#5a3a20', '#3a9a4a', '#4a3a2a', '#e0c070'),
    ['관장님께 가려면 나부터 이겨야 해!'], ['꽃처럼 활짝 졌다…']),
  leader('leader-meadow', '초원 관장 새싹', look('#3a8a3a', '#6cc87a', '#2a4a2a'),
    ['어서 와, 도전자! 나는 초원 체육관 관장 새싹이야.', '풀과 꽃의 힘, 한번 맛봐!'],
    ['훌륭해! 초원 배지는 네 거야.', '동쪽 1번 길 끝의 문지기가 이제 길을 비켜 줄 거야. 사막으로 가 봐!']),
]);

const desertOut = (x: number, y: number): Out => ({ map: 'desert-town', x, y });
const snowOut = (x: number, y: number): Out => ({ map: 'snow-town', x, y });
const volcanoOut = (x: number, y: number): Out => ({ map: 'volcano-town', x, y });

export const gymDesert = gymRoom('gym-desert', '사막 체육관', 'desert', desertOut(22, 8), [
  trainer('gym-desert-1', '모래 소년', 8, 11, 'left', look('#2a2a2a', '#e0892f', '#6a4a2a', '#f4d49a'),
    ['모래 폭풍처럼 몰아쳐 주지!'], ['모래가 눈에 들어갔어…']),
  trainer('gym-desert-2', '탐험가', 3, 7, 'right', look('#6a4a2a', '#c8a062', '#4a3a2a', '#8a6a3a'),
    ['피라미드보다 단단한 내 오디를 봐라!'], ['내 보물 지도가… 날아갔다.']),
  leader('leader-desert', '사막 관장 모래', look('#c9822a', '#e0892f', '#5a3a2a', '#f4b86a'),
    ['뜨거운 모래 위에서 버틸 수 있겠어?', '사막 관장 모래, 간다!'],
    ['너의 열정이 사막보다 뜨겁구나. 사막 배지를 가져가!', '오디 마을 남쪽 숲 끝의 문지기가 설원으로 가는 길을 열어 줄 거야.']),
]);

export const gymSnow = gymRoom('gym-snow', '설원 체육관', 'snow', snowOut(21, 7), [
  trainer('gym-snow-1', '스케이터', 3, 11, 'right', look('#e8c040', '#9adcf2', '#2a3a6a', '#ffffff'),
    ['얼음 위에서는 내가 최고야!'], ['미끄러졌다…']),
  trainer('gym-snow-2', '설산 등반가', 8, 7, 'left', look('#4a3a2a', '#d94f3d', '#3a3a5a', '#4ab0d8'),
    ['정상까지 가려면 나를 넘어야지!'], ['눈사태 같은 기세였어.']),
  leader('leader-snow', '설원 관장 서리', look('#dceaf4', '#4ab0d8', '#24708f'),
    ['차가운 바람이 부는구나… 나는 설원 관장 서리.', '얼음처럼 단단한 내 오디들을 이겨 봐.'],
    ['얼음이 녹아 버렸어. 설원 배지를 받아.', '마을 동쪽 문지기가 화산으로 가는 4번 길을 열어 줄 거야.']),
]);

export const gymVolcano = gymRoom('gym-volcano', '화산 체육관', 'volcano', volcanoOut(22, 8), [
  trainer('gym-volcano-1', '불꽃 소녀', 8, 11, 'left', look('#d94f3d', '#e8481c', '#3a2a2a'),
    ['내 불꽃은 꺼지지 않아!'], ['불씨만 남았다…']),
  trainer('gym-volcano-2', '용암 광부', 3, 7, 'right', look('#2a2a2a', '#5a4a48', '#3a2a2a', '#e0b030'),
    ['용암 속에서 캐낸 힘을 보여 주지!'], ['곡괭이가 부러졌다.']),
  leader('leader-volcano', '화산 관장 불꽃', look('#8a2a2a', '#c85a4a', '#2a1a1a'),
    ['여기까지 오다니 대단해. 나는 화산 관장 불꽃!', '모든 걸 태워 버릴 불의 힘, 받아 봐라!'],
    ['네 불꽃이 더 뜨거웠어. 화산 배지다!', '배지 네 개가 모이면 마을 남동쪽 챔피언의 전당에 들어갈 수 있어.']),
]);

export const desertCenter = centerRoom('center-desert', 'desert', desertOut(5, 8));
export const desertShop = shopRoom('shop-desert', 'desert', desertOut(13, 8));
export const snowCenter = centerRoom('center-snow', 'snow', snowOut(5, 7));
export const snowShop = shopRoom('shop-snow', 'snow', snowOut(11, 7));
export const volcanoCenter = centerRoom('center-volcano', 'volcano', volcanoOut(5, 8));
export const volcanoShop = shopRoom('shop-volcano', 'volcano', volcanoOut(13, 8));

/** 챔피언의 전당: 대리석 바닥, 가운데 카펫, 안쪽 끝에 챔피언 */
export const hall = room('hall', '챔피언의 전당', 'volcano', 12, 16, 'g', (g) => {
  fill(g, 5, 3, 2, 12, 'c');
  for (let y = 4; y <= 12; y += 2) { put(g, 2, y, 'X'); put(g, 9, y, 'X'); }
  put(g, 1, 1, 'm'); put(g, 10, 1, 'm');
}, [
  { ...leader('champion', '챔피언 하늘', look('#2a2a4a', '#e0b030', '#2a2a4a', '#8a5ac8'),
    ['드디어 왔구나. 네 개의 배지를 모은 트레이너!', '나는 챔피언 하늘. 지금까지의 모험을 전부 보여 줘!'],
    ['…졌어. 오늘부터 네가 새 챔피언이야!', '오디들과 함께 앞으로도 멋진 모험을 하길!']) },
], volcanoOut(21, 20));

export const INTERIORS: MapData[] = [
  center, shop, lab, house1, house2, gymMeadow,
  desertCenter, desertShop, gymDesert, snowCenter, snowShop, gymSnow, volcanoCenter, volcanoShop, gymVolcano, hall,
];
