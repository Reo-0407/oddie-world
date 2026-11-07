import type { TypeName } from '../engine/types.ts';
import type { Vec2 } from './math.ts';

/** 월드는 한 변 120짜리 정사각 맵(-60~60). 가운데 십자선을 경계로 네 구역으로 나뉜다 */
export const MAP_HALF = 60;
export const START_POS: Vec2 = { x: -10, z: -10 };
/** 구역 경계에서 색과 하늘이 섞이는 폭 (경계 양쪽으로 이만큼) */
export const BLEND_WIDTH = 6;

export type RegionId = 'meadow' | 'desert' | 'snow' | 'volcano';

export const REGION_IDS: readonly RegionId[] = ['meadow', 'desert', 'snow', 'volcano'];

export interface RegionInfo {
  name: string;
  ground: string;
  sky: string;
  /** 구역에 어울리는 타입과 나올 가중치(적힌 것만 올라가고 나머지는 1) */
  typeWeights: Partial<Record<TypeName, number>>;
}

export const REGIONS: Record<RegionId, RegionInfo> = {
  meadow: {
    name: '초원', ground: '#7bbf5a', sky: '#bfe3f5',
    typeWeights: { grass: 4, bug: 3, normal: 3, fairy: 2, flying: 2 },
  },
  desert: {
    name: '사막', ground: '#e2c27a', sky: '#f3dcae',
    typeWeights: { ground: 4, rock: 3, fire: 2, dark: 2, poison: 2 },
  },
  snow: {
    name: '설원', ground: '#eef4f8', sky: '#dce8f2',
    typeWeights: { ice: 5, water: 2, steel: 2, psychic: 2, fighting: 1.5 },
  },
  volcano: {
    name: '화산', ground: '#5a4a48', sky: '#8a6a60',
    typeWeights: { fire: 5, rock: 3, dragon: 2, ghost: 2, dark: 2, fighting: 1.5 },
  },
};

/** 북서=초원(마을), 북동=사막, 남서=설원, 남동=화산. 북쪽이 z가 작은 쪽 */
export function regionAt(x: number, z: number): RegionId {
  if (x < 0) return z < 0 ? 'meadow' : 'snow';
  return z < 0 ? 'desert' : 'volcano';
}

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 경계 근처에서 구역이 부드럽게 섞이는 비율 (합이 1) */
export function regionWeights(x: number, z: number): Record<RegionId, number> {
  const east = smoothstep(-BLEND_WIDTH, BLEND_WIDTH, x);
  const south = smoothstep(-BLEND_WIDTH, BLEND_WIDTH, z);
  return {
    meadow: (1 - east) * (1 - south),
    desert: east * (1 - south),
    snow: (1 - east) * south,
    volcano: east * south,
  };
}

/** 한 오디가 구역에서 나올 가중치: 가진 타입 중 가장 높은 가중치 */
export function speciesWeight(region: RegionId, types: readonly TypeName[]): number {
  const table = REGIONS[region].typeWeights;
  return types.reduce((best, type) => Math.max(best, table[type] ?? 1), 1);
}

export interface SpawnCandidate {
  id: number;
  types: readonly TypeName[];
}

/** 구역에 맞는 오디를 가중치로 뽑는다. rand는 0 이상 1 미만 난수 */
export function pickSpeciesForRegion(region: RegionId, candidates: readonly SpawnCandidate[], rand: () => number): number {
  if (candidates.length === 0) throw new Error('뽑을 오디가 없음');
  const weights = candidates.map((candidate) => speciesWeight(region, candidate.types));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rand() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return candidates[i].id;
  }
  return candidates[candidates.length - 1].id;
}

/** '#rrggbb'를 비율대로 섞는다 (구역 바닥색, 하늘색) */
export function blendHex(weights: Record<RegionId, number>, pick: (info: RegionInfo) => string): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const id of REGION_IDS) {
    const hex = pick(REGIONS[id]);
    const weight = weights[id];
    r += parseInt(hex.slice(1, 3), 16) * weight;
    g += parseInt(hex.slice(3, 5), 16) * weight;
    b += parseInt(hex.slice(5, 7), 16) * weight;
  }
  return [r / 255, g / 255, b / 255];
}

/** 맵 안으로 들어오게 자른다 */
export function clampToMap(p: Vec2): Vec2 {
  return { x: Math.max(-MAP_HALF, Math.min(MAP_HALF, p.x)), z: Math.max(-MAP_HALF, Math.min(MAP_HALF, p.z)) };
}

export function insideMap(p: Vec2): boolean {
  return Math.abs(p.x) <= MAP_HALF && Math.abs(p.z) <= MAP_HALF;
}
