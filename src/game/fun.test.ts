import { describe, expect, it } from 'vitest';
import { dayPhase, skyTint, timeWeight } from './daytime.ts';
import { comboBonus, levelTag, nextCombo, nurseGivesRopes, rollShiny, shinyChance, SHINY_ODDS } from './fun.ts';
import { advanceQuests, fillQuests, makeQuest, parseQuests, questText, QUEST_SLOTS, type QuestCtx } from './quests.ts';
import { markShiny, cleanDex, mergeDex } from './dex.ts';
import { newSave, parseSave } from './save.ts';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('반짝이 오디', () => {
  it('기본 1/64, 연속 잡기마다 10%씩 올라 최대 두 배', () => {
    expect(shinyChance()).toBe(SHINY_ODDS);
    expect(shinyChance(3)).toBeCloseTo(SHINY_ODDS * 1.3);
    expect(shinyChance(50)).toBeCloseTo(SHINY_ODDS * 2);
    expect(rollShiny(() => SHINY_ODDS - 0.0001)).toBe(true);
    expect(rollShiny(() => SHINY_ODDS)).toBe(false);
  });
  it('도감에 반짝이로 잡은 종을 적고, 합치기·정리에서도 남는다', () => {
    const dex = markShiny({ seen: [], caught: [] }, 7);
    expect(dex).toEqual({ seen: [7], caught: [7], shinyCaught: [7] });
    expect(markShiny(dex, 7)).toBe(dex);
    expect(mergeDex(dex, { seen: [2], caught: [2], shinyCaught: [2] }).shinyCaught).toEqual([2, 7]);
    expect(cleanDex({ seen: [], caught: [7], shinyCaught: [7, 9, 'x'] })).toEqual({ seen: [7], caught: [7], shinyCaught: [7] });
    expect(cleanDex({ seen: [1], caught: [1] })).toEqual({ seen: [1], caught: [1] });
  });
  it('저장: shiny는 true일 때만 남고 옛 저장도 그대로 읽힌다', () => {
    const save = { ...newSave('준', 0), team: [{ speciesId: 3, level: 5, exp: 0, shiny: true }, { speciesId: 4, level: 5, exp: 0, shiny: 'yes' }] };
    const back = parseSave(JSON.stringify(save))!;
    expect(back.team[0].shiny).toBe(true);
    expect(back.team[1]).not.toHaveProperty('shiny');
  });
});

describe('잡기 연속 보너스', () => {
  it('같은 종이면 이어지고 다른 종이면 1부터', () => {
    let c = nextCombo(undefined, 5);
    expect(c).toEqual({ speciesId: 5, count: 1 });
    c = nextCombo(c, 5);
    c = nextCombo(c, 5);
    expect(c.count).toBe(3);
    expect(nextCombo(c, 6)).toEqual({ speciesId: 6, count: 1 });
  });
  it('2연속부터 코인·경험치 보너스, 상한 있음', () => {
    expect(comboBonus(1)).toBeNull();
    expect(comboBonus(2)).toEqual({ coins: 15, exp: 8 });
    expect(comboBonus(100)).toEqual(comboBonus(10));
  });
});

describe('필드 레벨 표', () => {
  it('3 이상 높으면 빨강, ±2 노랑, 더 낮으면 초록', () => {
    expect(levelTag(13, 10)).toBe('red');
    expect(levelTag(12, 10)).toBe('yellow');
    expect(levelTag(8, 10)).toBe('yellow');
    expect(levelTag(7, 10)).toBe('green');
  });
});

describe('오디 센터 무료 로프', () => {
  it('로프가 하나도 없을 때 방문마다 한 번만', () => {
    expect(nurseGivesRopes({ basic: 0, sturdy: 0 }, false)).toBe(true);
    expect(nurseGivesRopes({ basic: 0, sturdy: 0 }, true)).toBe(false);
    expect(nurseGivesRopes({ basic: 0, sturdy: 1 }, false)).toBe(false);
  });
});

describe('낮과 밤', () => {
  it('시각별 단계', () => {
    expect(dayPhase(6)).toBe('dawn');
    expect(dayPhase(12)).toBe('day');
    expect(dayPhase(18)).toBe('dusk');
    expect(dayPhase(22)).toBe('night');
    expect(dayPhase(2)).toBe('night');
  });
  it('색은 낮엔 없고 밤엔 짙은 파랑, 사이는 부드럽게', () => {
    expect(skyTint(12).a).toBe(0);
    expect(skyTint(23).a).toBeGreaterThan(0.3);
    expect(skyTint(23).b).toBeGreaterThan(skyTint(23).r);
    const a = skyTint(18.9).a;
    const b = skyTint(19).a;
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });
  it('밤엔 고스트·악 ×2, 낮엔 ×0.5, 다른 타입은 그대로', () => {
    expect(timeWeight(['ghost'], 'night')).toBe(2);
    expect(timeWeight(['fire', 'dark'], 'day')).toBe(0.5);
    expect(timeWeight(['ghost'], 'dusk')).toBe(1);
    expect(timeWeight(['grass'], 'night')).toBe(1);
  });
});

describe('퀘스트 게시판', () => {
  const ctx: QuestCtx = { region: 'meadow', trainersLeft: 10, itemsLeft: 10 };
  it('늘 3개, 종류가 겹치지 않는다', () => {
    const s = fillQuests(undefined, ctx, seq([0.1, 0.5, 0.9, 0.3]));
    expect(s.list.length).toBe(QUEST_SLOTS);
    expect(new Set(s.list.map((q) => q.kind)).size).toBe(QUEST_SLOTS);
    expect(fillQuests(s, ctx, Math.random)).toBe(s);
  });
  it('뒤 구역일수록 목표와 보상이 크다', () => {
    const a = makeQuest(1, ctx, () => 0.4, []);
    const b = makeQuest(1, { ...ctx, region: 'volcano' }, () => 0.4, []);
    expect(a.kind).toBe(b.kind);
    expect(b.goal).toBeGreaterThanOrEqual(a.goal);
    expect(b.reward.coins).toBeGreaterThan(a.reward.coins);
  });
  it('남은 트레이너·숨은 물건이 없으면 그 퀘스트는 안 나오고, 있던 것도 바뀐다', () => {
    const none = { ...ctx, trainersLeft: 0, itemsLeft: 0 };
    for (let i = 0; i < 20; i += 1) {
      const q = makeQuest(i, none, () => i / 20, []);
      expect(['beatTrainer', 'findItem']).not.toContain(q.kind);
    }
    const s = { list: [{ id: 1, kind: 'findItem' as const, goal: 1, progress: 0, reward: { coins: 1, basic: 0, sturdy: 0, potions: 0 } }], next: 2, done: 0 };
    expect(fillQuests(s, none, () => 0.5).list.some((q) => q.kind === 'findItem')).toBe(false);
  });
  it('진행: 맞는 일만 올리고, 다 하면 완료로 돌려주고 새 퀘스트로 바꾼다', () => {
    const reward = { coins: 100, basic: 2, sturdy: 0, potions: 0 };
    const s = {
      list: [
        { id: 1, kind: 'catchType' as const, type: 'grass' as const, goal: 2, progress: 1, reward },
        { id: 2, kind: 'winWild' as const, goal: 5, progress: 0, reward },
        { id: 3, kind: 'excellent' as const, goal: 2, progress: 0, reward },
      ], next: 4, done: 0,
    };
    const fire = advanceQuests(s, { kind: 'catch', types: ['fire'] }, ctx, () => 0.5);
    expect(fire.completed).toEqual([]);
    expect(fire.state).toBe(s);
    const grass = advanceQuests(s, { kind: 'catch', types: ['grass', 'bug'] }, ctx, () => 0.5);
    expect(grass.completed.map((q) => q.id)).toEqual([1]);
    expect(grass.state.list.length).toBe(3);
    expect(grass.state.list.some((q) => q.id === 4)).toBe(true);
    expect(grass.state.done).toBe(1);
    const ex = advanceQuests(s, { kind: 'excellent', n: 2 }, ctx, () => 0.5);
    expect(ex.completed.map((q) => q.id)).toEqual([3]);
    const win = advanceQuests(s, { kind: 'winWild' }, ctx, () => 0.5);
    expect(win.state.list.find((q) => q.id === 2)?.progress).toBe(1);
  });
  it('글과 저장 정리', () => {
    expect(questText({ kind: 'catchType', type: 'grass', goal: 3 })).toBe('풀 타입 오디 3마리 잡기');
    expect(questText({ kind: 'excellent', goal: 2 })).toBe('Excellent 던지기 2번');
    const s = fillQuests(undefined, ctx, seq([0.2, 0.6, 0.95]));
    expect(parseQuests(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseQuests('x')).toBeUndefined();
    expect(parseQuests({ list: [{ id: 1, kind: 'hack', goal: 1, progress: 0 }], next: 1, done: 0 })?.list).toEqual([]);
    const save = { ...newSave('준', 0), quests: s, combo: { speciesId: 3, count: 2 } };
    const back = parseSave(JSON.stringify(save))!;
    expect(back.quests).toEqual(s);
    expect(back.combo).toEqual({ speciesId: 3, count: 2 });
  });
});
