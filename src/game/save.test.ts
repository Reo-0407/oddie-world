import { describe, expect, it } from 'vitest';
import { clearSave, loadSave, newSave, parseSave, SAVE_KEY, writeSave } from './save.ts';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('저장', () => {
  const data = {
    ...newSave('준우', 2),
    team: [{ speciesId: 42, level: 12, exp: 30 }],
    box: [{ speciesId: 3, level: 8, exp: 0 }],
    ropes: { basic: 3, sturdy: 2 },
    coins: 120,
    potions: 2,
    playerLevel: 12,
    tutorialDone: true,
  };
  it('쓰고 읽는다', () => {
    const s = fakeStorage();
    expect(writeSave(data, s)).toBe(true);
    expect(loadSave(s)).toEqual(data);
    clearSave(s);
    expect(loadSave(s)).toBeNull();
  });
  it('옛 v1 저장(starterId)은 v2로 옮긴다', () => {
    const old = JSON.stringify({ name: '준우', characterIndex: 3, starterId: 42 });
    expect(parseSave(old)).toEqual({
      ...newSave('준우', 3),
      coins: 0, // 옛 저장은 시작 코인을 받지 않는다
      team: [{ speciesId: 42, level: 10, exp: 0 }],
      dex: { seen: [42], caught: [42] }, // 옛 저장은 팀의 오디를 잡은 것으로 채운다
    });
    expect(loadSave(fakeStorage({ [SAVE_KEY]: old }))?.ropes).toEqual({ basic: 5, sturdy: 1 });
  });
  it('v2 저장은 potions 0으로 옮기고 나머지는 그대로', () => {
    const { potions: _p, version: _v, dex: _d, ...rest } = data;
    const parsed = parseSave(JSON.stringify({ ...rest, version: 2 }));
    expect(parsed).toEqual({ ...data, potions: 0, dex: { seen: [3, 42], caught: [3, 42] } }); // 팀과 박스
    expect(parsed?.version).toBe(5);
  });
  it('새 저장은 코인 100, 회복약 0', () => {
    expect(newSave('a', 0)).toMatchObject({ coins: 100, potions: 0, version: 5, dex: { seen: [], caught: [] } });
  });
  it('옛 v1에 스타터가 없으면 빈 팀', () => {
    expect(parseSave(JSON.stringify({ name: 'a', characterIndex: 0 }))?.team).toEqual([]);
  });
  it('망가진 값은 무시한다', () => {
    expect(parseSave('{{')).toBeNull();
    expect(parseSave(JSON.stringify({ name: '', characterIndex: 0 }))).toBeNull();
    expect(parseSave(JSON.stringify({ name: 'a', characterIndex: 9 }))).toBeNull();
    expect(parseSave(JSON.stringify({ version: 99, name: 'a', characterIndex: 0 }))).toBeNull();
    expect(loadSave(fakeStorage({ [SAVE_KEY]: 'x' }))).toBeNull();
  });
  it('v2의 이상한 항목은 걸러내고 팀은 6마리까지', () => {
    const raw = JSON.stringify({
      ...data,
      team: [...Array(8).fill({ speciesId: 1, level: 5, exp: 0 }), { speciesId: -1, level: 5 }, 'x'],
      ropes: { basic: -3, sturdy: 'a' },
      coins: 'many',
      potions: -4,
    });
    const parsed = parseSave(raw);
    expect(parsed?.team).toHaveLength(6);
    expect(parsed?.ropes).toEqual({ basic: 5, sturdy: 0 });
    expect(parsed?.coins).toBe(0);
    expect(parsed?.potions).toBe(0);
  });
  it('tutorialDone: 없으면 false(코인이 있으면 true), 있으면 그대로', () => {
    const { tutorialDone: _omit, ...rest } = data;
    expect(parseSave(JSON.stringify({ ...rest, coins: 0 }))?.tutorialDone).toBe(false);
    expect(parseSave(JSON.stringify(rest))?.tutorialDone).toBe(true);
    expect(parseSave(JSON.stringify({ ...data, tutorialDone: false }))?.tutorialDone).toBe(false);
    expect(newSave('a', 0).tutorialDone).toBe(false);
  });
  it('v4 저장은 마을 시작점과 빈 배지/플래그로 옮긴다', () => {
    const { map: _m, x: _x, y: _y, facing: _f, badges: _b, beaten: _be, flags: _fl, respawn: _r, ...rest } = data;
    const parsed = parseSave(JSON.stringify({ ...rest, version: 4 }));
    expect(parsed).toMatchObject({ map: 'town', x: 6, y: 9, facing: 'down', badges: [], beaten: [], flags: [], respawn: { map: 'town', x: 6, y: 8 } });
  });
  it('v5 위치와 진행 필드를 그대로 읽고, 망가진 값은 기본값', () => {
    const moved = { ...data, map: 'route1', x: 5, y: 6, facing: 'left' as const, badges: ['meadow'], beaten: ['t1'], flags: ['starter'], respawn: { map: 'town', x: 6, y: 8 } };
    expect(parseSave(JSON.stringify(moved))).toEqual(moved);
    const bad = parseSave(JSON.stringify({ ...moved, facing: 'sideways', badges: [1, 'a'], respawn: 3 }));
    expect(bad).toMatchObject({ facing: 'down', badges: ['a'], respawn: { map: 'town' } });
  });
  it('저장소가 던져도 죽지 않는다', () => {
    const boom = () => { throw new Error('x'); };
    const bad = { getItem: boom, setItem: boom, removeItem: boom };
    expect(loadSave(bad)).toBeNull();
    expect(writeSave(data, bad)).toBe(false);
    expect(() => clearSave(bad)).not.toThrow();
  });
});

