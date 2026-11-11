import type { MapData, NpcLook } from './types.ts';
import { GYM_ENTRY } from './house.ts';
import { border, building, fill, grid, put, rng, rows, scatter } from './util.ts';

const look = (hair: string, shirt: string, pants: string, hat?: string): NpcLook => ({ hair, skin: '#f6d2b0', shirt, pants, hat });
const enter = (map: string, x: number, y: number) => ({ map, x, y, facing: 'up' as const });

// ---------- 사막 마을 (북동) ----------
function desertTown(): MapData {
  const g = grid(30, 22, '.');
  border(g, 'o', 2);
  const rand = rng(31);
  scatter(g, rand, 'T', 12, 'o');
  fill(g, 0, 9, 29, 2, ':'); // 큰길(서쪽 2번 길에서)
  const center = building(g, { x: 2, y: 3, w: 7, roof: 3, wall: 2, color: 'R', door: 3, windows: [1, 5] });
  const shop = building(g, { x: 11, y: 3, w: 5, roof: 3, wall: 2, color: 'B', door: 2, windows: [1, 3] });
  const gym = building(g, { x: 18, y: 2, w: 9, roof: 3, wall: 3, color: 'O', door: 4, windows: [1, 3, 5, 7] });
  for (const d of [center, shop, gym]) put(g, d.x, d.y + 1, ':');
  // 오아시스
  fill(g, 6, 13, 9, 4, '~'); fill(g, 7, 12, 7, 1, '~'); fill(g, 7, 17, 7, 1, '~');
  for (const [x, y] of [[5, 12], [15, 12], [5, 17], [15, 17], [4, 14], [16, 15]]) put(g, x, y, 'T');
  fill(g, 18, 13, 9, 5, 's');
  fill(g, 22, 11, 1, 3, ':');
  scatter(g, rand, 'C', 10);
  scatter(g, rand, 'f', 4);
  for (const [x, y] of [[9, 8], [17, 8], [3, 11], [24, 14], [12, 18]]) put(g, x, y, '.');
  put(g, 17, 8, 'Y'); put(g, 9, 8, 'Y'); put(g, 3, 11, 'Y');
  return {
    id: 'desert-town', name: '사막 마을', region: 'desert', rows: rows(g),
    warps: [
      { x: 0, y: 9, to: { map: 'route2', x: 42, y: 10, facing: 'left' } },
      { x: 0, y: 10, to: { map: 'route2', x: 42, y: 11, facing: 'left' } },
      { ...center, to: enter('center-desert', 4, 6) },
      { ...shop, to: enter('shop-desert', 3, 6) },
      { ...gym, to: enter('gym-desert', GYM_ENTRY.x, GYM_ENTRY.y) },
    ],
    npcs: [
      { id: 'desert-girl', name: '오아시스 소녀', x: 12, y: 18, facing: 'up', look: look('#2a2a2a', '#4ab0d8', '#e0b030'),
        lines: ['이 오아시스 물은 정말 시원해!', '사막 오디들은 땅과 바위 타입이 많대.'] },
      { id: 'desert-elder', name: '사막 할아버지', x: 24, y: 14, facing: 'left', look: look('#dddddd', '#c27a44', '#5a4a2a', '#f4d49a'),
        lines: ['모래 관장은 땅 타입 오디를 쓴단다.', '물이나 풀 타입 오디가 있으면 든든하지.'] },
    ],
    signs: [
      { x: 17, y: 8, text: '사막 체육관 — 관장 모래. 뜨거운 승부를 기다립니다!' },
      { x: 9, y: 8, text: '오디 센터 · 오디 상점' },
      { x: 3, y: 11, text: '사막 마을 — 모래 바람이 부는 오아시스 마을' },
    ],
  };
}

// ---------- 설원 마을 (남서) ----------
function snowTown(): MapData {
  const g = grid(30, 22, '.');
  border(g, 'T', 1);
  fill(g, 0, 20, 30, 2, 'T');
  const rand = rng(41);
  fill(g, 14, 0, 2, 9, ':'); // 북쪽 3번 길에서 내려오는 길
  fill(g, 1, 8, 27, 2, ':'); // 큰길
  const center = building(g, { x: 2, y: 2, w: 7, roof: 3, wall: 2, color: 'R', door: 3, windows: [1, 5] });
  const shop = building(g, { x: 9, y: 2, w: 5, roof: 3, wall: 2, color: 'B', door: 2, windows: [1, 3] });
  const gym = building(g, { x: 17, y: 1, w: 9, roof: 3, wall: 3, color: 'Z', door: 4, windows: [1, 3, 5, 7] });
  for (const d of [center, shop, gym]) fill(g, d.x, d.y + 1, 1, 8 - d.y - 1, ':');
  // 동쪽 4번 길로 가는 한 칸 길(문지기)
  fill(g, 27, 8, 3, 1, ':'); fill(g, 26, 9, 4, 1, 'T'); put(g, 28, 9, '.');
  fill(g, 26, 2, 3, 6, 'T');
  // 꽁꽁 언 호수와 눈 더미
  fill(g, 4, 12, 10, 5, 'i'); fill(g, 5, 11, 8, 1, 'i'); fill(g, 5, 17, 8, 1, 'i');
  fill(g, 17, 12, 9, 2, 'n'); fill(g, 19, 16, 6, 2, 'n');
  fill(g, 20, 10, 1, 4, ':');
  scatter(g, rand, 'T', 12);
  scatter(g, rand, 'o', 5);
  for (const [x, y] of [[16, 7], [3, 10], [9, 18], [22, 14]]) put(g, x, y, '.');
  put(g, 16, 7, 'Y'); put(g, 3, 10, 'Y');
  return {
    id: 'snow-town', name: '설원 마을', region: 'snow', rows: rows(g),
    warps: [
      { x: 14, y: 0, to: { map: 'route3', x: 9, y: 38, facing: 'up' } },
      { x: 15, y: 0, to: { map: 'route3', x: 10, y: 38, facing: 'up' } },
      { x: 29, y: 8, to: { map: 'route4', x: 1, y: 7, facing: 'right' } },
      { ...center, to: enter('center-snow', 4, 6) },
      { ...shop, to: enter('shop-snow', 3, 6) },
      { ...gym, to: enter('gym-snow', GYM_ENTRY.x, GYM_ENTRY.y) },
    ],
    npcs: [
      { id: 'snow-kid', name: '눈사람 꼬마', x: 9, y: 18, facing: 'up', look: look('#3a2a20', '#e8484f', '#3a3a5a', '#ffffff'),
        lines: ['호수가 꽁꽁 얼어서 그 위를 걸을 수 있어!', '서리 관장님은 얼음 타입 오디를 써. 불 타입이 강하대.'] },
      { id: 'snow-lady', name: '털모자 아주머니', x: 22, y: 14, facing: 'left', look: look('#8a4a20', '#8a5ac8', '#3a3a5a', '#e8484f'),
        lines: ['감기 걸리지 않게 조심하렴.', '동쪽 4번 길 너머는 펄펄 끓는 화산이란다.'] },
      { id: 'gate-volcano', name: '문지기', x: 28, y: 8, facing: 'left',
        look: { hair: '#2a2a2a', skin: '#e8b890', shirt: '#3a5a8a', pants: '#2a2a3a', hat: '#2a3a5a' },
        lines: ['이 앞은 화산으로 가는 4번 길이야.', '설원 배지가 있어야 지나갈 수 있어. 설원 체육관에 도전해 봐!'],
        gate: { badges: ['snow'], aside: { x: 28, y: 9 }, open: ['설원 배지구나! 화산은 뜨거우니 조심해!'] } },
    ],
    signs: [
      { x: 16, y: 7, text: '설원 체육관 — 관장 서리. 얼음처럼 차가운 승부!' },
      { x: 3, y: 10, text: '설원 마을 — 눈과 얼음의 마을. 동쪽은 4번 길(설원 배지가 필요해요)' },
    ],
  };
}

// ---------- 화산 마을 (남동) + 챔피언의 전당 ----------
function volcanoTown(): MapData {
  const g = grid(30, 24, '.');
  border(g, 'o', 1);
  fill(g, 0, 22, 30, 2, 'o');
  const rand = rng(53);
  scatter(g, rand, 'T', 10, 'o');
  fill(g, 0, 9, 28, 2, ':'); // 큰길(서쪽 4번 길에서)
  const center = building(g, { x: 2, y: 3, w: 7, roof: 3, wall: 2, color: 'R', door: 3, windows: [1, 5] });
  const shop = building(g, { x: 11, y: 3, w: 5, roof: 3, wall: 2, color: 'B', door: 2, windows: [1, 3] });
  const gym = building(g, { x: 18, y: 2, w: 9, roof: 3, wall: 3, color: 'Q', door: 4, windows: [1, 3, 5, 7] });
  for (const d of [center, shop, gym]) put(g, d.x, d.y + 1, ':');
  // 전당: 큰길 동쪽 끝에서 한 칸 길로 내려간다(문지기)
  const hall = building(g, { x: 17, y: 13, w: 9, roof: 4, wall: 3, color: 'U', door: 4, windows: [1, 3, 5, 7] });
  fill(g, 27, 11, 1, 10, ':');
  fill(g, 21, 20, 7, 1, ':');
  put(g, 28, 11, '.');
  fill(g, 28, 12, 1, 10, 'o');
  // 용암 웅덩이와 화산암 바닥
  fill(g, 3, 14, 6, 3, 'l'); fill(g, 4, 13, 4, 1, 'l'); fill(g, 4, 17, 4, 1, 'l');
  fill(g, 2, 12, 8, 1, 'v'); fill(g, 2, 18, 8, 2, 'v');
  fill(g, 11, 15, 4, 2, 'l');
  fill(g, 16, 12, 1, 10, 'l');
  // 전당 둘레는 막혀 있다: 문지기 길로만 들어간다
  fill(g, 26, 12, 1, 8, 'o'); fill(g, 17, 21, 11, 1, 'o');
  scatter(g, rand, 'o', 6);
  for (const [x, y] of [[9, 8], [17, 8], [12, 19], [20, 11], [3, 11]]) put(g, x, y, '.');
  put(g, 17, 8, 'Y'); put(g, 3, 11, 'Y'); put(g, 26, 11, 'Y');
  return {
    id: 'volcano-town', name: '화산 마을', region: 'volcano', rows: rows(g),
    warps: [
      { x: 0, y: 9, to: { map: 'route4', x: 42, y: 6, facing: 'left' } },
      { x: 0, y: 10, to: { map: 'route4', x: 42, y: 7, facing: 'left' } },
      { ...center, to: enter('center-volcano', 4, 6) },
      { ...shop, to: enter('shop-volcano', 3, 6) },
      { ...gym, to: enter('gym-volcano', GYM_ENTRY.x, GYM_ENTRY.y) },
      { ...hall, to: enter('hall', GYM_ENTRY.x, GYM_ENTRY.y) },
    ],
    npcs: [
      { id: 'volcano-smith', name: '대장장이', x: 12, y: 19, facing: 'up', look: look('#2a2a2a', '#5a4a48', '#3a2a2a', '#d94f3d'),
        lines: ['용암 웅덩이는 절대 밟으면 안 돼!', '불꽃 관장은 불 타입. 물 타입이 잘 통하지.'] },
      { id: 'volcano-fan', name: '챔피언 팬', x: 20, y: 11, facing: 'up', look: look('#e8c040', '#8a5ac8', '#3a3a5a'),
        lines: ['저 금색 지붕이 챔피언의 전당이야!', '배지 네 개를 모은 트레이너만 들어갈 수 있대.'] },
      { id: 'gate-hall', name: '전당 문지기', x: 27, y: 11, facing: 'up',
        look: { hair: '#2a2a2a', skin: '#e8b890', shirt: '#e0b030', pants: '#2a2a3a', hat: '#8a5ac8' },
        lines: ['이 앞은 챔피언의 전당이다.', '초원·사막·설원·화산 배지 네 개가 모두 있어야 지나갈 수 있어.'],
        gate: { badges: ['meadow', 'desert', 'snow', 'volcano'], aside: { x: 28, y: 11 }, open: ['배지 네 개! 챔피언이 기다리고 있다. 행운을 빈다!'] } },
    ],
    signs: [
      { x: 17, y: 8, text: '화산 체육관 — 관장 불꽃. 불타는 승부!' },
      { x: 3, y: 11, text: '화산 마을 — 용암이 흐르는 마을. 용암 조심!' },
      { x: 26, y: 11, text: '↓ 챔피언의 전당 (배지 4개가 필요해요)' },
    ],
  };
}

export const desert = desertTown();
export const snow = snowTown();
export const volcano = volcanoTown();
