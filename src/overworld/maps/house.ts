import type { Dir, MapData, Npc } from './types.ts';
import { fill, grid, put, rows } from './util.ts';

const look = (hair: string, shirt: string, pants = '#3a4a8a', hat?: string) => ({ hair, skin: '#f6d2b0', shirt, pants, hat });

/** 작은 실내: 위 두 줄은 뒷벽, 아래 줄 가운데 카펫 두 칸이 출구 */
function room(id: string, name: string, w: number, h: number, floor: string, decorate: (g: string[][]) => void, npcs: Npc[], out: { map: string; x: number; y: number }): MapData {
  const g = grid(w, h, floor);
  fill(g, 0, 0, w, 1, 'I'); fill(g, 0, 1, w, 1, 'J');
  fill(g, 0, 0, 1, h, 'I'); fill(g, w - 1, 0, 1, h, 'I');
  fill(g, 0, h - 1, w, 1, 'I');
  const cx = Math.floor(w / 2) - 1;
  fill(g, cx, h - 1, 2, 1, 'c');
  decorate(g);
  const to = { ...out, facing: 'down' as Dir };
  return {
    id, name, region: 'meadow', rows: rows(g), npcs, signs: [],
    warps: [{ x: cx, y: h - 1, to }, { x: cx + 1, y: h - 1, to }],
  };
}

const town = (x: number, y: number) => ({ map: 'town', x, y });

export const center = room('center', '오디 센터', 10, 8, '_', (g) => {
  fill(g, 4, 1, 2, 1, 'h'); fill(g, 3, 3, 4, 1, 'K'); put(g, 1, 1, 'h'); put(g, 8, 1, 'h'); put(g, 1, 5, 'h'); put(g, 8, 5, 'h');
}, [{ id: 'center-nurse', name: '간호사', x: 4, y: 2, facing: 'down', look: look('#f283c1', '#ffffff', '#f283c1'),
  lines: ['어서 오세요! 오디 센터예요.', '(곧 오디를 치료해 드릴 수 있게 될 거예요.)'] }], town(6, 8));

export const shop = room('shop', '오디 상점', 8, 8, '_', (g) => {
  put(g, 1, 1, 'h'); put(g, 2, 1, 'h'); put(g, 5, 1, 'h'); put(g, 6, 1, 'h'); fill(g, 2, 3, 4, 1, 'K'); put(g, 1, 5, 'h'); put(g, 6, 5, 'h');
}, [{ id: 'shop-clerk', name: '점원', x: 3, y: 2, facing: 'down', look: look('#3a2a20', '#3f78d8', '#2a3a6a', '#3f78d8'),
  lines: ['어서 오세요! 로프와 회복약이 있어요.', '(가게는 곧 문을 열어요.)'] }], town(14, 8));

export const lab = room('lab', '오디 연구소', 10, 9, '_', (g) => {
  put(g, 1, 1, 'm'); put(g, 2, 1, 'm'); put(g, 7, 1, 'm'); put(g, 8, 1, 'm'); put(g, 4, 1, 'h'); put(g, 5, 1, 'h');
  fill(g, 3, 4, 4, 1, 'K'); put(g, 1, 5, 'h'); put(g, 8, 5, 'h');
}, [{ id: 'lab-prof', name: '박사님', x: 4, y: 3, facing: 'down', look: look('#cccccc', '#ffffff', '#555555'),
  lines: ['나는 오디 박사야.', '곧 너에게 첫 오디를 줄게!'] }], town(21, 20));

export const house1 = room('house1', '민수네 집', 8, 7, '_', (g) => {
  put(g, 1, 1, 'h'); put(g, 6, 1, 'h'); put(g, 3, 3, 'K'); put(g, 4, 3, 'K');
}, [{ id: 'house1-boy', name: '민수', x: 5, y: 4, facing: 'left', look: look('#2a2a2a', '#e8484f'),
  lines: ['우리 집에 놀러 왔구나!', '밖으로 나가면 모험이 시작돼.'] }], town(5, 18));

export const house2 = room('house2', '할머니네 집', 8, 7, '_', (g) => {
  put(g, 1, 1, 'h'); put(g, 6, 1, 'h'); put(g, 3, 3, 'K'); put(g, 4, 3, 'K');
}, [{ id: 'house2-granny', name: '할머니', x: 2, y: 4, facing: 'right', look: look('#e0e0e0', '#8a5ac8', '#555555'),
  lines: ['오디들은 참 똑똑하단다.', '무리하지 말고 쉬엄쉬엄 다니렴.'] }], town(12, 18));

export const gymRoom = room('gym', '초원 체육관', 12, 12, 'x', (g) => {
  put(g, 1, 1, 'm'); put(g, 10, 1, 'm');
}, [{ id: 'gym-guide', name: '안내원', x: 5, y: 6, facing: 'down', look: look('#2a2a2a', '#3a9a4a', '#2a4a2a'),
  lines: ['여기는 초원 체육관이야.', '관장님은 아직 준비 중이야. 나중에 다시 와!'] }], town(23, 8));

export const INTERIORS: MapData[] = [center, shop, lab, house1, house2, gymRoom];
