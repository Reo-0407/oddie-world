import { describe, expect, it } from 'vitest';
import { newSave, parseSave } from '../game/save.ts';
import { decideSync, withMergedDex } from '../online/saveSync.ts';
import { dexMilestoneReward, cleanDex, dexFromOwned, dexProgress, dexStatus, emptyDex, markCaught, markSeen, mergeDex } from './dex.ts';

describe('도감 기록', () => {
  it('만난 종은 번호순으로 한 번만 들어가고, 같으면 같은 객체를 돌려준다', () => {
    let dex = emptyDex();
    dex = markSeen(dex, 7);
    dex = markSeen(dex, 3);
    expect(dex.seen).toEqual([3, 7]);
    expect(markSeen(dex, 3)).toBe(dex);
    expect(dex.caught).toEqual([]);
  });
  it('잡으면 만난 것으로도 적힌다', () => {
    const dex = markCaught(markSeen(emptyDex(), 5), 9);
    expect(dex).toEqual({ seen: [5, 9], caught: [9] });
    expect(markCaught(dex, 9)).toBe(dex);
    expect(markCaught(dex, 5)).toEqual({ seen: [5, 9], caught: [5, 9] });
  });
  it('상태와 진행률', () => {
    const dex = markCaught(markSeen(emptyDex(), 2), 4);
    expect(dexStatus(dex, 4)).toBe('caught');
    expect(dexStatus(dex, 2)).toBe('seen');
    expect(dexStatus(dex, 1)).toBe('unknown');
    expect(dexProgress(dex, 165)).toEqual({ caught: 1, seen: 2, total: 165 });
    expect(dexProgress({ seen: [1, 999], caught: [999] }, 165)).toEqual({ caught: 0, seen: 1, total: 165 }); // 범위 밖은 세지 않는다
  });
  it('합집합, 옛 저장에서 채우기', () => {
    expect(mergeDex({ seen: [1, 2], caught: [1] }, { seen: [3], caught: [3] })).toEqual({ seen: [1, 2, 3], caught: [1, 3] });
    expect(dexFromOwned([{ speciesId: 42, level: 5, exp: 0 }, { speciesId: 1, level: 5, exp: 0 }, { speciesId: 42, level: 9, exp: 0 }]))
      .toEqual({ seen: [1, 42], caught: [1, 42] });
  });
  it('저장에서 읽은 값은 정리한다 (이상한 값, 중복, caught는 seen에도)', () => {
    expect(cleanDex({ seen: [5, 5, -1, 'x', 2.5, 1000], caught: [9, 9, 0] })).toEqual({ seen: [5, 9], caught: [9] });
    expect(cleanDex(null)).toEqual(emptyDex());
    expect(cleanDex({ seen: 'no' })).toEqual(emptyDex());
  });
});

describe('저장 v4와 도감', () => {
  it('v4 저장의 도감을 그대로 읽고, 이상한 도감은 정리한다', () => {
    const save = { ...newSave('가', 0), dex: { seen: [1, 2, 3], caught: [2] } };
    expect(parseSave(JSON.stringify(save))?.dex).toEqual({ seen: [1, 2, 3], caught: [2] });
    const messy = { ...save, dex: { seen: [3, 3, 'a'], caught: [8] } };
    expect(parseSave(JSON.stringify(messy))?.dex).toEqual({ seen: [3, 8], caught: [8] });
    expect(parseSave(JSON.stringify({ ...save, dex: undefined }))?.dex).toEqual(emptyDex());
  });
  it('v3 저장은 팀과 박스의 오디로 도감을 채운다(만난 기록은 없어도 잡은 것은 만난 것)', () => {
    const v3 = { ...newSave('가', 0), version: 3, team: [{ speciesId: 4, level: 10, exp: 0 }], box: [{ speciesId: 8, level: 5, exp: 0 }], dex: undefined };
    expect(parseSave(JSON.stringify(v3))?.dex).toEqual({ seen: [4, 8], caught: [4, 8] });
  });
  it('클라우드 병합: 도감만 다르면 묻지 않고, 고른 쪽에 도감을 합친다', () => {
    const base = newSave('가', 0);
    const a = { ...base, dex: { seen: [1], caught: [1] } };
    const b = { ...base, dex: { seen: [2, 3], caught: [3] } };
    expect(decideSync({ data: a, at: 1 }, { data: b, at: 2 })).toEqual({ action: 'none' });
    const other = { ...base, coins: 5 };
    expect(decideSync({ data: a, at: 1 }, { data: other, at: 2 }).action).toBe('ask');
    expect(withMergedDex(a, b).dex).toEqual({ seen: [1, 2, 3], caught: [1, 3] });
    expect(withMergedDex(a, b).coins).toBe(a.coins);
  });
});

describe('서식 구역', () => {
  it('타입이 잘 나오는 구역을 가중치 순으로, 해당 없으면 빈 목록', async () => {
    const { habitatsOf } = await import('../ui/DexOverlay.tsx');
    expect(habitatsOf({ types: ['fire'] })).toEqual(['화산', '사막']);
    expect(habitatsOf({ types: ['ice', 'water'] })[0]).toBe('설원');
    expect(habitatsOf({ types: ['electric'] })).toEqual([]);
  });
});

describe('도감 보상', () => {
  it('5종마다 보상, 넘어가지 않으면 없음', () => {
    expect(dexMilestoneReward(3, 4)).toBeNull();
    expect(dexMilestoneReward(4, 5)).toEqual({ steps: 1, coins: 150, ropes: 3, sturdy: 1 });
    expect(dexMilestoneReward(4, 10)?.steps).toBe(2);
  });
});
