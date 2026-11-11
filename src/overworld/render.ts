import type { RegionId } from '../world/regions.ts';
import type { Dir, MapData, NpcLook } from './maps/types.ts';
import { drawCharacter, SPRITE_H, SPRITE_W } from './sprites.ts';
import { drawTile, TILE } from './tiles.ts';
import { mapHeight, mapWidth, tilesOf } from './world.ts';

export interface Actor {
  /** 픽셀 좌표(타일 * 32, 걷는 중이면 중간값) */
  px: number;
  py: number;
  look: NpcLook;
  dir: Dir;
  /** 0 서기, 1/2 걷기 */
  frame: number;
  bubble?: boolean;
}

export interface Scene {
  map: MapData;
  player: Actor;
  npcs: Actor[];
  /** 물결 등 타일 애니메이션용 시간(ms) */
  time: number;
  /** 0~1 검은 막, 0~1 흰 번쩍임 */
  fade: number;
  flash: number;
}

const cache = new Map<string, HTMLCanvasElement>();
function sprite(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let cv = cache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    paint(c);
    cache.set(key, cv);
  }
  return cv;
}

const tileImage = (tile: number, frame: number, region: RegionId, seed: number) =>
  sprite(`t${tile}|${frame}|${region}|${seed}`, TILE, TILE, (c) => drawTile(c, tile, 0, 0, frame, region, seed));

const lookKey = (l: NpcLook) => `${l.hair}${l.skin}${l.shirt}${l.pants}${l.hat ?? ''}`;
const charImage = (a: Actor) =>
  sprite(`c${lookKey(a.look)}|${a.dir}|${a.frame}`, SPRITE_W, SPRITE_H, (c) => drawCharacter(c, a.look, a.dir, a.frame, 0, 4));

/** 화면에 보이는 크기를 정수 배율로 맞춰 또렷하게 그리는 렌더러 */
export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let scale = 1; // 게임 픽셀 1칸이 화면(장치) 픽셀 몇 칸인가(정수)
  let viewW = 0;
  let viewH = 0;

  /** 컨테이너 css 크기에서 정수 배율을 고른다: 가로 15 x 세로 11 타일에 가깝게 */
  function resize(cssW: number, cssH: number, dpr: number) {
    const css = Math.max(1, Math.round(Math.min(cssW / (TILE * 15), cssH / (TILE * 11))));
    scale = Math.max(1, Math.round(css * dpr));
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    viewW = Math.ceil(canvas.width / scale);
    viewH = Math.ceil(canvas.height / scale);
  }

  function draw(s: Scene) {
    const mw = mapWidth(s.map) * TILE;
    const mh = mapHeight(s.map) * TILE;
    const cam = (p: number, view: number, size: number) =>
      size <= view ? Math.floor((size - view) / 2) : Math.round(Math.max(0, Math.min(size - view, p)));
    const camX = cam(s.player.px + TILE / 2 - viewW / 2, viewW, mw);
    const camY = cam(s.player.py + TILE / 2 - viewH / 2, viewH, mh);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const tiles = tilesOf(s.map);
    const wave = Math.floor(s.time / 500) % 2;
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(mapWidth(s.map) - 1, Math.floor((camX + viewW) / TILE));
    const y1 = Math.min(mapHeight(s.map) - 1, Math.floor((camY + viewH) / TILE));
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const seed = (tx * 7 + ty * 13) % 4;
        ctx.drawImage(tileImage(tiles[ty][tx], wave, s.map.region, seed), tx * TILE - camX, ty * TILE - camY);
      }
    }

    const actors = [...s.npcs, s.player].sort((a, b) => a.py - b.py);
    for (const a of actors) {
      const sx = Math.round(a.px) - camX;
      const sy = Math.round(a.py) - camY - 4;
      ctx.drawImage(charImage(a), sx, sy);
      if (a.bubble) bubble(sx + SPRITE_W / 2, sy - 2);
    }

    if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash})`; ctx.fillRect(0, 0, viewW, viewH); }
    if (s.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${s.fade})`; ctx.fillRect(0, 0, viewW, viewH); }
  }

  /** 머리 위 "!" 말풍선(픽셀로 그린다) */
  function bubble(cx: number, bottom: number) {
    const x = cx - 7;
    const y = bottom - 16;
    ctx.fillStyle = '#2b2024';
    ctx.fillRect(x, y, 14, 16);
    ctx.fillRect(cx - 2, y + 16, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 1, y + 1, 12, 14);
    ctx.fillRect(cx - 1, y + 15, 2, 3);
    ctx.fillStyle = '#d94f3d';
    ctx.fillRect(cx - 1, y + 3, 2, 6);
    ctx.fillRect(cx - 1, y + 11, 2, 2);
  }

  return { resize, draw };
}
