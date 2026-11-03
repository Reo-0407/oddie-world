import { freshVolatile } from './fighter.ts';
import type { BattlePokemon, BattleState, Move } from './types.ts';

export function tackle(overrides: Partial<Move> = {}): Move {
  return {
    id: 33,
    name: '몸통박치기',
    type: 'normal',
    category: 'physical',
    power: 40,
    accuracy: 0,
    priority: 0,
    effects: [],
    ...overrides,
  };
}

export function mon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    speciesId: 1,
    name: '테스트몬',
    level: 50,
    types: ['normal'],
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    hp: 100,
    status: null,
    sleepTurns: 0,
    moves: [tackle()],
    ...freshVolatile(),
    ...overrides,
  };
}

export function battle(a: BattlePokemon[], b: BattlePokemon[], seed = 1): BattleState {
  return {
    sides: [{ team: a, active: 0 }, { team: b, active: 0 }],
    turn: 1,
    winner: null,
    rngState: seed,
    pendingSwitch: [false, false],
    delayed: [],
    pivoting: [false, false],
  };
}
