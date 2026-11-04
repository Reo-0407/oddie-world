import { describe, expect, it } from 'vitest';
import { catchChance, MAX_CATCH_CHANCE, tryCatch } from './capture.ts';
import { applyExp, coinReward, expToNext, gainExp, MAX_LEVEL } from './growth.ts';
import { addCaught, highestLevel, MAX_TEAM, type OwnedOddie } from './owned.ts';
import { grantExp, settleBattle } from './rewards.ts';

describe('포획 확률', () => {
  it('만피 기본 로프는 등급별 포획률 그대로', () => {
    expect(catchChance('Common', 1, null, 'basic')).toBeCloseTo(0.6);
    expect(catchChance('Rare', 1, null, 'basic')).toBeCloseTo(0.45);
    expect(catchChance('Epic', 1, null, 'basic')).toBeCloseTo(0.3);
    expect(catchChance('Legendary', 1, null, 'basic')).toBeCloseTo(0.15);
    expect(catchChance('Secret', 1, null, 'basic')).toBeCloseTo(0.08);
    expect(catchChance('???', 1, null, 'basic')).toBeCloseTo(0.04);
  });
  it('체력이 낮을수록, 상태이상일수록, 튼튼한 로프일수록 올라간다', () => {
    expect(catchChance('Epic', 0.5, null, 'basic')).toBeCloseTo(0.45);
    expect(catchChance('Epic', 1, 'sleep', 'basic')).toBeCloseTo(0.39);
    expect(catchChance('Epic', 1, null, 'sturdy')).toBeCloseTo(0.54);
    expect(catchChance('Epic', 0.5, 'paralysis', 'sturdy')).toBe(MAX_CATCH_CHANCE);
  });
  it('상한은 0.95, 체력 비율은 0~1로 보정', () => {
    expect(catchChance('Common', 0, 'sleep', 'sturdy')).toBe(MAX_CATCH_CHANCE);
    expect(catchChance('Epic', 5, null, 'basic')).toBeCloseTo(0.3);
    expect(catchChance('Epic', -1, null, 'basic')).toBeCloseTo(0.6);
  });
  it('rng가 확률보다 작을 때만 성공', () => {
    expect(tryCatch('Common', 1, null, 'basic', () => 0.59).success).toBe(true);
    expect(tryCatch('Common', 1, null, 'basic', () => 0.6).success).toBe(false);
    expect(tryCatch('Common', 1, null, 'basic', () => 0).chance).toBeCloseTo(0.6);
  });
});

describe('성장', () => {
  it('필요 경험치는 레벨이 오를수록 늘어난다', () => {
    expect(expToNext(10)).toBe(130);
    expect(expToNext(11)).toBeGreaterThan(expToNext(10));
  });
  it('경험치와 코인은 등급이 높을수록 많다', () => {
    expect(gainExp(10, 'Common')).toBe(90);
    expect(gainExp(10, 'Legendary')).toBeGreaterThan(gainExp(10, 'Rare'));
    expect(coinReward(10, 'Common')).toBe(40);
  });
  it('레벨업과 새 기술(예전 레벨 초과, 새 레벨 이하)', () => {
    const learnset = [{ level: 1, moveId: 1 }, { level: 11, moveId: 2 }, { level: 12, moveId: 3 }, { level: 30, moveId: 4 }];
    expect(applyExp(10, 0, 100, learnset)).toEqual({ level: 10, exp: 100, newMoveIds: [] });
    expect(applyExp(10, 100, 40, learnset)).toEqual({ level: 11, exp: 10, newMoveIds: [2] });
    const multi = applyExp(10, 0, 130 + expToNext(11) + 5, learnset);
    expect(multi).toEqual({ level: 12, exp: 5, newMoveIds: [2, 3] });
  });
  it('최대 레벨을 넘지 않는다', () => {
    expect(applyExp(MAX_LEVEL, 0, 99999, []).level).toBe(MAX_LEVEL);
    expect(applyExp(MAX_LEVEL - 1, 0, 99999, []).level).toBe(MAX_LEVEL);
  });
});

describe('팀과 박스', () => {
  const mk = (level: number): OwnedOddie => ({ speciesId: 1, level, exp: 0 });
  it('6마리까지 팀, 넘치면 박스', () => {
    let team: OwnedOddie[] = [];
    let box: OwnedOddie[] = [];
    for (let i = 0; i < MAX_TEAM; i += 1) ({ team, box } = addCaught(team, box, mk(5)));
    expect(team).toHaveLength(6);
    const next = addCaught(team, box, mk(7));
    expect(next.team).toHaveLength(6);
    expect(next.box).toHaveLength(1);
    expect(next.toBox).toBe(true);
  });
  it('최고 레벨', () => {
    expect(highestLevel([mk(5), mk(9)])).toBe(9);
    expect(highestLevel([], 10)).toBe(10);
  });
});

describe('전투 정산', () => {
  const team: OwnedOddie[] = [{ speciesId: 1, level: 10, exp: 100 }, { speciesId: 2, level: 10, exp: 0 }];
  it('이기면 살아 있는 오디만 경험치, 코인 지급', () => {
    const report = settleBattle({ outcome: 'won', team, box: [], alive: [true, false], wildSpeciesId: 1, wildLevel: 10 });
    expect(report.exp).toBe(90);
    expect(report.coins).toBe(40);
    expect(report.team[0]).toMatchObject({ level: 11, exp: 60 });
    expect(report.team[1]).toEqual(team[1]);
    expect(report.levelUps).toHaveLength(1);
    expect(report.levelUps[0]).toMatchObject({ from: 10, to: 11 });
    expect(team[0].level).toBe(10); // 원본은 바뀌지 않는다
  });
  it('지면 아무것도 받지 않는다', () => {
    const report = settleBattle({ outcome: 'lost', team, box: [], alive: [false, false], wildSpeciesId: 1, wildLevel: 10 });
    expect(report.exp).toBe(0);
    expect(report.coins).toBe(0);
    expect(report.team).toEqual(team);
  });
  it('잡으면 팀에 추가', () => {
    const report = settleBattle({ outcome: 'caught', team, box: [], alive: [true, true], wildSpeciesId: 3, wildLevel: 9 });
    expect(report.team).toHaveLength(3);
    expect(report.team[2]).toEqual({ speciesId: 3, level: 9, exp: 0 });
    expect(report.caught?.toBox).toBe(false);
  });
});

describe('전투 밖 경험치', () => {
  it('선두 오디만 경험치를 받고 레벨업을 알려 준다', () => {
    const team: OwnedOddie[] = [{ speciesId: 1, level: 10, exp: 100 }, { speciesId: 2, level: 10, exp: 0 }];
    const result = grantExp(team, 0, 40);
    expect(result.team[0]).toMatchObject({ level: 11, exp: 10 });
    expect(result.team[1]).toEqual(team[1]);
    expect(result.levelUp).toMatchObject({ from: 10, to: 11 });
    expect(grantExp(team, 5, 40).team).toBe(team);
    expect(grantExp(team, 1, 5).levelUp).toBeNull();
  });
});
