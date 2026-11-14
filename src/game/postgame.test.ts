import { describe, expect, it } from 'vitest';
import { advanceQuests, makeQuest, parseQuests, questText } from './quests.ts';
import { canTransfer, catchCandy, deposit, levelCap, powerUp, powerUpBlock, powerUpCost, transfer, withdraw } from './candy.ts';
import { claimDaily, dailyDue, DAILY_REWARDS, daysBetween, localDay, parseDaily, setDayOffset, shinyBoost } from './daily.ts';
import { canRematch, isoWeek, raidBoss, raidOpen, rematchTrainer, RAID_HP, RAID_MS, REMATCH_LEVELS } from './postgame.ts';
import { newSave, parseSave, type SaveData } from './save.ts';
import { MAX_LEVEL } from './growth.ts';
import { biteDelay, fishSpot, reel, ROD_FLAG, BITE_MS, HOOK_MS } from '../overworld/fishing.ts';
import { rollWild, TRAINERS } from '../overworld/encounters.ts';
import { speciesById } from '../data/index.ts';
import { MAPS } from '../overworld/maps/index.ts';
import { OUTDOORS } from '../overworld/maps/index.ts';
import { kindOf } from '../overworld/tiles.ts';
import { tilesOf } from '../overworld/world.ts';
import { activeOf, createRealtime, energyCost, tick } from '../battle/realtime.ts';
import { createRng } from '../engine/rng.ts';
import { shinyChance } from './fun.ts';

const withTeam = (over: Partial<SaveData> = {}): SaveData => ({
  ...newSave('t', 0), team: [{ speciesId: 1, level: 10, exp: 0 }, { speciesId: 1, level: 5, exp: 0 }], coins: 5000, ...over,
});

describe('사탕과 강화', () => {
  it('잡으면 3개, 연속 잡기면 더', () => {
    expect(catchCandy(1)).toBe(3);
    expect(catchCandy(3)).toBe(5);
    expect(catchCandy(99)).toBe(6);
  });
  it('배지 수로 상한이 정해지고, 비용은 레벨이 높을수록 크다', () => {
    expect([0, 1, 2, 3, 4].map(levelCap)).toEqual([15, 22, 28, 34, 50]);
    expect(powerUpCost(30).candy).toBeGreaterThan(powerUpCost(5).candy);
    expect(powerUpCost(30).coins).toBeGreaterThan(powerUpCost(5).coins);
  });
  it('사탕과 코인을 써서 1레벨, 종 사탕이 모자라면 이상한 사탕', () => {
    const s = withTeam({ candy: { 1: 1 }, rareCandy: 1 });
    const up = powerUp(s, 'team', 0)!; // Lv10: 사탕 2개(종 1 + 이상한 1), 코인 200
    expect(up.team[0].level).toBe(11);
    expect(up.coins).toBe(5000 - 200);
    expect(up.candy).toBeUndefined();
    expect(up.rareCandy).toBeUndefined();
    expect(powerUp(up, 'team', 0)).toBeNull();
    expect(powerUpBlock(up, up.team[0])).toBe('candy');
    expect(parseSave(JSON.stringify(up))).toEqual(up);
  });
  it('배지 상한·최대 레벨·코인이 막는다', () => {
    const rich = { candy: { 1: 999 } };
    expect(powerUpBlock(withTeam(rich), { speciesId: 1, level: 15, exp: 0 })).toBe('cap');
    expect(powerUpBlock(withTeam({ ...rich, badges: ['meadow'] }), { speciesId: 1, level: 15, exp: 0 })).toBeNull();
    expect(powerUpBlock(withTeam({ ...rich, badges: ['a', 'b', 'c', 'd'] }), { speciesId: 1, level: MAX_LEVEL, exp: 0 })).toBe('max');
    expect(powerUpBlock(withTeam({ ...rich, coins: 0 }), { speciesId: 1, level: 5, exp: 0 })).toBe('coins');
  });
  it('박사에게 보내기: 같은 종이 더 있어야 하고 팀 마지막 한 마리는 안 된다', () => {
    const s = withTeam();
    expect(canTransfer(s, 'team', 1)).toBe(true);
    const t = transfer(s, 'team', 1)!;
    expect(t.team).toHaveLength(1);
    expect(t.candy?.[1]).toBe(1);
    expect(canTransfer(t, 'team', 0)).toBe(false);
    const solo = { ...t, box: [{ speciesId: 2, level: 3, exp: 0 }] };
    expect(canTransfer(solo, 'box', 0)).toBe(false); // 하나뿐인 종
  });
  it('박스와 팀을 옮기고 바꾼다', () => {
    const s = withTeam({ box: [{ speciesId: 7, level: 9, exp: 0 }] });
    const w = withdraw(s, 0)!;
    expect(w.team.map((o) => o.speciesId)).toEqual([1, 1, 7]);
    expect(w.box).toHaveLength(0);
    const d = deposit(w, 2)!;
    expect(d.box.map((o) => o.speciesId)).toEqual([7]);
    const full = { ...s, team: Array.from({ length: 6 }, (_, i) => ({ speciesId: i + 1, level: 5, exp: 0 })) };
    expect(withdraw(full, 0)).toBeNull();
    const sw = withdraw(full, 0, 2)!;
    expect(sw.team[2].speciesId).toBe(7);
    expect(sw.box[0].speciesId).toBe(3);
    expect(deposit({ ...s, team: [s.team[0]] }, 0)).toBeNull();
  });
});

describe('매일 보상', () => {
  it('날짜 계산과 연속, 하루 거르면 처음부터', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(dailyDue(undefined, '2026-11-14')).toBe(1);
    expect(dailyDue({ last: '2026-11-14', streak: 3 }, '2026-11-14')).toBeNull();
    expect(dailyDue({ last: '2026-11-14', streak: 3 }, '2026-11-13')).toBeNull();
    expect(dailyDue({ last: '2026-11-14', streak: 3 }, '2026-11-15')).toBe(4);
    expect(dailyDue({ last: '2026-11-14', streak: 3 }, '2026-11-16')).toBe(1);
    expect(dailyDue({ last: '2026-11-14', streak: 7 }, '2026-11-15')).toBe(1);
  });
  it('7일째는 튼튼한 로프 5개와 그날 반짝이 ×3', () => {
    let s = newSave('t', 0);
    const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'];
    for (const [i, d] of days.entries()) {
      const c = claimDaily(s, d)!;
      expect(c.day).toBe(i + 1);
      expect(claimDaily(c.save, d)).toBeNull();
      s = c.save;
    }
    expect(DAILY_REWARDS[6].sturdy).toBe(5);
    expect(shinyBoost(s, '2026-11-16')).toBe(3);
    expect(shinyBoost(s, '2026-11-17')).toBe(1);
    expect(shinyChance(0, 3)).toBeCloseTo(shinyChance(0) * 3);
    expect(parseDaily(JSON.parse(JSON.stringify(s.daily)))).toEqual(s.daily);
    expect(parseDaily({ last: 'nope', streak: 2 })).toBeUndefined();
  });
  it('개발용 날짜 밀기', () => {
    const now = new Date(2026, 10, 30, 12);
    expect(localDay(now)).toBe('2026-11-30');
    setDayOffset(1);
    expect(localDay(now)).toBe('2026-12-01');
    setDayOffset(0);
  });
});

describe('낚시', () => {
  it('낚싯대가 있고 물을 바라봐야 던진다', () => {
    const town = MAPS.town; // 연못 (18~23, 11~14)
    expect(fishSpot(town, { map: 'town', x: 19, y: 15, facing: 'up' }, [ROD_FLAG])).toEqual({ x: 19, y: 14 });
    expect(fishSpot(town, { map: 'town', x: 19, y: 15, facing: 'up' }, [])).toBeNull();
    expect(fishSpot(town, { map: 'town', x: 19, y: 15, facing: 'down' }, [ROD_FLAG])).toBeNull();
  });
  it('입질 1~4초, 0.8초 안에 당겨야 걸린다', () => {
    expect(biteDelay(() => 0)).toBe(BITE_MS[0]);
    expect(biteDelay(() => 0.9999)).toBeLessThanOrEqual(BITE_MS[1]);
    expect(reel(2000, 1500)).toBe('early');
    expect(reel(2000, 2000 + HOOK_MS)).toBe('hooked');
    expect(reel(2000, 2001 + HOOK_MS)).toBe('late');
  });
  it('낚이는 오디는 늘 물 타입, 레벨은 야생 규칙', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i += 1) {
      const r = rollWild('desert', rng.next, { lead: 12, water: true });
      expect(speciesById(r.speciesId).types).toContain('water');
      expect(r.level).toBeGreaterThanOrEqual(10);
    }
  });
  it('물이 있는 구역마다 낚을 물이 있다(화산은 용암뿐)', () => {
    const regions = new Set(OUTDOORS.filter((m) => tilesOf(m).some((row) => row.some((t) => kindOf(t) === 'water'))).map((m) => m.region));
    expect([...regions].sort()).toEqual(['desert', 'meadow', 'snow']);
  });
});

describe('재도전과 레이드', () => {
  const today = '2026-11-14';
  it('챔피언을 이긴 뒤 관장마다 하루 한 번', () => {
    const s = newSave('t', 0);
    expect(canRematch(s, 'leader-meadow', today)).toBe(false);
    const champ = { ...s, flags: ['champion'] };
    expect(canRematch(champ, 'leader-meadow', today)).toBe(true);
    expect(canRematch(champ, 'route1-kid', today)).toBe(false);
    const done = { ...champ, rematch: { 'leader-meadow': today } };
    expect(canRematch(done, 'leader-meadow', today)).toBe(false);
    expect(canRematch(done, 'leader-desert', today)).toBe(true);
    expect(canRematch(done, 'leader-meadow', '2026-11-15')).toBe(true);
    const r = rematchTrainer('leader-volcano')!;
    expect(r.team.map((m) => m.level)).toEqual(TRAINERS['leader-volcano'].team.map((m) => m.level + REMATCH_LEVELS));
    expect(r.reward).toBeGreaterThan(TRAINERS['leader-volcano'].reward);
  });
  it('레이드 보스는 ISO 주마다 같고 전설 등급', () => {
    expect(isoWeek('2026-11-14')).toBe('2026-W46');
    expect(isoWeek('2026-11-09')).toBe('2026-W46'); // 월요일
    expect(isoWeek('2026-11-16')).toBe('2026-W47');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(raidBoss(isoWeek('2026-11-09'))).toEqual(raidBoss(isoWeek('2026-11-15')));
    const bosses = new Set(Array.from({ length: 20 }, (_, i) => raidBoss(`2027-W${String(i + 1).padStart(2, '0')}`).speciesId));
    expect(bosses.size).toBeGreaterThan(3);
    for (const id of bosses) expect(speciesById(id).rarity).toBe('Legendary');
    const champ = { ...newSave('t', 0), flags: ['champion'] };
    expect(raidOpen(champ, '2026-W46')).toBe(true);
    expect(raidOpen({ ...champ, raid: { week: '2026-W46' } }, '2026-W46')).toBe(false);
    expect(raidOpen(newSave('t', 0), '2026-W46')).toBe(false);
  });
  it('레이드: 보스 체력 5배, 3분 안에 못 이기면 진다', () => {
    const s = createRealtime('trainer', [{ speciesId: 1, level: 5 }], [{ speciesId: 51, level: 40 }], 0, 'trainer', { foeHp: RAID_HP, timeMs: RAID_MS });
    const plain = createRealtime('trainer', [{ speciesId: 1, level: 5 }], [{ speciesId: 51, level: 40 }]);
    expect(s.foe[0].mon.stats.hp).toBe(Math.round(plain.foe[0].mon.stats.hp * RAID_HP));
    expect(s.foe[0].mon.hp).toBe(s.foe[0].mon.stats.hp);
    const end = tick({ ...s, timeLeft: 10 }, 20, {}, createRng(1));
    expect(end.result).toBe('lost');
  });
  it('레이드: 강하게 키운 세 마리면 3분 안에 이길 수 있다', () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const week = `2026-W${String(40 + seed).padStart(2, '0')}`;
      const boss = raidBoss(week);
      const rng = createRng(seed);
      let s = createRealtime('trainer', [{ speciesId: 51, level: 48 }, { speciesId: 121, level: 48 }, { speciesId: 141, level: 48 }],
        [boss], 0, 'trainer', { foeHp: RAID_HP, timeMs: RAID_MS, switchMs: 500 });
      for (let t = 0; t < RAID_MS + 1000 && !s.result; t += 50) {
        const me = activeOf(s, 'me');
        const ready = me.charged.findIndex((m) => me.energy >= energyCost(m));
        s = tick(s, 50, { fast: true, ...(ready >= 0 ? { charged: ready } : {}), ...(s.telegraph && s.telegraph.ms < 400 ? { dodge: true } : {}) }, rng);
        if (!s.result && activeOf(s, 'me').mon.hp <= 0) {
          const next = s.me.findIndex((f) => f.mon.hp > 0);
          if (next >= 0) s = tick(s, 0, { switchTo: next }, rng);
        }
      }
      if (s.result === 'won') wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  });
});

describe('새 퀘스트: 낚시·강화', () => {
  const ctx = { region: 'meadow' as const, trainersLeft: 0, itemsLeft: 0 };
  it('낚싯대가 없으면 낚시 퀘스트는 안 나온다', () => {
    for (let i = 0; i < 20; i += 1) expect(makeQuest(i, ctx, () => i / 20).kind).not.toBe('fish');
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => makeQuest(i, { ...ctx, hasRod: true }, () => i / 40).kind));
    expect(kinds.has('fish')).toBe(true);
    expect(kinds.has('powerUp')).toBe(true);
  });
  it('낚시 2번, 강화 1번으로 끝난다', () => {
    const reward = { coins: 1, basic: 0, sturdy: 0, potions: 0 };
    const state = { list: [{ id: 1, kind: 'fish' as const, goal: 2, progress: 0, reward }, { id: 2, kind: 'powerUp' as const, goal: 1, progress: 0, reward }], next: 3, done: 0 };
    const c = { ...ctx, hasRod: true };
    const a = advanceQuests(state, { kind: 'fish' }, c, () => 0.5);
    expect(a.completed).toHaveLength(0);
    const b = advanceQuests(a.state, { kind: 'fish' }, c, () => 0.5);
    expect(b.completed.map((q) => q.kind)).toEqual(['fish']);
    expect(advanceQuests(b.state, { kind: 'powerUp' }, c, () => 0.5).completed.map((q) => q.kind)).toEqual(['powerUp']);
    expect(questText({ kind: 'fish', goal: 2 })).toBe('낚시로 오디 2번 낚기');
    expect(parseQuests(JSON.parse(JSON.stringify(b.state)))).toEqual(b.state);
  });
});
