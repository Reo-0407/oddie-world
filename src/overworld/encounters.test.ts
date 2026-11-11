import { describe, expect, it } from 'vitest';
import { SPECIES, speciesById } from '../data/index.ts';
import { REGIONS } from '../world/regions.ts';
import { route1 } from './maps/route1.ts';
import { TRAINERS, WILD_LEVELS, rollWild } from './encounters.ts';

describe('야생 조우', () => {
  it('구역별 레벨 범위', () => {
    expect(WILD_LEVELS).toEqual({ meadow: [3, 6], desert: [10, 14], snow: [17, 22], volcano: [25, 30] });
  });
  it('rollWild는 범위 안 레벨과 있는 종을 준다', () => {
    for (const region of ['meadow', 'desert', 'snow', 'volcano'] as const) {
      for (const r of [0, 0.5, 0.999]) {
        const w = rollWild(region, () => r);
        const [lo, hi] = WILD_LEVELS[region];
        expect(w.level).toBeGreaterThanOrEqual(lo);
        expect(w.level).toBeLessThanOrEqual(hi);
        expect(w.speciesId).toBeGreaterThanOrEqual(1);
        expect(w.speciesId).toBeLessThanOrEqual(SPECIES.length);
        expect(w.region).toBe(region);
      }
    }
  });
});

describe('트레이너', () => {
  it('지도의 트레이너 NPC마다 표가 있다', () => {
    for (const npc of route1.npcs.filter((n) => n.trainer)) expect(TRAINERS[npc.id]?.id).toBe(npc.id);
  });
  it('1번 길 꼬마: 초원 타입 2마리, 레벨 5~7', () => {
    const t = TRAINERS['route1-kid'];
    expect(t.team).toHaveLength(2);
    const meadow = Object.keys(REGIONS.meadow.typeWeights);
    for (const m of t.team) {
      expect(m.level).toBeGreaterThanOrEqual(5);
      expect(m.level).toBeLessThanOrEqual(7);
      expect(speciesById(m.speciesId).types.some((ty) => meadow.includes(ty))).toBe(true);
    }
    expect(t.reward).toBeGreaterThan(0);
  });
});
