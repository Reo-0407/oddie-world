import { expect, test } from 'vitest';
import type { Species } from '../data/types.ts';
import { tackle } from '../engine/testkit.ts';
import { createBattle, createBattlePokemon } from './factory.ts';

const moves = {
  1: tackle({ id: 1 }), 2: tackle({ id: 2 }), 3: tackle({ id: 3 }),
  4: tackle({ id: 4 }), 5: tackle({ id: 5 }), 6: tackle({ id: 6 }),
};
const species: Species = {
  id: 25, name: '피카츄', types: ['electric'],
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
  learnset: [1, 5, 10, 15, 20, 30].map((level, index) => ({ level, moveId: index + 1 })),
  region: 'Meadow', rarity: 'Common', role: 'bal', captureRate: 190, signatureMoveId: 1,
};

test('고유 기술과 최근에 배운 기술 3개, 만피를 가진다', () => {
  const pokemon = createBattlePokemon(species, 20, moves);
  expect(pokemon.moves.map((m) => m.id)).toEqual([1, 3, 4, 5]);
  expect(pokemon.hp).toBe(pokemon.stats.hp);
  expect(pokemon.status).toBeNull();
});

test('고유 기술 뒤에 기술을 많이 배워도 고유 기술은 남는다', () => {
  const pokemon = createBattlePokemon(species, 30, moves);
  expect(pokemon.moves.map((m) => m.id)).toEqual([1, 4, 5, 6]);
});

test('고유 기술을 아직 못 배웠으면 최근 4개가 남는다', () => {
  const late: Species = { ...species, signatureMoveId: 6 };
  const pokemon = createBattlePokemon(late, 20, moves);
  expect(pokemon.moves.map((m) => m.id)).toEqual([2, 3, 4, 5]);
});

test('createBattle은 첫 턴 상태를 만든다', () => {
  const pokemon = createBattlePokemon(species, 5, moves);
  const state = createBattle([pokemon], [pokemon], 42);
  expect(state).toMatchObject({ turn: 1, winner: null, rngState: 42, pendingSwitch: [false, false] });
});
