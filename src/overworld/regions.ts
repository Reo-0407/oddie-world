import type { TypeName } from '../engine/types.ts';

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
