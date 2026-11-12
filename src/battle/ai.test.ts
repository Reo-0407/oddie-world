import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng.ts';
import type { Move } from '../engine/types.ts';
import {
  BAIT_MS, DODGE_MS, TELEGRAPH_MS, activeOf, bestCounter, chooseCharged, createRealtime, expectedDamage, makeFighter, matchup, tick,
} from './realtime.ts';
import { STRONG_LEVELS, WILD_LEVELS, WILD_LEVEL_HEADROOM, rollWild, wildLevel } from '../overworld/encounters.ts';

const mv = (id: number, type: Move['type'], power: number, extra: Partial<Move> = {}): Move =>
  ({ id, name: `기술${id}`, type, category: 'special', power, accuracy: 100, priority: 0, effects: [], ...extra });

describe('상대 AI: 필살기 고르기', () => {
  // 1번(풀) 상대로: 불꽃 기술이 같은 위력의 물 기술보다 낫다
  const target = makeFighter(1, 20).mon;
  it('야생은 첫 기술이 차면 바로 쓴다', () => {
    const f = { ...makeFighter(2, 20), energy: 100 };
    f.charged = [mv(1, 'water', 60), mv(2, 'fire', 60)];
    expect(chooseCharged(f, target, 'wild')).toBe(0);
  });
  it('트레이너 이상은 상성까지 따져 기대 피해가 큰 기술을 고른다', () => {
    const f = { ...makeFighter(2, 20), energy: 100 };
    f.charged = [mv(1, 'water', 60), mv(2, 'fire', 60)];
    expect(expectedDamage(f.mon, target, f.charged[1])).toBeGreaterThan(expectedDamage(f.mon, target, f.charged[0]));
    expect(chooseCharged(f, target, 'trainer')).toBe(1);
  });
  it('훨씬 센 기술이 조금만 더 모으면 되면 아껴 둔다', () => {
    // 센 기술 70 에너지, 약한 기술 35 에너지: 50이면 아껴 두고 80이면 센 기술
    const f = { ...makeFighter(2, 20), energy: 50 };
    f.charged = [mv(1, 'fire', 120), mv(2, 'normal', 40)];
    expect(chooseCharged(f, target, 'leader')).toBeNull();
    expect(chooseCharged({ ...f, energy: 80 }, target, 'leader')).toBe(0);
  });
  it('세게 맞는 중이면 공격을 낮추는 기술을 우대한다', () => {
    const f = { ...makeFighter(2, 20), energy: 100 };
    const lower = mv(2, 'normal', 55, { effects: [{ kind: 'stage', target: 'foe', stat: 'atk', delta: -1, chance: 100 }] });
    f.charged = [mv(1, 'normal', 60), lower];
    expect(chooseCharged(f, target, 'trainer', 0)).toBe(0);
    expect(chooseCharged(f, target, 'trainer', 0.5)).toBe(1);
  });
});

describe('상대 AI: 교체와 회복약', () => {
  it('상성이 크게 불리하면 더 맞는 오디로 바꾸고, 쓰러지면 가장 잘 맞는 오디를 낸다', () => {
    const rng = createRng(3);
    let s = createRealtime('trainer', [{ speciesId: 1, level: 20 }], [{ speciesId: 1, level: 20 }, { speciesId: 2, level: 20 }], 0, 'leader');
    const me = activeOf(s, 'me');
    // 상대 0번은 물 기술뿐(풀에 약하다), 1번은 불꽃 기술
    s.foe[0].fast = mv(5, 'water', 30); s.foe[0].charged = [mv(6, 'water', 60)];
    s.foe[1].fast = mv(7, 'fire', 30); s.foe[1].charged = [mv(8, 'fire', 60)];
    s.foe[0].mon = { ...s.foe[0].mon, types: ['water'] };
    me.fast = mv(9, 'grass', 30); me.charged = [mv(10, 'grass', 60)];
    expect(matchup(s.foe[0], me)).toBeLessThan(0.6);
    expect(bestCounter(s.foe, me, 0)).toBe(1);
    s = { ...s, foeSwitchCd: 0 };
    s = tick(s, 16, {}, rng);
    expect(s.foeActive).toBe(1);
    expect(s.events.some((e) => e.t === 'send' && e.side === 'foe')).toBe(true);
    // 야생/쿨타임 중에는 바꾸지 않는다
    const w = createRealtime('trainer', [{ speciesId: 1, level: 20 }], [{ speciesId: 1, level: 20 }, { speciesId: 2, level: 20 }], 0, 'leader');
    expect(tick(w, 16, {}, rng).foeActive).toBe(0);
  });

  it('관장은 체력 25% 아래에서 회복약을 한 번만 쓴다', () => {
    const rng = createRng(4);
    let s = createRealtime('trainer', [{ speciesId: 1, level: 20 }], [{ speciesId: 2, level: 20 }], 0, 'leader');
    s.foe[0].mon.hp = 5;
    s = tick(s, 16, {}, rng);
    expect(s.events.some((e) => e.t === 'item' && e.side === 'foe')).toBe(true);
    expect(s.foe[0].mon.hp).toBeGreaterThan(5);
    s.foe[0].mon.hp = 5;
    s = tick(s, 16, {}, rng);
    expect(s.events.some((e) => e.t === 'item')).toBe(false);
    // 일반 트레이너는 안 쓴다
    let t = createRealtime('trainer', [{ speciesId: 1, level: 20 }], [{ speciesId: 2, level: 20 }]);
    t.foe[0].mon.hp = 5;
    t = tick(t, 16, {}, rng);
    expect(t.events.some((e) => e.t === 'item')).toBe(false);
  });
});

describe('상대 AI: 박자', () => {
  it('트레이너 이상은 내가 피하는 동안 기다렸다가 피하기가 끝나면 친다(야생은 그냥 친다)', () => {
    for (const ai of ['wild', 'trainer'] as const) {
      const rng = createRng(5);
      let s = createRealtime(ai === 'wild' ? 'wild' : 'trainer', [{ speciesId: 1, level: 20 }], [{ speciesId: 2, level: 20 }], 0, ai);
      s.foe[0].energy = 0;
      s.foeNextMs = 50;
      s = tick(s, 16, { dodge: true }, rng);
      s = tick(s, 60, {}, rng);
      const hitDuring = s.events.find((e) => e.t === 'hit' && e.side === 'me');
      if (ai === 'wild') { expect(hitDuring).toBeTruthy(); continue; }
      expect(hitDuring).toBeUndefined();
      expect(s.foeNextMs).toBeGreaterThan(0);
      s = tick(s, DODGE_MS, {}, rng);
      expect(s.dodgeMs).toBe(0);
      s = tick(s, 200, {}, rng);
      const after = s.events.find((e) => e.t === 'hit' && e.side === 'me');
      expect(after && after.t === 'hit' && after.dodged).toBe(false);
    }
  });

  it('필살기 예고: 야생은 1초, 트레이너 이상은 0.6~1.2초로 들쭉날쭉', () => {
    const lengths = new Set<number>();
    for (let seed = 0; seed < 20; seed += 1) {
      const rng = createRng(seed);
      let s = createRealtime('trainer', [{ speciesId: 1, level: 20 }], [{ speciesId: 2, level: 20 }], 0, 'leader');
      s.foe[0].energy = 100; s.foeNextMs = 1;
      s = tick(s, 16, {}, rng);
      expect(s.telegraph).not.toBeNull();
      expect(s.telegraph!.ms).toBeGreaterThanOrEqual(BAIT_MS[0]);
      expect(s.telegraph!.ms).toBeLessThanOrEqual(BAIT_MS[1]);
      lengths.add(s.telegraph!.ms);
    }
    expect(lengths.size).toBeGreaterThan(3);
    let w = createRealtime('wild', [{ speciesId: 1, level: 20 }], [{ speciesId: 2, level: 20 }]);
    w.foe[0].energy = 100; w.foeNextMs = 1;
    w = tick(w, 16, {}, createRng(1));
    expect(w.telegraph!.ms).toBe(TELEGRAPH_MS);
  });
});

describe('야생 레벨: 선두에 맞춘다', () => {
  it('선두 −2…+3, 구역 최저 밑·최고+4 위로는 안 간다', () => {
    for (const r of [0, 0.2, 0.5, 0.8, 0.999]) {
      const lv = wildLevel('desert', 12, () => r);
      expect(lv).toBeGreaterThanOrEqual(10);
      expect(lv).toBeLessThanOrEqual(15);
    }
    expect(wildLevel('desert', 3, () => 0.999)).toBe(WILD_LEVELS.desert[0]);
    expect(wildLevel('meadow', 40, () => 0)).toBe(WILD_LEVELS.meadow[1] + WILD_LEVEL_HEADROOM);
  });
  it('강한 야생 오디는 10%로 +3레벨, 막 시작한 트레이너(선두 Lv.8 미만)에게는 안 나온다', () => {
    const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
    // 종 뽑기, 강함(0.05 < 0.1), 레벨(가운데), 반짝이(아님)
    const strong = rollWild('desert', seq([0.5, 0.05, 0.45, 0.9]), { lead: 12 });
    expect(strong.strong).toBe(true);
    const plain = rollWild('desert', seq([0.5, 0.5, 0.45, 0.9]), { lead: 12 });
    expect(strong.level - plain.level).toBe(STRONG_LEVELS);
    expect(rollWild('meadow', seq([0.5, 0.45, 0.9]), { lead: 5 }).strong).toBeUndefined();
  });
});
