import type { Stats, TypeName } from '../engine/types.ts';

export interface LearnEntry {
  level: number;
  moveId: number;
}

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Secret' | '???';

export interface Species {
  id: number;
  name: string;
  types: TypeName[];
  baseStats: Stats;
  learnset: LearnEntry[];
  region: string;
  rarity: Rarity;
  role: string;
  captureRate: number;
  signatureMoveId: number;
}
