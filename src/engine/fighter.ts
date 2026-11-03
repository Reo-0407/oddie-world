import type { BattlePokemon } from './types.ts';

export type Volatile = Pick<
  BattlePokemon,
  'stages' | 'confusion' | 'flinched' | 'shielded' | 'shieldStreak' | 'charging' | 'trapped' | 'hitThisTurn'
>;

export function freshVolatile(): Volatile {
  return {
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    confusion: 0,
    flinched: false,
    shielded: false,
    shieldStreak: 0,
    charging: null,
    trapped: 0,
    hitThisTurn: false,
  };
}

export function resetVolatile(pokemon: BattlePokemon): void {
  Object.assign(pokemon, freshVolatile());
}
