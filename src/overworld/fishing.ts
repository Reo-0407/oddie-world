import { kindOf } from './tiles.ts';
import { facingTile, tileAt, type PlayerState } from './world.ts';
import type { MapData } from './maps/types.ts';

/** 낚시: 낚싯대(flag)를 들고 물을 바라보고 A → 1~4초 뒤 "!" → 0.8초 안에 탭하면 걸린다 */

export const ROD_FLAG = 'rod';
export const BITE_MS: [number, number] = [1000, 4000];
export const HOOK_MS = 800;
export const CAST_MS = 450;

/** 낚싯대를 던질 수 있는 물 칸(바라보는 칸). 낚싯대가 없거나 물이 아니면 null */
export function fishSpot(map: MapData, player: PlayerState, flags: readonly string[]): { x: number; y: number } | null {
  if (!flags.includes(ROD_FLAG)) return null;
  const f = facingTile(player);
  const t = tileAt(map, f.x, f.y);
  return t !== undefined && kindOf(t) === 'water' ? f : null;
}

/** 던진 뒤 입질까지(ms) */
export const biteDelay = (rand: () => number) => Math.round(BITE_MS[0] + rand() * (BITE_MS[1] - BITE_MS[0]));

export type ReelResult = 'early' | 'hooked' | 'late';
/** 당긴 시각으로 판정: 입질 전이면 early(물고기가 놀라 달아난다), 0.8초 안이면 hooked */
export function reel(biteAt: number, tapAt: number): ReelResult {
  if (tapAt < biteAt) return 'early';
  return tapAt - biteAt <= HOOK_MS ? 'hooked' : 'late';
}
