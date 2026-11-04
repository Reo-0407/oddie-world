import { describe, expect, it } from 'vitest';
import { MOVES, SPECIES, speciesById } from '../data/index.ts';
import { describeEffect, describeEffects, moveDetail, moveSummary } from '../ui/moveText.ts';
import { catchChance, fieldCatchChance, ropeSequence } from './capture.ts';
import { createBattle, createBattlePokemon } from './factory.ts';
import { settleBattle } from './rewards.ts';
import { autoSkirmish } from './skirmish.ts';
import { battleOutcome, tutorialHint, tutorialWildLevel, TUTORIAL_HP_RATIO, withHpRatio } from './tutorial.ts';

const make = (id: number, level: number) => createBattlePokemon(speciesById(id), level, MOVES);

describe('로프 흔들림', () => {
  it('forceSuccess는 항상 3번 흔들리고 성공', () => {
    expect(ropeSequence(0, () => 0.99, true)).toEqual({ shakes: 3, success: true });
  });
  it('매번 버티면 성공, 중간에 못 버티면 그 흔들림에서 풀려난다', () => {
    expect(ropeSequence(0.5, () => 0)).toEqual({ shakes: 3, success: true });
    expect(ropeSequence(0.5, () => 0.99)).toEqual({ shakes: 1, success: false });
    const rolls = [0, 0, 0.99];
    expect(ropeSequence(0.5, () => rolls.shift() ?? 0)).toEqual({ shakes: 3, success: false });
    const second = [0, 0.99];
    expect(ropeSequence(0.5, () => second.shift() ?? 0)).toEqual({ shakes: 2, success: false });
  });
  it('전체 성공 확률이 chance와 거의 같다', () => {
    let seed = 7;
    const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    let wins = 0;
    for (let i = 0; i < 4000; i += 1) if (ropeSequence(0.3, rng).success) wins += 1;
    expect(wins / 4000).toBeGreaterThan(0.26);
    expect(wins / 4000).toBeLessThan(0.34);
  });
  it('필드 던지기는 확률이 절반', () => {
    expect(fieldCatchChance('Common', 1, null, 'basic')).toBeCloseTo(catchChance('Common', 1, null, 'basic') / 2);
  });
});

describe('튜토리얼', () => {
  it('야생 레벨은 팀 레벨-4, 최소 3', () => {
    expect(tutorialWildLevel(10)).toBe(6);
    expect(tutorialWildLevel(5)).toBe(3);
  });
  it('시작 체력 35%, 최소 1', () => {
    const wild = make(1, 6);
    const hurt = withHpRatio(wild, TUTORIAL_HP_RATIO);
    expect(hurt.hp).toBe(Math.round(wild.stats.hp * 0.35));
    expect(wild.hp).toBe(wild.stats.hp);
    expect(withHpRatio(wild, 0).hp).toBe(1);
  });
  it('안내 문구가 단계별로 바뀐다', () => {
    expect(tutorialHint(0)).toBe('기술을 골라 공격해 봐!');
    expect(tutorialHint(1)).toContain('로프');
  });
  it('승패 판정', () => {
    const base = createBattle([make(1, 10)], [make(2, 6)], 1);
    expect(battleOutcome(base, false)).toBeNull();
    expect(battleOutcome({ ...base, winner: 0 }, false)).toBe('won');
    expect(battleOutcome({ ...base, winner: 1 }, false)).toBe('lost');
    expect(battleOutcome(base, true)).toBe('caught');
  });
  it('튜토리얼 승리 정산: 경험치·코인 지급', () => {
    const report = settleBattle({
      outcome: 'won', team: [{ speciesId: 1, level: 10, exp: 0 }], box: [], alive: [true], wildSpeciesId: 2, wildLevel: 6,
    });
    expect(report.exp).toBeGreaterThan(0);
    expect(report.coins).toBeGreaterThan(0);
  });
});

describe('출동 자동 전투', () => {
  it('같은 시드면 같은 결과, 입력은 바뀌지 않는다', () => {
    const me = make(42, 10);
    const wild = make(2, 10);
    const a = autoSkirmish(me, wild, 123);
    const b = autoSkirmish(me, wild, 123);
    expect(a).toEqual(b);
    expect(me.hp).toBe(me.stats.hp);
    expect(wild.hp).toBe(wild.stats.hp);
  });
  it('4턴 안에 끝나고 체력 비율은 0~1', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const r = autoSkirmish(make(1, 10), make(3, 10), seed);
      expect(r.wildHpRatio).toBeGreaterThanOrEqual(0);
      expect(r.wildHpRatio).toBeLessThanOrEqual(1);
      expect(r.playerHpRatio).toBeGreaterThanOrEqual(0);
      expect(r.wildFainted).toBe(r.wildHpRatio === 0);
      expect(r.playerFainted).toBe(r.playerHpRatio === 0);
      expect(r.log.length).toBeGreaterThan(0);
    }
  });
  it('훨씬 약한 야생 오디는 쓰러지고, 훨씬 강한 야생 오디에게는 내가 쓰러질 수 있다', () => {
    const weak = withHpRatio(make(2, 3), 0.2);
    expect(autoSkirmish(make(42, 30), weak, 5).wildFainted).toBe(true);
    const outcomes = Array.from({ length: 10 }, (_, i) => autoSkirmish(make(2, 3), make(42, 40), i + 1));
    expect(outcomes.some((r) => r.playerFainted)).toBe(true);
  });
  it('남은 체력이 있으면 야생 체력 비율을 돌려준다', () => {
    const r = autoSkirmish(make(1, 5), make(3, 25), 9, 1);
    expect(r.wildFainted).toBe(false);
    expect(r.wildHpRatio).toBeGreaterThan(0);
  });
});

describe('기술 설명', () => {
  it('데이터의 모든 기술 효과 코드가 설명을 가진다', () => {
    const signatureIds = new Set(SPECIES.map((s) => s.signatureMoveId));
    expect(signatureIds.size).toBeGreaterThan(100);
    for (const move of Object.values(MOVES)) {
      for (const effect of move.effects) {
        const text = describeEffect(effect);
        expect(text, `${move.name}: ${effect.kind}`).toBeTruthy();
        expect(text).not.toContain('undefined');
        expect(text).not.toContain('NaN');
      }
    }
    for (const id of signatureIds) {
      const move = MOVES[id];
      expect(move, `고유 기술 ${id}`).toBeDefined();
      expect(moveSummary(move).length).toBeGreaterThan(0);
      expect(moveDetail(move).length).toBeGreaterThan(0);
    }
  });
  it('대표 설명 확인', () => {
    expect(describeEffect({ kind: 'status', status: 'burn', chance: 10 })).toBe('10% 확률로 화상 상태');
    expect(describeEffect({ kind: 'stage', target: 'foe', stat: 'spe', delta: -1, chance: 50 })).toContain('상대 속도');
    expect(describeEffects(MOVES[1001])).toHaveLength(1);
    expect(moveSummary({ ...MOVES[1001], effects: [] })).toBe('추가 효과 없음');
  });
});
