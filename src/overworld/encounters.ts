import { SPECIES } from '../data/index.ts';
import { pickSpeciesForRegion, type RegionId } from '../world/regions.ts';

/** 구역별 야생 오디 레벨 범위 */
export const WILD_LEVELS: Record<RegionId, [number, number]> = {
  meadow: [3, 6], desert: [10, 14], snow: [17, 22], volcano: [25, 30],
};
const CANDIDATES = SPECIES.map((s) => ({ id: s.id, types: s.types }));

export interface WildRoll { speciesId: number; level: number; region: RegionId }

export function rollWild(region: RegionId, rand: () => number): WildRoll {
  const [lo, hi] = WILD_LEVELS[region];
  return { speciesId: pickSpeciesForRegion(region, CANDIDATES, rand), level: lo + Math.floor(rand() * (hi - lo + 1)), region };
}

export interface TrainerTeamMember { speciesId: number; level: number }

export interface Trainer {
  /** 지도 NPC의 id와 같다 */
  id: string;
  name: string;
  team: TrainerTeamMember[];
  /** 이기면 받는 코인 */
  reward: number;
  lines: { before: string; after: string };
}

export const TRAINERS: Record<string, Trainer> = {
  'route1-kid': {
    id: 'route1-kid',
    name: '꼬마 트레이너',
    // 1번 Pippo(풀), 그리고 초원 타입 하나 더
    team: [{ speciesId: 1, level: 5 }, { speciesId: 2, level: 7 }],
    reward: 120,
    lines: { before: '나랑 승부하자!', after: '으앙, 졌다… 너 정말 세구나!' },
  },
};

export const trainerById = (id: string): Trainer | undefined => TRAINERS[id];
