import type { Move } from '../engine/types.ts';
import movesJson from './moves.json' with { type: 'json' };
import speciesJson from './species.json' with { type: 'json' };
import type { Species } from './types.ts';

export const SPECIES = speciesJson as unknown as Species[];
export const MOVES = movesJson as unknown as Record<number, Move>;

export function speciesById(id: number): Species {
  const species = SPECIES[id - 1];
  if (!species) throw new Error(`없는 도감 번호: ${id}`);
  return species;
}
