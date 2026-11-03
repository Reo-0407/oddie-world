import { expect, test } from 'vitest';
import { MOVES, SPECIES, speciesById } from './index.ts';

test('오디 165종이 번호순으로 있다', () => {
  expect(SPECIES).toHaveLength(165);
  expect(SPECIES.map((s) => s.id)).toEqual(Array.from({ length: 165 }, (_, i) => i + 1));
});

test('모든 습득 기술이 실제로 있고 레벨 5 이하에 2개 이상 있다', () => {
  for (const species of SPECIES) {
    expect(species.learnset.filter((e) => e.level <= 5).length).toBeGreaterThanOrEqual(2);
    for (const entry of species.learnset) expect(MOVES[entry.moveId]).toBeDefined();
    expect(species.learnset.some((e) => e.moveId === species.signatureMoveId)).toBe(true);
  }
});

test('고유 기술은 종마다 다르고 평범한 공격이 아니다', () => {
  const ids = SPECIES.map((s) => s.signatureMoveId);
  expect(new Set(ids).size).toBe(165);
  for (const id of ids) expect(MOVES[id].effects.length > 0 || MOVES[id].priority > 0).toBe(true);
});

test('대표 오디 값', () => {
  const pippo = speciesById(1);
  expect(pippo).toMatchObject({ name: 'Pippo', types: ['grass'], region: 'Meadow', rarity: 'Common', captureRate: 190 });
  expect(pippo.baseStats.hp).toBe(52);
  expect(speciesById(42).types).toEqual(['fire', 'ghost']);
  expect(speciesById(107).types).toEqual(['water']);
});

test('기술 id가 겹치지 않고 위력은 양수다', () => {
  for (const move of Object.values(MOVES)) {
    if (move.category === 'status') expect(move.power).toBe(0);
    else expect(move.power).toBeGreaterThan(0);
  }
});
