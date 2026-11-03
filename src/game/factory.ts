import type { Species } from '../data/types.ts';
import { calcStats } from '../engine/stats.ts';
import { freshVolatile } from '../engine/fighter.ts';
import type { BattlePokemon, BattleState, Move } from '../engine/types.ts';

const MAX_MOVES = 4;

/** 고유 기술은 배우면 항상 남고, 나머지 칸은 가장 최근에 배운 기술로 채운다 */
function pickMoves(species: Species, level: number) {
  const learned = species.learnset.filter((entry) => entry.level <= level);
  const signature = learned.find((entry) => entry.moveId === species.signatureMoveId);
  if (!signature) return learned.slice(-MAX_MOVES);
  const others = learned.filter((entry) => entry !== signature).slice(-(MAX_MOVES - 1));
  return learned.filter((entry) => entry === signature || others.includes(entry));
}

export function createBattlePokemon(
  species: Species,
  level: number,
  moves: Record<number, Move>,
): BattlePokemon {
  const stats = calcStats(species.baseStats, level);
  return {
    speciesId: species.id,
    name: species.name,
    level,
    types: species.types,
    stats,
    hp: stats.hp,
    status: null,
    sleepTurns: 0,
    moves: pickMoves(species, level).map((entry) => moves[entry.moveId]),
    ...freshVolatile(),
  };
}

export function createBattle(teamA: BattlePokemon[], teamB: BattlePokemon[], seed: number): BattleState {
  return {
    sides: [{ team: teamA, active: 0 }, { team: teamB, active: 0 }],
    turn: 1,
    winner: null,
    rngState: seed,
    pendingSwitch: [false, false],
    delayed: [],
    pivoting: [false, false],
  };
}
