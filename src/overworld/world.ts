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

/** 문지기·대사 판단에 쓰는 진행 상황 */
export interface Progress { badges: readonly string[]; flags: readonly string[] }

/** 팀이 있는 옛 저장은 스타터를 받은 것으로 본다 */
export const progressOf = (save: { badges: readonly string[]; flags: readonly string[]; team: readonly unknown[] }): Progress => ({
  badges: save.badges,
  flags: save.team.length > 0 && !save.flags.includes('starter') ? [...save.flags, 'starter'] : save.flags,
});

/** 문지기가 길을 비켜 주나(문지기가 아니면 true) */
export function gateOpen(npc: Pick<Npc, 'gate'>, p: Progress): boolean {
  const g = npc.gate;
  if (!g) return true;
  return (g.badges ?? []).every((b) => p.badges.includes(b)) && (!g.flag || p.flags.includes(g.flag));
}

/** 진행 상황에 맞춘 NPC 위치: 열린 문지기는 aside 칸으로 비켜선다 */
export const placeNpcs = (map: MapData, p: Progress): Npc[] =>
  map.npcs.map((n) => (n.gate && gateOpen(n, p) ? { ...n, x: n.gate.aside.x, y: n.gate.aside.y } : n));

/** 말을 걸었을 때의 대사 */
export function npcLines(npc: Npc, p: Progress): string[] {
  if (npc.gate) return gateOpen(npc, p) ? npc.gate.open : npc.lines;
  if (npc.linesIf && p.flags.includes(npc.linesIf.flag)) return npc.linesIf.lines;
  return npc.lines;
}

/** 실내 지도에서 나가는 칸(첫 워프의 도착지) = 오디 센터 부활 지점 */
export const exitOf = (map: MapData): { map: string; x: number; y: number } | null => {
  const w = map.warps[0];
  return w ? { map: w.to.map, x: w.to.x, y: w.to.y } : null;
};

/** 불러온 위치에 설 수 없으면(없는 지도·지도 밖·벽·NPC 자리) 부활 지점, 그것도 안 되면 시작점 */
export function spawnOf(
  saved: PlayerState, respawn: { map: string; x: number; y: number }, start: PlayerState,
  lookup: (id: string) => MapData | undefined, p: Progress,
): PlayerState {
  const ok = (s: { map: string; x: number; y: number }) => {
    const m = lookup(s.map);
    return !!m && canStep(m, placeNpcs(m, p), s.x, s.y);
  };
  if (ok(saved)) return { map: saved.map, x: saved.x, y: saved.y, facing: saved.facing };
  if (ok(respawn)) return { ...respawn, facing: 'down' };
  return { ...start };
}
