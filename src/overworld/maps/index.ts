import { INTERIORS } from './house.ts';
import { route1 } from './route1.ts';
import { town } from './town.ts';
import type { MapData } from './types.ts';

export const MAPS: Record<string, MapData> = Object.fromEntries([town, route1, ...INTERIORS].map((m) => [m.id, m]));
export const getMap = (id: string): MapData | undefined => MAPS[id];
export type { MapData, Npc, Warp, Sign, Dir } from './types.ts';
