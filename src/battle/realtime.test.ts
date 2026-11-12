import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng.ts';
import {
  DODGE_MS, FAST_COOLDOWN_MS, FAST_ENERGY, FOE_MAX_MS, IMMUNE_SCALE, POTION_COOLDOWN_MS, SWITCH_COOLDOWN_MS, TELEGRAPH_MS, TRAINER_START_ENERGY, WILD_START_ENERGY, levelPace,
  activeOf, createRealtime, energyCost, foeInterval, goEffectiveness, makeFighter, tick, type RtInput, type RtState,
} from './realtime.ts';

const wild = () => createRealtime('wild', [{ speciesId: 1, level: 5 }, { speciesId: 42, level: 5 }], [{ speciesId: 2, level: 5 }]);
/** 상대가 움직이지 않게 멀리 미룬다 */
const freeze = (s: RtState): RtState => ({ ...s, foeNextMs: 1e9 });

describe('실시간 전투: 내 공격', () => {
  it('기본 공격은 0.6초 쿨타임이고 맞히면 에너지가 찬다', () => {
    const rng = createRng(1);
    let s = freeze(wild());
    const hp0 = activeOf(s, 'foe').mon.hp;
    s = tick(s, 16, { fast: true }, rng);
    expect(activeOf(s, 'foe').mon.hp).toBeLessThan(hp0);
    expect(activeOf(s, 'me').energy).toBe(FAST_ENERGY);
    const hp1 = activeOf(s, 'foe').mon.hp;
    s = tick(s, FAST_COOLDOWN_MS - 100, { fast: true }, rng);
    expect(activeOf(s, 'foe').mon.hp).toBe(hp1);
    s = tick(s, 100, { fast: true }, rng);
    expect(activeOf(s, 'foe').mon.hp).toBeLessThan(hp1);
  });

  it('필살기는 위력 큰 기술 최대 2개, 에너지가 모자라면 못 쓴다', () => {
    const f = makeFighter(1, 30);
    expect(f.charged.length).toBe(2);
    expect(f.charged[0].power).toBeGreaterThanOrEqual(f.charged[1].power);
    expect(f.charged.every((m) => m.power >= f.fast.power)).toBe(true);
    const rng = createRng(2);
    let s = freeze(wild());
    const hp0 = activeOf(s, 'foe').mon.hp;
    s = tick(s, 16, { charged: 0 }, rng);
    expect(activeOf(s, 'foe').mon.hp).toBe(hp0);
    s.me[0].energy = 100;
    s = tick(s, 16, { charged: 0 }, rng);
    expect(s.events.some((e) => e.t === 'charged' && e.side === 'me')).toBe(true);
    expect(activeOf(s, 'me').energy).toBe(100 - energyCost(s.me[0].charged[0]));
  });

  it('교체는 3초 쿨타임', () => {
    const rng = createRng(3);
    let s = freeze(wild());
    s = tick(s, 16, { switchTo: 1 }, rng);
    expect(s.myActive).toBe(1);
    s = tick(s, SWITCH_COOLDOWN_MS - 100, { switchTo: 0 }, rng);
    expect(s.myActive).toBe(1);
    s = tick(s, 100, { switchTo: 0 }, rng);
    expect(s.myActive).toBe(0);
  });

  it('도망은 야생만', () => {
    const rng = createRng(4);
    expect(tick(wild(), 16, { run: true }, rng).result).toBe('fled');
    const t = createRealtime('trainer', [{ speciesId: 1, level: 5 }], [{ speciesId: 2, level: 5 }]);
    expect(tick(t, 16, { run: true }, rng).result).toBeNull();
  });
});

describe('실시간 전투: 상대', () => {
  it('상대 간격은 속도로 1.0~1.6초, 레벨이 높은 상대는 레벨당 5% 빨리(0.7~1.2배)', () => {
    const slow = makeFighter(1, 5).mon;
    const fast = makeFighter(1, 60).mon;
    expect(foeInterval(slow, fast)).toBe(700);
    expect(foeInterval(fast, slow)).toBe(FOE_MAX_MS * 1.2);
    expect(foeInterval(slow, slow)).toBe(1500);
    expect(levelPace(slow, { ...slow, level: 8 })).toBeCloseTo(0.85);
  });

  it('에너지가 차면 1초 예고 뒤 필살기, 피하면 75% 덜 맞는다', () => {
    const run = (dodge: boolean) => {
      const rng = createRng(7);
      let s = wild();
      s.foe[0].energy = 100;
      s.foeNextMs = 10;
      s = tick(s, 16, {}, rng);
      expect(s.telegraph).not.toBeNull();
      expect(s.events.some((e) => e.t === 'telegraph')).toBe(true);
      const hp = activeOf(s, 'me').mon.hp;
      s = tick(s, TELEGRAPH_MS - DODGE_MS / 2, {}, rng);
      expect(activeOf(s, 'me').mon.hp).toBe(hp);
      s = tick(s, 16, { dodge }, rng);
      s = tick(s, DODGE_MS / 2, {}, rng);
      const hit = s.events.find((e) => e.t === 'hit' && e.side === 'me');
      expect(hit && hit.t === 'hit' && hit.charged).toBe(true);
      return hit && hit.t === 'hit' ? hit : null;
    };
    const plain = run(false)!;
    const dodged = run(true)!;
    expect(dodged.dodged).toBe(true);
    expect(dodged.amount).toBeLessThanOrEqual(Math.max(1, Math.ceil(plain.amount * 0.25)));
  });
});

describe('실시간 전투: 밸런스 규칙', () => {
  it('트레이너 오디는 에너지 50으로, 야생은 20으로 시작한다', () => {
    expect(createRealtime('trainer', [{ speciesId: 1, level: 5 }], [{ speciesId: 2, level: 5 }]).foe[0].energy).toBe(TRAINER_START_ENERGY);
    expect(wild().foe[0].energy).toBe(WILD_START_ENERGY);
  });

  it('맞은 쪽도 받은 피해만큼 에너지가 찬다', () => {
    const rng = createRng(11);
    let s = freeze(wild());
    s = tick(s, 16, { fast: true }, rng);
    const hit = s.events.find((e) => e.t === 'hit' && e.side === 'foe');
    const foe = activeOf(s, 'foe');
    expect(hit && hit.t === 'hit' && foe.energy).toBe(hit && hit.t === 'hit' ? WILD_START_ENERGY + Math.round((hit.amount / foe.mon.stats.hp) * 60) : -1);
  });

  it('면역 타입도 0.39배 피해(포켓몬 고 규칙)', () => {
    const rng = createRng(12);
    // Emberi(불꽃/고스트)는 노말 기술에 면역
    let s = freeze(createRealtime('wild', [{ speciesId: 1, level: 10 }], [{ speciesId: 42, level: 10 }]));
    s.me[0].fast = { ...s.me[0].fast, type: 'normal' };
    s = tick(s, 16, { fast: true }, rng);
    const hit = s.events.find((e) => e.t === 'hit' && e.side === 'foe');
    expect(hit && hit.t === 'hit' && hit.amount).toBeGreaterThan(0);
    expect(hit && hit.t === 'hit' && hit.effectiveness).toBe(IMMUNE_SCALE);
  });

  it('상성 배율은 포켓몬 고처럼 1.6 / 0.625 / 0.39', () => {
    expect(goEffectiveness(1)).toBe(1);
    expect(goEffectiveness(2)).toBeCloseTo(1.6);
    expect(goEffectiveness(4)).toBeCloseTo(2.56);
    expect(goEffectiveness(0.5)).toBeCloseTo(0.625);
    expect(goEffectiveness(0)).toBe(IMMUNE_SCALE);
  });

  it('기본 공격은 자기 타입 기술을 고른다', () => {
    for (const id of [1, 42, 107]) {
      const f = makeFighter(id, 5);
      expect(f.mon.types).toContain(f.fast.type);
    }
  });

  it('회복약: 절반 회복, 하나 쓰고 3초 쿨타임, 체력이 가득이면 안 쓴다', () => {
    const rng = createRng(13);
    let s = freeze(createRealtime('wild', [{ speciesId: 1, level: 20 }], [{ speciesId: 2, level: 5 }], 2));
    s = tick(s, 16, { potion: true }, rng);
    expect(s.potions).toBe(2);
    const max = s.me[0].mon.stats.hp;
    s.me[0].mon.hp = 1;
    s = tick(s, 16, { potion: true }, rng);
    expect(s.potions).toBe(1);
    expect(s.me[0].mon.hp).toBe(1 + Math.max(30, Math.floor(max / 2)));
    s.me[0].mon.hp = 1;
    s = tick(s, POTION_COOLDOWN_MS - 100, { potion: true }, rng);
    expect(s.potions).toBe(1);
    s = tick(s, 100, { potion: true }, rng);
    expect(s.potions).toBe(0);
  });
});

describe('실시간 전투: 승패', () => {
  it('트레이너전은 쓰러지면 다음 오디, 다 쓰러지면 이긴다', () => {
    const rng = createRng(9);
    let s = createRealtime('trainer', [{ speciesId: 1, level: 50 }], [{ speciesId: 2, level: 3 }, { speciesId: 1, level: 3 }]);
    s = freeze(s);
    s.foe[0].mon.hp = 1;
    s = tick(s, 16, { fast: true }, rng);
    expect(s.foeActive).toBe(1);
    expect(s.events.some((e) => e.t === 'send' && e.side === 'foe')).toBe(true);
    s = freeze(s);
    s.foe[1].mon.hp = 1;
    s = tick(s, FAST_COOLDOWN_MS, { fast: true }, rng);
    expect(s.result).toBe('won');
  });

  it('트레이너전에서 내 오디가 다 쓰러지면 진다', () => {
    const rng = createRng(10);
    let s = createRealtime('trainer', [{ speciesId: 1, level: 3 }, { speciesId: 4, level: 3 }], [{ speciesId: 2, level: 50 }]);
    for (let i = 0; i < 400 && !s.result; i += 1) s = tick(s, 100, {}, rng);
    expect(s.result).toBe('lost');
  });

  it('야생전은 1:1: 내 오디가 쓰러지면 (팀이 남아도) 야생 오디가 도망간다', () => {
    const rng = createRng(10);
    let s = createRealtime('wild', [{ speciesId: 1, level: 3 }, { speciesId: 4, level: 50 }], [{ speciesId: 2, level: 50 }]);
    for (let i = 0; i < 200 && !s.result; i += 1) s = tick(s, 100, {}, rng);
    expect(s.result).toBe('escaped');
    expect(s.myActive).toBe(0);
  });

  it('공정함: 레벨 5 스타터가 기본 공격 + 필살기 + 피하기로 같은 레벨 초원 야생을 이긴다', () => {
    for (const starter of [1, 42, 107]) {
      for (const wildId of [1, 2, 4, 5]) {
        const rng = createRng(starter * 100 + wildId);
        let s = createRealtime('wild', [{ speciesId: starter, level: 5 }], [{ speciesId: wildId, level: 5 }]);
        for (let i = 0; i < 2000 && !s.result; i += 1) {
          const me = activeOf(s, 'me');
          const input: RtInput = s.telegraph && s.telegraph.ms <= 300 ? { dodge: true }
            : me.energy >= energyCost(me.charged[0]) ? { charged: 0 } : { fast: true };
          s = tick(s, 50, input, rng);
        }
        expect(s.result, `starter ${starter} vs ${wildId}`).toBe('won');
      }
    }
  });
});
