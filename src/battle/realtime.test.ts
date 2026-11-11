import { describe, expect, it } from 'vitest';
import { createRng } from '../engine/rng.ts';
import {
  DODGE_MS, FAST_COOLDOWN_MS, FAST_ENERGY, SWITCH_COOLDOWN_MS, TELEGRAPH_MS,
  activeOf, createRealtime, energyCost, foeInterval, makeFighter, tick, type RtInput, type RtState,
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
  it('상대 간격은 속도로 1.0~2.0초', () => {
    const slow = makeFighter(1, 5).mon;
    const fast = makeFighter(1, 60).mon;
    expect(foeInterval(slow, fast)).toBe(1000);
    expect(foeInterval(fast, slow)).toBe(2000);
    expect(foeInterval(slow, slow)).toBe(1500);
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

  it('내 오디가 다 쓰러지면 진다', () => {
    const rng = createRng(10);
    let s = createRealtime('wild', [{ speciesId: 1, level: 3 }], [{ speciesId: 2, level: 50 }]);
    for (let i = 0; i < 200 && !s.result; i += 1) s = tick(s, 100, {}, rng);
    expect(s.result).toBe('lost');
  });

  it('공정함: 레벨 5 스타터가 기본 공격 + 필살기로 초원 야생(레벨 6)을 이긴다', () => {
    for (const starter of [1, 42, 107]) {
      for (const wildId of [1, 2, 4, 5]) {
        const rng = createRng(starter * 100 + wildId);
        let s = createRealtime('wild', [{ speciesId: starter, level: 5 }], [{ speciesId: wildId, level: 6 }]);
        for (let i = 0; i < 2000 && !s.result; i += 1) {
          const me = activeOf(s, 'me');
          const input: RtInput = me.energy >= energyCost(me.charged[0]) ? { charged: 0 } : { fast: true };
          s = tick(s, 50, input, rng);
        }
        expect(s.result, `starter ${starter} vs ${wildId}`).toBe('won');
      }
    }
  });
});
