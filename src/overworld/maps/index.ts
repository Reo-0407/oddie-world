import { forest } from './forest.ts';
import { INTERIORS } from './house.ts';
import { route1 } from './route1.ts';
import { route2 } from './route2.ts';
import { route3 } from './route3.ts';
import { route4 } from './route4.ts';
import { town } from './town.ts';
import { desert, snow, volcano } from './towns.ts';
import type { MapData } from './types.ts';

/** 바깥 지도는 구역마다 따로이고 가장자리 워프로 이어진다 */
export const OUTDOORS: MapData[] = [town, route1, forest, route2, desert, route3, snow, route4, volcano];
export const MAPS: Record<string, MapData> = Object.fromEntries([...OUTDOORS, ...INTERIORS].map((m) => [m.id, m]));
export const getMap = (id: string): MapData | undefined => MAPS[id];
export type { MapData, Npc, Warp, Sign, Dir, HiddenItem } from './types.ts';
