import { SPECIES } from '../data/index.ts';
import { pickSpeciesForRegion, type RegionId } from '../world/regions.ts';
import { isCounter, isGrass, isWalkable, parseRows, type Tile } from './tiles.ts';
import type { Dir, MapData, Npc, Sign } from './maps/types.ts';

export type { Dir };
export const STEP_MS = 180;
export const ENCOUNTER_RATE = 0.12;

export interface PlayerState {
  map: string;
  x: number;
  y: number;
  facing: Dir;
}

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
};

const gridCache = new WeakMap<MapData, Tile[][]>();
/** 지도 문자를 타일로 바꾼 격자(한 번만 계산) */
export function tilesOf(map: MapData): Tile[][] {
  let t = gridCache.get(map);
  if (!t) { t = parseRows(map.rows); gridCache.set(map, t); }
  return t;
}

export const tileAt = (map: MapData, x: number, y: number): Tile | undefined => tilesOf(map)[y]?.[x];
export const mapWidth = (map: MapData) => map.rows[0]?.length ?? 0;
export const mapHeight = (map: MapData) => map.rows.length;

type Pos = { x: number; y: number };

/** 그 칸으로 한 걸음 갈 수 있나: 지도 안, 걸을 수 있는 타일, NPC 없음 */
export function canStep(map: MapData, npcs: readonly Pos[], x: number, y: number): boolean {
  const t = tileAt(map, x, y);
  if (t === undefined || !isWalkable(t)) return false;
  return !npcs.some((n) => n.x === x && n.y === y);
}

export interface StepResult {
  moved: boolean;
  state: PlayerState;
  /** 문/출구 칸을 밟았다: state는 이미 도착한 지도로 바뀌어 있다 */
  warped: boolean;
  /** 풀숲 칸을 밟았고 조우 난수에 걸렸다 */
  encounter: boolean;
}

/**
 * 한 방향으로 한 걸음. 막혀 있으면 제자리에서 방향만 바꾼다.
 * 워프 칸이면 도착 지도 상태를 돌려주고, 풀숲이면 rand()로 조우를 굴린다(워프와 동시에는 없음)
 */
export function stepPlayer(
  state: PlayerState, dir: Dir, map: MapData, npcs: readonly Pos[], rand: () => number, maps: (id: string) => MapData | undefined = () => undefined,
): StepResult {
  const { dx, dy } = DELTA[dir];
  const nx = state.x + dx;
  const ny = state.y + dy;
  if (!canStep(map, npcs, nx, ny)) return { moved: false, state: { ...state, facing: dir }, warped: false, encounter: false };
  const warp = map.warps.find((w) => w.x === nx && w.y === ny);
  if (warp && maps(warp.to.map)) {
    return { moved: true, state: { map: warp.to.map, x: warp.to.x, y: warp.to.y, facing: warp.to.facing }, warped: true, encounter: false };
  }
  const t = tileAt(map, nx, ny);
  const encounter = t !== undefined && isGrass(t) && rand() < ENCOUNTER_RATE;
  return { moved: true, state: { ...state, x: nx, y: ny, facing: dir }, warped: false, encounter };
}

export const facingTile = (s: PlayerState): Pos => ({ x: s.x + DELTA[s.facing].dx, y: s.y + DELTA[s.facing].dy });

/** NPC가 바라보는 방향으로 sight칸 안에 플레이어가 있고 사이가 막히지 않았나 */
export function npcInSight(npc: Pick<Npc, 'x' | 'y' | 'facing'>, player: Pos, sight = 4, blocked: (x: number, y: number) => boolean = () => false): boolean {
  const { dx, dy } = DELTA[npc.facing];
  for (let i = 1; i <= sight; i += 1) {
    const x = npc.x + dx * i;
    const y = npc.y + dy * i;
    if (x === player.x && y === player.y) return true;
    if (blocked(x, y)) return false;
  }
  return false;
}

export type Target = { type: 'npc'; npc: Npc } | { type: 'sign'; sign: Sign };

/** A 버튼 대상: 바라보는 칸의 NPC나 간판. 카운터 너머의 NPC도 말을 걸 수 있다 */
export function interactTarget(map: MapData, npcs: readonly Npc[], s: PlayerState): Target | null {
  const f = facingTile(s);
  const npc = npcs.find((n) => n.x === f.x && n.y === f.y);
  if (npc) return { type: 'npc', npc };
  const sign = map.signs.find((g) => g.x === f.x && g.y === f.y);
  if (sign) return { type: 'sign', sign };
  const t = tileAt(map, f.x, f.y);
  if (t !== undefined && isCounter(t)) {
    const { dx, dy } = DELTA[s.facing];
    const beyond = npcs.find((n) => n.x === f.x + dx && n.y === f.y + dy);
    if (beyond) return { type: 'npc', npc: beyond };
  }
  return null;
}

// ---------- 야생 ----------
export const WILD_LEVELS: Record<RegionId, [number, number]> = {
  meadow: [3, 6], desert: [10, 14], snow: [17, 22], volcano: [25, 30],
};
const CANDIDATES = SPECIES.map((s) => ({ id: s.id, types: s.types }));

export function rollWild(region: RegionId, rand: () => number): { speciesId: number; level: number; region: RegionId } {
  const [lo, hi] = WILD_LEVELS[region];
  return { speciesId: pickSpeciesForRegion(region, CANDIDATES, rand), level: lo + Math.floor(rand() * (hi - lo + 1)), region };
}
