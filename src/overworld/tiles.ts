import type { RegionId } from './regions.ts';

export const TILE = 32;

/** 타일 = 종류(하위 8비트) + 부가 정보. 건물 가장자리/지붕 색·줄은 지도를 읽을 때 정해진다 */
export type Tile = number;

export type Kind =
  | 'grass' | 'tall' | 'path' | 'water' | 'tree' | 'flower' | 'fence' | 'rock' | 'sand' | 'snow' | 'ice'
  | 'lava' | 'volcano' | 'cactus' | 'wall' | 'window' | 'door' | 'roof' | 'sign' | 'floor' | 'carpet'
  | 'counter' | 'shelf' | 'machine' | 'gym' | 'iwall' | 'iwall2' | 'pillar' | 'marble';

const KINDS: Kind[] = [
  'grass', 'tall', 'path', 'water', 'tree', 'flower', 'fence', 'rock', 'sand', 'snow', 'ice',
  'lava', 'volcano', 'cactus', 'wall', 'window', 'door', 'roof', 'sign', 'floor', 'carpet',
  'counter', 'shelf', 'machine', 'gym', 'iwall', 'iwall2', 'pillar', 'marble',
];
const KIND_ID = Object.fromEntries(KINDS.map((k, i) => [k, i])) as Record<Kind, number>;

/** 지도 문자 ↔ 종류 (지붕은 아래 ROOF_CHARS) */
export const CHAR_KIND: Record<string, Kind> = {
  '.': 'grass', '"': 'tall', ':': 'path', '~': 'water', T: 'tree', f: 'flower', '=': 'fence', o: 'rock',
  s: 'sand', n: 'snow', i: 'ice', l: 'lava', v: 'volcano', C: 'cactus', W: 'wall', w: 'window', D: 'door',
  Y: 'sign', _: 'floor', c: 'carpet', K: 'counter', h: 'shelf', m: 'machine', x: 'gym', I: 'iwall', J: 'iwall2',
  X: 'pillar', g: 'marble',
};
export const ROOF_CHARS = 'RBGNOPUZQ'; // 빨강 파랑 회색 초록 주황 보라 금색 얼음 진홍

// 부가 정보 비트: 1=왼쪽 끝, 2=오른쪽 끝, 4=아래 끝, 8=지붕 아래(그림자), 16=지붕 첫 줄, 32=지붕 마지막 줄, 색은 <<8
const L = 1, R = 2, B = 4, UNDER = 8, TOP = 16, EAVE = 32;

export const kindOf = (t: Tile): Kind => KINDS[t & 0xff];
const extra = (t: Tile) => (t >> 8) & 0xff;
const mk = (kind: Kind, info = 0): Tile => KIND_ID[kind] | (info << 8);

const isBuilding = (t: Tile | undefined) => {
  if (t === undefined) return false;
  const k = kindOf(t);
  return k === 'wall' || k === 'window' || k === 'door' || k === 'roof';
};

/** 문자 격자를 타일로 바꾼다. 건물 가장자리와 지붕 줄을 이웃을 보고 정한다 */
export function parseRows(rows: string[]): Tile[][] {
  const chars = rows.map((row) => [...row]);
  const kindAt = (x: number, y: number): Kind | null => {
    const c = chars[y]?.[x];
    if (c === undefined) return null;
    return ROOF_CHARS.includes(c) ? 'roof' : CHAR_KIND[c] ?? 'grass';
  };
  const bld = (x: number, y: number) => {
    const k = kindAt(x, y);
    return k === 'wall' || k === 'window' || k === 'door' || k === 'roof';
  };
  return chars.map((row, y) => row.map((c, x) => {
    const roofColor = ROOF_CHARS.indexOf(c);
    let info = 0;
    if (roofColor >= 0 || bld(x, y)) {
      if (!bld(x - 1, y)) info |= L;
      if (!bld(x + 1, y)) info |= R;
      if (!bld(x, y + 1)) info |= B;
    }
    if (roofColor >= 0) {
      if (kindAt(x, y - 1) !== 'roof') info |= TOP;
      else if (kindAt(x, y + 1) !== 'roof') info |= EAVE;
      return mk('roof', info) | (roofColor << 16);
    }
    if (kindAt(x, y - 1) === 'roof' && bld(x, y)) info |= UNDER;
    return mk(CHAR_KIND[c] ?? 'grass', info);
  }));
}

const WALKABLE = new Set<Kind>(['grass', 'tall', 'path', 'flower', 'sand', 'snow', 'ice', 'volcano', 'door', 'floor', 'carpet', 'gym', 'marble']);
export const isWalkable = (t: Tile) => WALKABLE.has(kindOf(t));
export const isGrass = (t: Tile) => kindOf(t) === 'tall';
export const isDoor = (t: Tile) => kindOf(t) === 'door';
export const isCounter = (t: Tile) => kindOf(t) === 'counter';

// ---------- 그리기 ----------
type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};
/** 또렷한 원: 줄마다 사각형으로 채운다 */
const disc = (c: Ctx, color: string, cx: number, cy: number, r: number) => {
  c.fillStyle = color;
  for (let dy = -r; dy <= r; dy += 1) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.6));
    c.fillRect(cx - hw, cy + dy, hw * 2, 1);
  }
};
const rnd = (seed: number, i: number) => {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const GROUND: Record<RegionId, { base: string; dark: string; light: string; tall: string; tallDark: string; tallTip: string }> = {
  meadow: { base: '#68b946', dark: '#58a53a', light: '#80cf5c', tall: '#3f9a3a', tallDark: '#2c7a2e', tallTip: '#8fe07a' },
  desert: { base: '#e3c98c', dark: '#cdb06e', light: '#f2dfaa', tall: '#c2a04a', tallDark: '#8f7128', tallTip: '#f2dc80' },
  snow: { base: '#e8f0f6', dark: '#cbdbe8', light: '#ffffff', tall: '#5f9a84', tallDark: '#3b6e5e', tallTip: '#ffffff' },
  volcano: { base: '#5e4f4d', dark: '#4a3d3b', light: '#76625f', tall: '#6a3a30', tallDark: '#3e1f1a', tallTip: '#ff8a3a' },
};

/** 구역마다 다른 바닥: 초원 풀, 사막 모래 물결, 설원 눈, 화산 재 */
function ground(c: Ctx, x: number, y: number, seed: number, g = GROUND.meadow) {
  rect(c, g.base, x, y, TILE, TILE);
  if (g === GROUND.desert) {
    for (let i = 0; i < 3; i += 1) {
      const px = x + Math.floor(rnd(seed, i) * 20);
      const py = y + 4 + i * 10 + Math.floor(rnd(seed, i + 4) * 4);
      rect(c, g.dark, px, py + 1, 8, 1); rect(c, g.dark, px + 8, py, 4, 1);
      rect(c, g.light, px + 1, py, 6, 1);
    }
    for (let i = 0; i < 3; i += 1) rect(c, '#b89a62', x + Math.floor(rnd(seed, i + 9) * 29), y + Math.floor(rnd(seed, i + 12) * 29), 2, 2);
    return;
  }
  if (g === GROUND.snow) {
    for (let i = 0; i < 3; i += 1) {
      const px = x + Math.floor(rnd(seed, i) * 22);
      const py = y + Math.floor(rnd(seed, i + 5) * 26);
      rect(c, g.dark, px, py + 2, 9, 2); rect(c, g.dark, px + 2, py + 4, 5, 1);
      rect(c, g.light, px + 1, py, 7, 2);
    }
    for (let i = 0; i < 2; i += 1) rect(c, '#bcd4ea', x + Math.floor(rnd(seed, i + 9) * 30), y + Math.floor(rnd(seed, i + 11) * 30), 1, 1);
    return;
  }
  if (g === GROUND.volcano) {
    for (let i = 0; i < 6; i += 1) rect(c, g.dark, x + Math.floor(rnd(seed, i) * 28), y + Math.floor(rnd(seed, i + 9) * 30), 3, 2);
    for (let i = 0; i < 3; i += 1) rect(c, g.light, x + Math.floor(rnd(seed, i + 20) * 29), y + Math.floor(rnd(seed, i + 30) * 29), 2, 1);
    if (seed % 2 === 0) rect(c, '#c8502a', x + 6 + Math.floor(rnd(seed, 40) * 20), y + 8 + Math.floor(rnd(seed, 41) * 18), 1, 1);
    return;
  }
  for (let i = 0; i < 5; i += 1) {
    rect(c, g.dark, x + Math.floor(rnd(seed, i) * 28), y + Math.floor(rnd(seed, i + 9) * 30), 3, 1);
  }
  for (let i = 0; i < 3; i += 1) {
    const px = x + 2 + Math.floor(rnd(seed, i + 20) * 26);
    const py = y + 2 + Math.floor(rnd(seed, i + 30) * 26);
    rect(c, g.light, px, py, 1, 3);
    rect(c, g.light, px + 2, py + 1, 1, 2);
  }
}

/** 구역별 나무: 초원 둥근 나무, 사막 야자, 설원 눈 덮인 전나무, 화산 그을린 고목 */
function drawTree(c: Ctx, x: number, y: number, seed: number, region: RegionId) {
  ground(c, x, y, seed, GROUND[region]);
  if (region === 'desert') {
    disc(c, 'rgba(90,60,20,0.3)', x + 16, y + 29, 9);
    for (let i = 0; i < 6; i += 1) {
      const bx = x + 14 + Math.round(Math.sin(i * 0.5) * 2);
      rect(c, '#6e4a22', bx, y + 12 + i * 3, 5, 3);
      rect(c, '#9a6a34', bx + 1, y + 12 + i * 3, 2, 2);
    }
    const leaf = (dy: number, w: number, dir: number) => {
      for (let k = 0; k < w; k += 1) {
        const ly = y + dy + Math.floor((k * k) / (w * 1.4));
        const lx = x + 16 + dir * k - (dir < 0 ? 2 : 0);
        rect(c, '#1f6a2a', lx, ly, 2, 3);
        rect(c, '#3e9a3e', lx, ly, 2, 1);
      }
    };
    leaf(9, 14, 1); leaf(9, 14, -1); leaf(6, 10, 1); leaf(6, 10, -1);
    rect(c, '#2e8a36', x + 12, y + 3, 8, 5); rect(c, '#5cc05a', x + 13, y + 3, 4, 2);
    rect(c, '#7a4a1a', x + 13, y + 9, 3, 3); rect(c, '#7a4a1a', x + 17, y + 10, 3, 3);
    return;
  }
  if (region === 'snow') {
    disc(c, 'rgba(60,90,120,0.25)', x + 16, y + 29, 10);
    rect(c, '#5a3a20', x + 14, y + 25, 4, 6);
    const tier = (top: number, half: number, h: number) => {
      for (let r = 0; r < h; r += 1) {
        const hw = Math.max(1, Math.round(((r + 1) / h) * half));
        rect(c, '#1e4a3a', x + 16 - hw, y + top + r, hw * 2, 1);
        rect(c, '#2e6a50', x + 16 - hw + 1, y + top + r, Math.max(1, hw - 1), 1);
      }
      rect(c, '#ffffff', x + 16 - half + 1, y + top + h - 2, half * 2 - 2, 2);
      rect(c, '#dceaf4', x + 16 - half + 2, y + top + h, half * 2 - 4, 1);
    };
    tier(1, 6, 8); tier(8, 10, 9); tier(16, 14, 10);
    rect(c, '#ffffff', x + 15, y + 1, 2, 2);
    return;
  }
  if (region === 'volcano') {
    disc(c, 'rgba(0,0,0,0.3)', x + 16, y + 29, 9);
    rect(c, '#1e1614', x + 13, y + 10, 6, 21);
    rect(c, '#3a2c28', x + 14, y + 10, 3, 21);
    const branch = (bx: number, by: number, dx: number, n: number) => {
      for (let k = 0; k < n; k += 1) rect(c, '#1e1614', x + bx + dx * k, y + by - k, 3, 2);
    };
    branch(16, 14, 2, 6); branch(13, 16, -2, 5); branch(18, 9, 1, 6); branch(12, 9, -1, 5);
    rect(c, '#ff7a2a', x + 15, y + 22, 1, 2); rect(c, '#ffb25a', x + 15, y + 22, 1, 1);
    return;
  }
  disc(c, 'rgba(20,60,20,0.35)', x + 16, y + 28, 11);
  rect(c, '#5e3818', x + 12, y + 18, 8, 12);
  rect(c, '#7a4a21', x + 13, y + 18, 5, 12);
  rect(c, '#9a6330', x + 13, y + 18, 2, 11);
  disc(c, '#1f5c26', x + 16, y + 13, 15);
  disc(c, '#2f7d32', x + 16, y + 12, 13);
  disc(c, '#3f9a3a', x + 14, y + 10, 10);
  disc(c, '#62c04b', x + 11, y + 7, 5);
  rect(c, '#8fe07a', x + 9, y + 5, 3, 2);
  rect(c, '#2a6a2c', x + 19, y + 15, 6, 2);
}

/** 구역별 바위: 회색 돌, 사막 사암, 눈 덮인 돌, 빨갛게 갈라진 화산암 */
function drawRock(c: Ctx, x: number, y: number, seed: number, region: RegionId) {
  ground(c, x, y, seed, GROUND[region]);
  disc(c, 'rgba(0,0,0,0.25)', x + 16, y + 27, 11);
  if (region === 'desert') {
    rect(c, '#7a4a28', x + 4, y + 8, 24, 21);
    rect(c, '#c27a44', x + 5, y + 9, 22, 19);
    rect(c, '#d99a5c', x + 5, y + 9, 22, 5);
    rect(c, '#a8623a', x + 5, y + 17, 22, 2);
    rect(c, '#a8623a', x + 5, y + 23, 22, 2);
    rect(c, '#f0be82', x + 7, y + 10, 8, 2);
    rect(c, '#7a4a28', x + 18, y + 13, 1, 4);
    return;
  }
  if (region === 'volcano') {
    disc(c, '#14100f', x + 16, y + 18, 12);
    disc(c, '#2a2220', x + 16, y + 17, 11);
    disc(c, '#3e3432', x + 13, y + 14, 6);
    rect(c, '#e8481c', x + 10, y + 20, 6, 1); rect(c, '#e8481c', x + 15, y + 21, 1, 4);
    rect(c, '#ffb02e', x + 11, y + 20, 2, 1);
    rect(c, '#e8481c', x + 19, y + 12, 1, 5); rect(c, '#e8481c', x + 20, y + 16, 4, 1);
    rect(c, '#5a4a48', x + 10, y + 10, 4, 2);
    return;
  }
  disc(c, '#4a4f58', x + 16, y + 18, 12);
  disc(c, '#8a8f98', x + 16, y + 17, 11);
  disc(c, '#b5bac2', x + 13, y + 14, 6);
  rect(c, '#d8dce2', x + 10, y + 11, 4, 2);
  rect(c, '#6a6f78', x + 20, y + 20, 5, 2);
  if (region === 'snow') {
    disc(c, '#ffffff', x + 15, y + 10, 7);
    rect(c, '#dceaf4', x + 8, y + 13, 16, 2);
    rect(c, '#ffffff', x + 9, y + 11, 14, 2);
  }
}

const PATH: Record<RegionId, [string, string, string]> = {
  meadow: ['#d6b373', '#c19a5a', '#e8cd96'],
  desert: ['#c8a062', '#a8824a', '#dcb87c'],
  snow: ['#c5d3e0', '#a9bccd', '#dfe8f0'],
  volcano: ['#8a7670', '#6a5650', '#a8948c'],
};

const GYM: Record<RegionId, [string, string, string]> = {
  meadow: ['#7cc06a', '#92d27e', '#5a9a4a'],
  desert: ['#d9b47a', '#e8c890', '#b08850'],
  snow: ['#a8d8f0', '#c8ecfa', '#7fb8d8'],
  volcano: ['#3a2e2e', '#4a3a3a', '#1e1616'],
};

/** 체육관 바닥: 구역색 바둑판 + 구역 무늬 */
function gymFloor(c: Ctx, x: number, y: number, seed: number, region: RegionId) {
  const [a, b, line] = GYM[region];
  const dark = seed % 2 === 0;
  rect(c, dark ? a : b, x, y, TILE, TILE);
  rect(c, line, x, y, TILE, 1);
  rect(c, line, x, y, 1, TILE);
  if (!dark) return;
  if (region === 'meadow') { rect(c, b, x + 12, y + 14, 8, 3); rect(c, b, x + 15, y + 10, 2, 12); }
  else if (region === 'desert') { rect(c, b, x + 10, y + 10, 12, 12); rect(c, a, x + 13, y + 13, 6, 6); }
  else if (region === 'snow') { rect(c, '#ffffff', x + 15, y + 8, 2, 16); rect(c, '#ffffff', x + 8, y + 15, 16, 2); }
  else { rect(c, '#e8481c', x + 6, y + 20, 8, 1); rect(c, '#e8481c', x + 13, y + 21, 1, 5); rect(c, '#e8481c', x + 20, y + 8, 6, 1); }
}

const ROOFS = [
  ['#d94f3d', '#f08a74', '#9c2f24'], ['#3f78d8', '#7eaaf2', '#264f9c'], ['#8b929c', '#bcc2cb', '#575d66'],
  ['#3a9a4a', '#6cc87a', '#246a30'], ['#e0892f', '#f4b86a', '#a85a16'], ['#8a5ac8', '#b890ea', '#5a3794'],
  ['#e0b030', '#f8dc70', '#a07818'], ['#4ab0d8', '#9adcf2', '#24708f'], ['#8a2a2a', '#c85a4a', '#4e1212'],
];
const OUTLINE = '#2b2024';
const WALL = '#f3e6c4';

function wallBase(c: Ctx, x: number, y: number, info: number) {
  rect(c, WALL, x, y, TILE, TILE);
  for (let r = 0; r < 4; r += 1) {
    rect(c, '#e0d0a6', x, y + r * 8 + 7, TILE, 1);
    const off = r % 2 ? 4 : 12;
    for (let k = 0; k < 2; k += 1) rect(c, '#e0d0a6', x + off + k * 16, y + r * 8, 1, 7);
  }
  if (info & L) rect(c, OUTLINE, x, y, 1, TILE);
  if (info & R) rect(c, OUTLINE, x + TILE - 1, y, 1, TILE);
  if (info & B) { rect(c, OUTLINE, x, y + TILE - 1, TILE, 1); rect(c, '#b9a77c', x, y + TILE - 5, TILE, 4); }
  if (info & UNDER) { rect(c, 'rgba(60,40,30,0.28)', x, y, TILE, 6); rect(c, 'rgba(60,40,30,0.15)', x, y + 6, TILE, 3); }
}

function drawRoof(c: Ctx, t: Tile, x: number, y: number) {
  const info = extra(t) & 0xff;
  const [mid, light, dark] = ROOFS[(t >> 16) & 15];
  rect(c, mid, x, y, TILE, TILE);
  // 기와: 8px 줄마다 어두운 선과 엇갈린 세로 틈
  for (let r = 0; r < 4; r += 1) {
    const by = y + r * 8;
    rect(c, light, x, by, TILE, 1);
    rect(c, dark, x, by + 7, TILE, 1);
    const off = r % 2 ? 0 : 4;
    for (let k = 0; k < 4; k += 1) rect(c, dark, x + off + k * 8, by + 1, 1, 6);
  }
  if (info & TOP) {
    rect(c, light, x, y, TILE, 7);
    rect(c, dark, x, y + 7, TILE, 2);
    rect(c, '#ffffff55', x, y + 2, TILE, 1);
    rect(c, OUTLINE, x, y, TILE, 1);
  }
  if (info & EAVE) {
    rect(c, mid, x, y + 20, TILE, 8);
    rect(c, dark, x, y + 26, TILE, 4);
    rect(c, OUTLINE, x, y + 30, TILE, 2);
  }
  if (info & L) rect(c, OUTLINE, x, y, 1, TILE);
  if (info & R) rect(c, OUTLINE, x + TILE - 1, y, 1, TILE);
}

/** 한 타일을 (x, y) 픽셀 위치에 그린다. seed로 풀 무늬를 바꾸고 frame(0/1)은 물·용암 물결 */
export function drawTile(c: Ctx, t: Tile, x: number, y: number, frame: number, region: RegionId, seed = 0) {
  const kind = kindOf(t);
  const g = GROUND[region];
  switch (kind) {
    case 'grass': ground(c, x, y, seed, g); break;
    case 'tall': {
      ground(c, x, y, seed, g);
      rect(c, g.tall, x, y + 4, TILE, 28);
      for (let row = 0; row < 3; row += 1) {
        for (let k = 0; k < 5; k += 1) {
          const bx = x + 2 + k * 6 + ((row + frame) % 2) * 3;
          const by = y + 4 + row * 9;
          rect(c, g.tallDark, bx, by + 3, 3, 8);
          rect(c, g.tallDark, bx + 1, by, 1, 4);
          rect(c, g.tallTip, bx + 1, by - 1, 1, 3);
          rect(c, g.tallTip, bx, by + 4, 1, 4);
          if (region === 'snow') rect(c, '#ffffff', bx, by - 1, 3, 2);
          if (region === 'volcano' && (k + row) % 3 === 0) rect(c, '#ffd27a', bx + 1, by - 2, 1, 1);
        }
      }
      break;
    }
    case 'path': {
      const [base, dark, light] = PATH[region];
      rect(c, base, x, y, TILE, TILE);
      for (let i = 0; i < 7; i += 1) rect(c, dark, x + Math.floor(rnd(seed, i) * 28), y + Math.floor(rnd(seed, i + 7) * 30), 3, 2);
      for (let i = 0; i < 4; i += 1) rect(c, light, x + Math.floor(rnd(seed, i + 14) * 28), y + Math.floor(rnd(seed, i + 21) * 28), 2, 1);
      rect(c, light, x, y, TILE, 1);
      rect(c, light, x, y, 1, TILE);
      break;
    }
    case 'water': {
      rect(c, '#3b82d6', x, y, TILE, TILE);
      rect(c, '#2f6dbd', x, y + 20, TILE, 12);
      for (let r = 0; r < 3; r += 1) {
        const ox = (frame ? 10 : 0) + r * 7;
        rect(c, '#86c0f4', x + (ox % 22) + 2, y + 5 + r * 9, 8, 1);
        rect(c, '#5aa0e8', x + ((ox + 12) % 22) + 2, y + 8 + r * 9, 5, 1);
      }
      break;
    }
    case 'tree': drawTree(c, x, y, seed, region); break;
    case 'flower': {
      ground(c, x, y, seed, g);
      const cols = ['#e8484f', '#f7d340', '#ffffff', '#f283c1'];
      for (let i = 0; i < 4; i += 1) {
        const fx = x + 4 + (i % 2) * 14 + Math.floor(rnd(seed, i) * 5);
        const fy = y + 5 + Math.floor(i / 2) * 14 + Math.floor(rnd(seed, i + 5) * 4);
        const col = cols[(seed + i) % 4];
        rect(c, '#3f8a2f', fx + 1, fy + 3, 1, 5);
        rect(c, col, fx, fy + 1, 3, 1);
        rect(c, col, fx + 1, fy, 1, 3);
        rect(c, '#f7d340', fx + 1, fy + 1, 1, 1);
      }
      break;
    }
    case 'fence': {
      ground(c, x, y, seed, g);
      rect(c, '#5c3d1e', x, y + 10, TILE, 5);
      rect(c, '#5c3d1e', x, y + 19, TILE, 5);
      rect(c, '#d9a869', x, y + 11, TILE, 3);
      rect(c, '#d9a869', x, y + 20, TILE, 3);
      rect(c, '#5c3d1e', x + 12, y + 6, 8, 22);
      rect(c, '#c8955a', x + 13, y + 7, 6, 20);
      rect(c, '#e8c088', x + 13, y + 7, 2, 20);
      break;
    }
    case 'rock': drawRock(c, x, y, seed, region); break;
    case 'sand': {
      rect(c, '#e8d29a', x, y, TILE, TILE);
      for (let i = 0; i < 6; i += 1) rect(c, '#d4bb7c', x + Math.floor(rnd(seed, i) * 28), y + Math.floor(rnd(seed, i + 6) * 30), 3, 1);
      for (let i = 0; i < 3; i += 1) rect(c, '#f4e4b4', x + Math.floor(rnd(seed, i + 12) * 28), y + Math.floor(rnd(seed, i + 15) * 30), 2, 1);
      break;
    }
    case 'snow': {
      rect(c, '#f2f7fb', x, y, TILE, TILE);
      for (let i = 0; i < 5; i += 1) rect(c, '#d3e3f0', x + Math.floor(rnd(seed, i) * 26), y + Math.floor(rnd(seed, i + 5) * 30), 5, 2);
      for (let i = 0; i < 3; i += 1) rect(c, '#ffffff', x + Math.floor(rnd(seed, i + 9) * 28), y + Math.floor(rnd(seed, i + 12) * 28), 2, 2);
      break;
    }
    case 'ice': {
      rect(c, '#bfe6f5', x, y, TILE, TILE);
      rect(c, '#a4d6ec', x, y + 16, TILE, 16);
      for (let i = 0; i < 3; i += 1) {
        rect(c, '#ffffff', x + 4 + i * 9, y + 20 - i * 6, 6, 1);
        rect(c, '#ffffff', x + 6 + i * 9, y + 19 - i * 6, 1, 1);
      }
      rect(c, '#e6f7fc', x, y, TILE, 1);
      break;
    }
    case 'lava': {
      rect(c, '#d8401a', x, y, TILE, TILE);
      // 녹은 줄기가 frame마다 흘러간다
      for (let r = 0; r < 4; r += 1) {
        const ox = (r * 11 + frame * 8 + seed * 5) % 32;
        rect(c, '#f06a24', x, y + r * 8 + 2, TILE, 3);
        rect(c, '#ffb02e', x + Math.max(0, ox - 6), y + r * 8 + 3, 10, 1);
        rect(c, '#ffb02e', x + ((ox + 18) % 26), y + r * 8 + 3, 6, 1);
      }
      disc(c, '#ffd25a', x + 8 + ((frame + seed) % 2) * 14, y + 10 + (seed % 2) * 10, 2);
      rect(c, '#fff2a8', x + 7 + ((frame + seed) % 2) * 14, y + 9 + (seed % 2) * 10, 2, 1);
      rect(c, '#7a1e0c', x, y, TILE, 1);
      break;
    }
    case 'volcano': {
      rect(c, '#5a4a48', x, y, TILE, TILE);
      for (let i = 0; i < 5; i += 1) rect(c, '#3c302f', x + Math.floor(rnd(seed, i) * 24), y + Math.floor(rnd(seed, i + 5) * 28), 6, 2);
      for (let i = 0; i < 2; i += 1) rect(c, '#d8602a', x + Math.floor(rnd(seed, i + 9) * 24), y + Math.floor(rnd(seed, i + 12) * 28), 3, 1);
      rect(c, '#6e5c5a', x, y, TILE, 1);
      break;
    }
    case 'cactus': {
      ground(c, x, y, seed, g);
      disc(c, 'rgba(0,0,0,0.18)', x + 16, y + 28, 9);
      rect(c, '#1e5a2c', x + 11, y + 4, 10, 26);
      rect(c, '#2e8a44', x + 12, y + 5, 8, 24);
      rect(c, '#52b868', x + 13, y + 6, 2, 22);
      rect(c, '#1e5a2c', x + 4, y + 12, 8, 10); rect(c, '#2e8a44', x + 5, y + 13, 6, 8);
      rect(c, '#1e5a2c', x + 20, y + 8, 8, 10); rect(c, '#2e8a44', x + 21, y + 9, 6, 8);
      for (let i = 0; i < 4; i += 1) rect(c, '#f4f0c0', x + 14 + (i % 2) * 4, y + 8 + i * 5, 1, 1);
      break;
    }
    case 'wall': wallBase(c, x, y, extra(t)); break;
    case 'window': {
      wallBase(c, x, y, extra(t));
      rect(c, '#5a4030', x + 7, y + 7, 18, 16);
      rect(c, '#8fd0f0', x + 9, y + 9, 14, 12);
      rect(c, '#bfe8fa', x + 9, y + 9, 6, 5);
      rect(c, '#5a4030', x + 15, y + 9, 2, 12);
      rect(c, '#5a4030', x + 9, y + 14, 14, 2);
      rect(c, '#b9a77c', x + 6, y + 23, 20, 2);
      break;
    }
    case 'door': {
      wallBase(c, x, y, extra(t));
      rect(c, OUTLINE, x + 6, y + 4, 20, 28);
      rect(c, '#8a5a2b', x + 8, y + 6, 16, 26);
      rect(c, '#a8733a', x + 8, y + 6, 7, 26);
      rect(c, '#6e4620', x + 15, y + 6, 1, 26);
      rect(c, '#6e4620', x + 10, y + 12, 12, 1);
      rect(c, '#f7d340', x + 20, y + 19, 3, 3);
      rect(c, '#c9a050', x + 5, y + 30, 22, 2);
      break;
    }
    case 'roof': drawRoof(c, t, x, y); break;
    case 'sign': {
      ground(c, x, y, seed, g);
      rect(c, 'rgba(0,0,0,0.2)', x + 8, y + 28, 16, 3);
      rect(c, '#6b4423', x + 14, y + 16, 4, 14);
      rect(c, '#6b4423', x + 4, y + 5, 24, 15);
      rect(c, '#c8955a', x + 5, y + 6, 22, 13);
      rect(c, '#e0b077', x + 5, y + 6, 22, 2);
      rect(c, '#6b4423', x + 8, y + 10, 16, 1);
      rect(c, '#6b4423', x + 8, y + 14, 12, 1);
      break;
    }
    case 'floor': {
      rect(c, '#d9b27a', x, y, TILE, TILE);
      for (let r = 0; r < 4; r += 1) rect(c, '#b88f58', x, y + r * 8 + 7, TILE, 1);
      rect(c, '#b88f58', x + 12 + (seed % 3) * 4, y, 1, 7);
      rect(c, '#b88f58', x + 4, y + 8, 1, 7);
      rect(c, '#e8c898', x, y, TILE, 1);
      break;
    }
    case 'carpet': {
      rect(c, '#c9363e', x, y, TILE, TILE);
      rect(c, '#f0c050', x, y, TILE, 3);
      rect(c, '#9a2430', x, y + 3, TILE, 2);
      for (let k = 0; k < 4; k += 1) rect(c, '#e0505a', x + 4 + k * 8, y + 14, 3, 3);
      break;
    }
    case 'counter': {
      rect(c, '#6a4020', x, y + 4, TILE, 28);
      rect(c, '#c28a4c', x, y + 2, TILE, 10);
      rect(c, '#e0ae70', x, y + 2, TILE, 3);
      rect(c, '#9a6a34', x + 2, y + 15, 28, 15);
      rect(c, '#b88044', x + 4, y + 17, 24, 11);
      rect(c, OUTLINE, x, y + 31, TILE, 1);
      break;
    }
    case 'shelf': {
      rect(c, '#e9dcc0', x, y, TILE, TILE);
      rect(c, '#5e3c1c', x + 1, y, 30, 32);
      rect(c, '#8a5a2c', x + 3, y + 2, 26, 28);
      const items = ['#e8484f', '#3f78d8', '#f7d340', '#3a9a4a', '#f283c1', '#ffffff'];
      for (let r = 0; r < 2; r += 1) {
        rect(c, '#5e3c1c', x + 3, y + 14 + r * 14, 26, 2);
        for (let k = 0; k < 4; k += 1) rect(c, items[(k + r * 2 + seed) % 6], x + 5 + k * 6, y + 5 + r * 14 - (k % 2), 4, 9 + (k % 2));
      }
      break;
    }
    case 'machine': {
      rect(c, '#e9dcc0', x, y, TILE, TILE);
      rect(c, OUTLINE, x + 2, y + 3, 28, 27);
      rect(c, '#9aa4b0', x + 3, y + 4, 26, 25);
      rect(c, '#1d2a44', x + 6, y + 7, 20, 11);
      rect(c, '#4fd0e8', x + 8, y + 9, 16, 1);
      rect(c, '#4fd0e8', x + 8, y + 12, 10, 1);
      rect(c, '#4fd0e8', x + 8, y + 15, 13, 1);
      rect(c, '#e8484f', x + 7, y + 22, 4, 4);
      rect(c, '#f7d340', x + 13, y + 22, 4, 4);
      rect(c, '#3a9a4a', x + 19, y + 22, 4, 4);
      break;
    }
    case 'gym': gymFloor(c, x, y, seed, region); break;
    case 'pillar': {
      gymFloor(c, x, y, seed, region);
      disc(c, 'rgba(0,0,0,0.25)', x + 16, y + 28, 11);
      if (region === 'meadow') {
        rect(c, '#6a4020', x + 7, y + 18, 18, 12); rect(c, '#9a6334', x + 8, y + 19, 16, 3);
        disc(c, '#246a30', x + 16, y + 12, 11); disc(c, '#3a9a4a', x + 15, y + 11, 9);
        disc(c, '#6cc87a', x + 12, y + 8, 4); rect(c, '#f283c1', x + 19, y + 9, 3, 3); rect(c, '#f7d340', x + 11, y + 14, 2, 2);
      } else if (region === 'desert') {
        rect(c, '#7a4a28', x + 8, y + 2, 16, 29); rect(c, '#e0b070', x + 9, y + 3, 14, 27);
        rect(c, '#f4d49a', x + 10, y + 3, 4, 27); rect(c, '#b88850', x + 19, y + 3, 3, 27);
        rect(c, '#7a4a28', x + 6, y + 2, 20, 3); rect(c, '#7a4a28', x + 6, y + 27, 20, 4);
        rect(c, '#c27a44', x + 14, y + 12, 4, 6);
      } else if (region === 'snow') {
        rect(c, '#4f8ab0', x + 6, y + 4, 20, 26); rect(c, '#bfe6f5', x + 7, y + 5, 18, 24);
        rect(c, '#e6f7fc', x + 8, y + 6, 6, 22); rect(c, '#8cc6e0', x + 19, y + 5, 5, 24);
        rect(c, '#ffffff', x + 9, y + 8, 2, 8); rect(c, '#ffffff', x + 16, y + 20, 5, 1);
      } else {
        rect(c, '#14100f', x + 7, y + 16, 18, 14); rect(c, '#3a2c28', x + 8, y + 17, 16, 3);
        const f = frame ? 2 : 0;
        disc(c, '#e8481c', x + 16, y + 11 - f, 6); disc(c, '#ffb02e', x + 16, y + 12 - f, 4);
        rect(c, '#fff2a8', x + 15, y + 11 - f, 2, 3); rect(c, '#e8481c', x + 12 + f, y + 3, 2, 3);
      }
      break;
    }
    case 'marble': {
      const dark = seed % 2 === 0;
      rect(c, dark ? '#e8e2f0' : '#f6f2fa', x, y, TILE, TILE);
      rect(c, '#cfc6dc', x + 4 + (seed % 3) * 6, y + 6, 10, 1); rect(c, '#cfc6dc', x + 14, y + 7, 6, 1);
      rect(c, '#d8b84a', x, y, TILE, 1); rect(c, '#d8b84a', x, y, 1, TILE);
      if (dark) { rect(c, '#d8b84a', x + 14, y + 14, 4, 4); rect(c, '#f4dc7a', x + 15, y + 15, 2, 2); }
      break;
    }
    case 'iwall': {
      rect(c, '#efe3c6', x, y, TILE, TILE);
      rect(c, '#e2d3ae', x, y, TILE, 2);
      rect(c, '#d9c9a0', x + 15, y, 2, TILE);
      rect(c, 'rgba(60,40,30,0.12)', x, y + 26, TILE, 6);
      break;
    }
    case 'iwall2': {
      rect(c, '#efe3c6', x, y, TILE, 10);
      rect(c, '#b98a55', x, y + 10, TILE, 22);
      rect(c, '#d3a26a', x, y + 10, TILE, 3);
      rect(c, '#8a6238', x, y + 26, TILE, 6);
      rect(c, '#a07446', x + 15, y + 13, 2, 13);
      break;
    }
  }
}
