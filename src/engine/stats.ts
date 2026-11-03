import type { Stats } from './types.ts';

export function calcStats(base: Stats, level: number): Stats {
  const other = (value: number) => Math.floor((2 * value * level) / 100) + 5;
  return {
    hp: Math.floor((2 * base.hp * level) / 100) + level + 10,
    atk: other(base.atk),
    def: other(base.def),
    spa: other(base.spa),
    spd: other(base.spd),
    spe: other(base.spe),
  };
}
