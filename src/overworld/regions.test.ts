import { describe, expect, it } from 'vitest';
import { SPECIES } from '../data/index.ts';
import { createRng } from '../engine/rng.ts';
import { pickSpeciesForRegion, speciesWeight, type RegionId } from './regions.ts';

describe('구역별 오디 가중치', () => {
  const candidates = SPECIES.map((s) => ({ id: s.id, types: s.types }));
  const rng = (seed: number) => createRng(seed).next;

  it('어울리는 타입이 높은 가중치, 나머지는 1', () => {
    expect(speciesWeight('desert', ['ground'])).toBe(4);
    expect(speciesWeight('desert', ['water'])).toBe(1);
    expect(speciesWeight('snow', ['ice', 'water'])).toBe(5);
    expect(speciesWeight('volcano', ['fire', 'rock'])).toBe(5);
    expect(speciesWeight('meadow', ['electric'])).toBe(1);
  });

  it('구역마다 어울리는 타입이 실제로 더 자주 나온다', () => {
    const count = (region: RegionId, kind: string) => {
      const next = rng(99);
      let hits = 0;
      for (let i = 0; i < 6000; i += 1) {
        const id = pickSpeciesForRegion(region, candidates, next);
        if (SPECIES[id - 1].types.includes(kind as never)) hits += 1;
      }
      return hits;
    };
    expect(count('snow', 'ice')).toBeGreaterThan(count('volcano', 'ice') * 1.5);
    expect(count('volcano', 'fire')).toBeGreaterThan(count('snow', 'fire') * 1.5);
    expect(count('desert', 'ground')).toBeGreaterThan(count('meadow', 'ground') * 1.5);
    expect(count('meadow', 'grass')).toBeGreaterThan(count('desert', 'grass') * 1.5);
  });

  it('후보가 있는 한 어떤 오디도 뽑힐 수 있고, 같은 시드면 같은 결과', () => {
    const a = pickSpeciesForRegion('desert', candidates, rng(5));
    expect(pickSpeciesForRegion('desert', candidates, rng(5))).toBe(a);
    expect(pickSpeciesForRegion('desert', [{ id: 7, types: ['water'] }], () => 0.999)).toBe(7);
    expect(() => pickSpeciesForRegion('desert', [], () => 0)).toThrow();
  });
});
