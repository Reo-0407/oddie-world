import { describe, expect, it } from 'vitest';
import { newSave } from '../game/save.ts';
import { settleCatch, settleLoss, settleWin } from './outcome.ts';

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
  it('패배: 부활 지점으로, 코인 절반', () => {
    const s = { ...base(), map: 'route1', x: 20, y: 6, respawn: { map: 'town', x: 6, y: 8 } };
    const r = settleLoss(s);
    expect(r.save).toMatchObject({ map: 'town', x: 6, y: 8, coins: 51 });
    expect(r.lines[0]).toBe('눈앞이 깜깜해졌다…');
  });
});
