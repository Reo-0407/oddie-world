import { describe, expect, it } from 'vitest';
import { newSave } from '../game/save.ts';
import { questsAfter, settleCatch, settleLoss, settleWin } from './outcome.ts';

const base = () => ({ ...newSave('준', 0), team: [{ speciesId: 1, level: 5, exp: 0 }], coins: 101 });

describe('전투 정산', () => {
  it('야생 승리: 경험치와 코인', () => {
    const r = settleWin(base(), [true], [{ speciesId: 2, level: 5 }]);
    expect(r.save.coins).toBeGreaterThan(101);
    expect(r.save.beaten).toEqual([]);
  });
  it('트레이너 승리: beaten에 적고 보상 코인만', () => {
    const r = settleWin(base(), [true], [{ speciesId: 2, level: 5 }, { speciesId: 1, level: 7 }], { id: 'route1-kid', reward: 120 });
    expect(r.save.coins).toBe(221);
    expect(r.save.beaten).toEqual(['route1-kid']);
    expect(settleWin(r.save, [true], [], { id: 'route1-kid', reward: 0 }).save.beaten).toEqual(['route1-kid']);
  });
  it('잡기: 팀에 넣고 도감에 적는다', () => {
    const r = settleCatch(base(), { speciesId: 2, level: 4 }, { basic: 3, sturdy: 0 });
    expect(r.save.team.map((o) => o.speciesId)).toEqual([1, 2]);
    expect(r.save.dex.caught).toContain(2);
    expect(r.save.ropes).toEqual({ basic: 3, sturdy: 0 });
  });
  it('잡기: 5종째면 도감 보상', () => {
    const s = { ...base(), dex: { seen: [1, 3, 4, 5], caught: [1, 3, 4, 5] } };
    const r = settleCatch(s, { speciesId: 2, level: 4 }, { basic: 0, sturdy: 0 });
    expect(r.save.coins).toBe(101 + 150);
    expect(r.save.ropes).toEqual({ basic: 3, sturdy: 1 });
    expect(r.lines.some((l) => l.includes('도감 5종'))).toBe(true);
  });
  it('야생 승리 문구: 무엇을 쓰러뜨렸고 경험치를 얼마 받았는지가 먼저, 레벨 업은 그다음', () => {
    const r = settleWin({ ...base(), team: [{ speciesId: 1, level: 5, exp: 0 }] }, [true], [{ speciesId: 2, level: 30 }]);
    expect(r.lines[0]).toMatch(/^.+을\(를\) 쓰러뜨렸다! 경험치 \+\d+/);
    expect(r.lines[1]).toMatch(/레벨이 \d+\(으\)로 올랐다/);
  });
  it('경험치는 이길 때 한 번만: 잡기는 기존 오디의 경험치를 바꾸지 않고, 진 쪽은 경험치가 없다', () => {
    const won = settleWin(base(), [true], [{ speciesId: 2, level: 5 }]);
    const lead = won.save.team[0];
    expect(lead.exp + lead.level).toBeGreaterThan(5);
    const caught = settleCatch(won.save, { speciesId: 2, level: 5 }, { basic: 1, sturdy: 0 });
    expect(caught.save.team[0]).toEqual(lead);
    const lost = settleLoss(base());
    expect(lost.save.team).toEqual(base().team);
  });
  it('강한 야생 오디는 경험치·코인 1.5배', () => {
    const plain = settleWin(base(), [true], [{ speciesId: 2, level: 10 }]);
    const strong = settleWin(base(), [true], [{ speciesId: 2, level: 10, strong: true }]);
    expect(strong.save.coins - 101).toBe(Math.round((plain.save.coins - 101) * 1.5));
  });
  it('반짝이·새로 등록·연속 잡기', () => {
    const r = settleCatch(base(), { speciesId: 2, level: 4, shiny: true }, { basic: 3, sturdy: 0 });
    expect(r.isNew).toBe(true);
    expect(r.save.team[1].shiny).toBe(true);
    expect(r.save.dex.shinyCaught).toEqual([2]);
    expect(r.lines[0]).toContain('도감에 새로 등록');
    const again = settleCatch(r.save, { speciesId: 2, level: 4 }, { basic: 2, sturdy: 0 });
    expect(again.isNew).toBe(false);
    expect(again.combo).toBe(2);
    expect(again.save.coins).toBeGreaterThan(r.save.coins);
    expect(again.lines.some((l) => l.includes('2연속'))).toBe(true);
  });
  it('퀘스트: 완료하면 보상과 "퀘스트 완료!" 문구', () => {
    const reward = { coins: 50, basic: 1, sturdy: 1, potions: 1 };
    const s = { ...base(), quests: { list: [{ id: 1, kind: 'winWild' as const, goal: 1, progress: 0, reward }], next: 2, done: 0 } };
    const r = questsAfter(s, { kind: 'winWild' }, () => 0.5);
    expect(r.save.coins).toBe(151);
    expect(r.save.potions).toBe(1);
    expect(r.lines[0]).toMatch(/^퀘스트 완료!/);
    expect(r.save.quests?.list.length).toBe(3);
    expect(questsAfter({ ...s, team: [] }, { kind: 'winWild' }).save).toEqual({ ...s, team: [] });
  });
  it('패배: 부활 지점으로, 코인 절반', () => {
    const s = { ...base(), map: 'route1', x: 20, y: 6, respawn: { map: 'town', x: 6, y: 8 } };
    const r = settleLoss(s);
    expect(r.save).toMatchObject({ map: 'town', x: 6, y: 8, coins: 51 });
    expect(r.lines[0]).toBe('눈앞이 깜깜해졌다…');
  });
});
