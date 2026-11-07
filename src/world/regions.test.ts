import { describe, expect, it } from 'vitest';
import { SPECIES } from '../data/index.ts';
import { createRng } from '../engine/rng.ts';
import { clampToArea, DUEL_RANGE } from './math.ts';
import {
  blendHex, clampToMap, insideMap, MAP_HALF, pickSpeciesForRegion, REGION_IDS, REGIONS, regionAt, regionWeights,
  speciesWeight, START_POS, type RegionId,
} from './regions.ts';
import { classifyBone } from './rigNames.ts';
import { stepWander } from './wander.ts';

describe('구역', () => {
  it('네 구역이 사분면으로 나뉜다', () => {
    expect(regionAt(-10, -10)).toBe('meadow');
    expect(regionAt(10, -10)).toBe('desert');
    expect(regionAt(-10, 10)).toBe('snow');
    expect(regionAt(10, 10)).toBe('volcano');
    expect(regionAt(-0.01, -0.01)).toBe('meadow');
    expect(regionAt(0, 0)).toBe('volcano');
  });
  it('시작 위치와 마을(-19,-19)은 초원', () => {
    expect(regionAt(START_POS.x, START_POS.z)).toBe('meadow');
    expect(regionAt(-19, -19)).toBe('meadow');
  });
  it('섞임 비율은 합이 1이고, 경계에서 반반, 멀리서는 한 구역뿐', () => {
    for (const [x, z] of [[0, 0], [-3, 2], [40, -30], [-59, 59], [5, -1]]) {
      const w = regionWeights(x, z);
      expect(REGION_IDS.reduce((sum, id) => sum + w[id], 0)).toBeCloseTo(1);
    }
    const edge = regionWeights(0, -40);
    expect(edge.meadow).toBeCloseTo(0.5);
    expect(edge.desert).toBeCloseTo(0.5);
    expect(regionWeights(-30, -30).meadow).toBeCloseTo(1);
    expect(regionWeights(30, 30).volcano).toBeCloseTo(1);
  });
  it('색 섞기: 한 구역이면 그 색 그대로', () => {
    const [r, g, b] = blendHex(regionWeights(-30, -30), (info) => info.ground);
    expect(Math.round(r * 255)).toBe(parseInt(REGIONS.meadow.ground.slice(1, 3), 16));
    expect(Math.round(g * 255)).toBe(parseInt(REGIONS.meadow.ground.slice(3, 5), 16));
    expect(Math.round(b * 255)).toBe(parseInt(REGIONS.meadow.ground.slice(5, 7), 16));
  });
});

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

describe('맵 경계', () => {
  it('맵은 120×120이고 밖으로 나가면 잘려 들어온다', () => {
    expect(MAP_HALF * 2).toBe(120);
    expect(clampToMap({ x: 200, z: -200 })).toEqual({ x: MAP_HALF, z: -MAP_HALF });
    expect(clampToMap({ x: 3, z: 4 })).toEqual({ x: 3, z: 4 });
    expect(insideMap({ x: MAP_HALF, z: -MAP_HALF })).toBe(true);
    expect(insideMap({ x: MAP_HALF + 0.1, z: 0 })).toBe(false);
  });
  it('배회하는 오디는 맵 가장자리를 넘지 않는다', () => {
    let state = { x: MAP_HALF - 0.2, z: 0, heading: Math.PI / 2, mode: 'walk' as const, timer: 100 };
    const rand = () => 0.5;
    for (let i = 0; i < 200; i += 1) {
      state = stepWander(state, 0.1, rand, MAP_HALF);
      expect(Math.abs(state.x)).toBeLessThanOrEqual(MAP_HALF);
      expect(Math.abs(state.z)).toBeLessThanOrEqual(MAP_HALF);
    }
  });
  it('플레이어 이동 자르기도 같은 경계를 쓴다', () => {
    expect(clampToArea({ x: 90, z: 90 }, MAP_HALF)).toEqual({ x: MAP_HALF, z: MAP_HALF });
    expect(DUEL_RANGE).toBeLessThan(MAP_HALF);
  });
});

describe('캐릭터 뼈 이름', () => {
  it('Quaternius식 이름과 three가 점을 지운 이름을 모두 읽는다', () => {
    expect(classifyBone('UpperArm.L')).toEqual({ part: 'upperArm', side: 'L' });
    expect(classifyBone('UpperArmR')).toEqual({ part: 'upperArm', side: 'R' });
    expect(classifyBone('LowerArm.L')).toEqual({ part: 'lowerArm', side: 'L' });
    expect(classifyBone('Shoulder.R')).toEqual({ part: 'shoulder', side: 'R' });
    expect(classifyBone('Hand.L')).toEqual({ part: 'hand', side: 'L' });
    expect(classifyBone('UpperLeg.R')).toEqual({ part: 'upperLeg', side: 'R' });
    expect(classifyBone('LowerLegL')).toEqual({ part: 'lowerLeg', side: 'L' });
  });
  it('다른 도구의 이름 꼴(thigh, forearm, upper_arm_left)도 읽는다', () => {
    expect(classifyBone('Thigh_L')).toEqual({ part: 'upperLeg', side: 'L' });
    expect(classifyBone('mixamorig:LeftArm')).toBeNull(); // 접두어가 앞에 붙은 이름은 지원하지 않는다
    expect(classifyBone('upper_arm_left')).toEqual({ part: 'upperArm', side: 'L' });
    expect(classifyBone('forearm.R')).toEqual({ part: 'lowerArm', side: 'R' });
  });
  it('몸통, 머리, 방향 없는 뼈는 null', () => {
    for (const name of ['Hips', 'Head', 'Neck', 'Torso', 'CharacterArmature', 'Abdomen', 'Chest', 'Eyeball']) {
      expect(classifyBone(name), name).toBeNull();
    }
  });
});
