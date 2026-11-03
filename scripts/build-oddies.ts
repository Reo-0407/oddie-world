import { readFileSync, writeFileSync } from 'node:fs';
import type { Rarity, Species } from '../src/data/types.ts';
import type { Move } from '../src/engine/types.ts';
import {
  buildLearnset, buildStats, captureRateOf, commonMove, isSpecialAttacker, parseDesign, shakeMove, signatureId,
  signatureMove, totalOf,
} from './oddie-design.ts';

interface Meta { id: string; name: string; region: string; rarity: Rarity }

const meta: Meta[] = JSON.parse(readFileSync('design/oddies.meta.json', 'utf8'));
const entries = parseDesign(readFileSync('design/oddies.psv', 'utf8'));
if (entries.length !== meta.length) throw new Error(`설계표 ${entries.length}줄, 메타 ${meta.length}줄`);

const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const;

const moves: Record<number, Move> = { 2: shakeMove() };
for (const type of TYPES) {
  for (const tier of [1, 2, 3, 4]) {
    for (const special of [false, true]) {
      const move = commonMove(type, tier, special);
      moves[move.id] = move;
    }
  }
}

const species: Species[] = entries.map((entry, index) => {
  const info = meta[index];
  if (info.id !== `OD-${String(entry.num).padStart(3, '0')}` || info.name !== entry.name) {
    throw new Error(`설계표와 메타가 어긋남: ${entry.num} ${entry.name} / ${info.id} ${info.name}`);
  }
  const move = signatureMove(entry, info.rarity);
  moves[move.id] = move;
  return {
    id: entry.num,
    name: entry.name,
    types: entry.types,
    baseStats: buildStats(entry.role, totalOf(entry.num, info.rarity)),
    learnset: buildLearnset(entry, info.rarity),
    region: info.region,
    rarity: info.rarity,
    role: entry.role,
    captureRate: captureRateOf(info.rarity),
    signatureMoveId: signatureId(entry.num),
  };
});

writeFileSync('src/data/species.json', JSON.stringify(species));
writeFileSync('src/data/moves.json', JSON.stringify(moves));
console.log(`오디 ${species.length}종, 기술 ${Object.keys(moves).length}개 저장 (물리/특수 판정 ${entries.filter((e) => isSpecialAttacker(e.role, e.types[0])).length}종이 특수)`);
