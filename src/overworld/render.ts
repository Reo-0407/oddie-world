import type { RegionId } from './regions.ts';
import type { Dir, MapData, NpcLook } from './maps/types.ts';
import { OUTDOORS } from './maps/index.ts';
import { drawCharacter, SPRITE_H, SPRITE_W } from './sprites.ts';
import { drawTile, kindOf, TILE } from './tiles.ts';
import { mapHeight, mapWidth, tilesOf } from './world.ts';
import { speciesById } from '../data/index.ts';
import { thumbUrl, typeColor } from '../ui/OddieArt.tsx';
import type { LevelTag } from '../game/fun.ts';
import type { Tint } from '../game/daytime.ts';

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

/** 필드 위의 오디(야생·따라오는 내 오디) */
export interface MonActor {
  px: number;
  py: number;
  speciesId: number;
  dir: Dir;
  /** 0~1: 걷는 중 깡충 뛰는 높이 */
  hop: number;
  bubble?: 'notice' | 'heart' | null;
  /** 0~1: 나타나기/사라지기(펑) 크기 */
  scale?: number;
  /** 머리 위 레벨 표(색은 내 선두와 비교, 'me'는 따라오는 내 오디) */
  level?: number;
  tag?: LevelTag | 'me';
  /** 반짝이(금빛) */
  shiny?: boolean;
  /** 강한 야생 오디: 붉은 기운 */
  strong?: boolean;
}

export interface Scene {
  map: MapData;
  player: Actor;
  npcs: Actor[];
  mons?: MonActor[];
  follower?: MonActor | null;
  /** 반짝이는 숨은 물건 칸 */
  items?: { x: number; y: number }[];
  /** 물결 등 타일 애니메이션용 시간(ms) */
  time: number;
  /** 0~1 검은 막, 0~1 흰 번쩍임 */
  fade: number;
  flash: number;
  /** 바깥 지도의 낮·밤 색(a=0이면 없음) */
  tint?: Tint;
  /** 낚시 중: 찌가 떠 있는 칸, 던지는 정도(0~1), 입질 중인가 */
  fishing?: { x: number; y: number; cast: number; bite: boolean } | null;
}

export type ParticleKind = 'leaf' | 'dust' | 'poof' | 'sparkle' | 'heart';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }

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

export const MON_PX = 44;
/** 오디 썸네일을 MON_PX로 부드럽게 줄여 둔다(좌우 두 벌). 그림이 없거나 아직이면 타입색 방울 */
type MonImgs = { img: HTMLCanvasElement; flip: HTMLCanvasElement; gold: HTMLCanvasElement; goldFlip: HTMLCanvasElement };
const monCache = new Map<number, MonImgs | 'loading'>();
function monImage(id: number, flip: boolean, shiny = false): HTMLCanvasElement {
  const got = monCache.get(id);
  if (got && got !== 'loading') return shiny ? (flip ? got.goldFlip : got.gold) : flip ? got.flip : got.img;
  if (!got) {
    const url = thumbUrl(id);
    if (url) {
      monCache.set(id, 'loading');
      const im = new Image();
      im.onload = () => {
        const make = (f: boolean, gold = false) => {
          const cv = document.createElement('canvas');
          cv.width = MON_PX; cv.height = MON_PX;
          const c = cv.getContext('2d')!;
          c.imageSmoothingEnabled = true;
          c.imageSmoothingQuality = 'high';
          if (f) { c.translate(MON_PX, 0); c.scale(-1, 1); }
          // 썸네일이 어두워 풀밭에서 묻히므로 밝게 하고 흰 테두리를 둘러 눈에 띄게 한다
          c.filter = gold
            // 반짝이: 금빛으로 물들이고 노란 테두리
            ? 'sepia(1) saturate(3.2) hue-rotate(-12deg) brightness(1.35) drop-shadow(0 0 1px #fff3a0) drop-shadow(0 0 1px #ffd24a)'
            : 'brightness(1.3) saturate(1.25) drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)';
          c.drawImage(im, 2, 2, MON_PX - 4, MON_PX - 4);
          return cv;
        };
        monCache.set(id, { img: make(false), flip: make(true), gold: make(false, true), goldFlip: make(true, true) });
      };
      im.onerror = () => monCache.delete(id);
      im.src = url;
    }
  }
  return sprite(`blob${id}${shiny ? 'g' : ''}`, MON_PX, MON_PX, (c) => {
    const sp = speciesById(id);
    const a = shiny ? '#ffd24a' : typeColor(sp.types[0]);
    const b = shiny ? '#fff3a0' : typeColor(sp.types[1] ?? sp.types[0]);
    c.fillStyle = '#2b2024'; c.beginPath(); c.arc(15, 17, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = a; c.beginPath(); c.arc(15, 17, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = b; c.fillRect(7, 19, 16, 4);
    c.fillStyle = '#ffffff'; c.fillRect(10, 13, 3, 3); c.fillRect(17, 13, 3, 3);
    c.fillStyle = '#2b2024'; c.fillRect(11, 14, 2, 2); c.fillRect(18, 14, 2, 2);
  });
}

const OUTDOOR = new Set(OUTDOORS.map((m) => m.id));
const TAG_COLOR: Record<LevelTag | 'me', string> = { red: '#ff5a4a', yellow: '#ffd24a', green: '#5ad86a', me: '#7fd8ff' };
/** 밤에 창문·횃불·가로등 둘레를 밝히는 따뜻한 빛(미리 그려 둔다) */
const glowImage = () => sprite('glow', 64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,214,120,0.9)');
  g.addColorStop(0.4, 'rgba(255,170,70,0.35)');
  g.addColorStop(1, 'rgba(255,150,50,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
});
const GLOW_KINDS = new Set(['window', 'torch', 'light', 'lava']);
const MAX_PARTICLES = 90;

/** 화면에 보이는 크기를 정수 배율로 맞춰 또렷하게 그리는 렌더러 */
export function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let scale = 1; // 게임 픽셀 1칸이 화면(장치) 픽셀 몇 칸인가(정수)
  let viewW = 0;
  let viewH = 0;
  /** 폰처럼 좁은 화면: 십자키가 가장자리를 가리지 않게 카메라가 지도 끝 너머로 조금 더 간다 */
  let pad = 0;
  let cam = { x: 0, y: 0, map: '' };
  let lastTime = 0;
  const parts: Particle[] = [];
  let weatherAcc = 0;

  /** 컨테이너 css 크기에서 정수 배율을 고른다: 가로 15 x 세로 11 타일에 가깝게 */
  function resize(cssW: number, cssH: number, dpr: number) {
    const css = Math.max(1, Math.round(Math.min(cssW / (TILE * 15), cssH / (TILE * 11))));
    scale = Math.max(1, Math.round(css * dpr));
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    viewW = Math.ceil(canvas.width / scale);
    viewH = Math.ceil(canvas.height / scale);
    const small = typeof matchMedia === 'function' && matchMedia('(hover: none), (max-width: 760px)').matches;
    pad = small ? TILE * 3 : 0;
  }

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  function emit(kind: ParticleKind, x: number, y: number, region: RegionId = 'meadow') {
    const add = (p: Partial<Particle>) => {
      if (parts.length >= MAX_PARTICLES) parts.shift();
      parts.push({ x, y, vx: 0, vy: 0, life: 0, max: 500, color: '#fff', size: 2, g: 0, ...p });
    };
    if (kind === 'leaf') {
      const cols = region === 'snow' ? ['#ffffff', '#5f9a84'] : region === 'desert' ? ['#c2a04a', '#f2dc80'] : region === 'volcano' ? ['#6a3a30', '#ff8a3a'] : ['#3f9a3a', '#8fe07a'];
      for (let k = 0; k < 5; k += 1) add({ x: x + rand(6, 26), y: y + rand(8, 20), vx: rand(-0.05, 0.05), vy: rand(-0.12, -0.05), g: 0.0004, max: rand(350, 550), color: cols[k % 2], size: 2 });
    } else if (kind === 'dust') {
      const col = region === 'snow' ? '#ffffff' : region === 'volcano' ? '#8a7670' : region === 'desert' ? '#f2dfaa' : '#e8cd96';
      for (let k = 0; k < 3; k += 1) add({ x: x + rand(8, 24), y: y + 28, vx: rand(-0.03, 0.03), vy: rand(-0.03, -0.01), max: rand(250, 380), color: col, size: 3 });
    } else if (kind === 'poof') {
      for (let k = 0; k < 10; k += 1) { const a = (k / 10) * Math.PI * 2; add({ x: x + 16, y: y + 18, vx: Math.cos(a) * 0.07, vy: Math.sin(a) * 0.05, max: 420, color: k % 2 ? '#ffffff' : '#dfe6ee', size: 4 }); }
    } else if (kind === 'sparkle') {
      for (let k = 0; k < 6; k += 1) add({ x: x + rand(4, 28), y: y + rand(2, 26), vx: 0, vy: -0.03, max: 600, color: k % 2 ? '#fff6a0' : '#ffffff', size: 2 });
    } else {
      add({ x: x + 16, y: y - 4, vx: 0, vy: -0.03, max: 900, color: '#f2557a', size: 0 });
    }
  }

  function draw(s: Scene) {
    const dt = Math.max(0, Math.min(50, s.time - lastTime));
    lastTime = s.time;
    const mw = mapWidth(s.map) * TILE;
    const mh = mapHeight(s.map) * TILE;
    const target = (p: number, view: number, size: number) => {
      const lo = -pad;
      const hi = size - view + pad;
      return hi < lo ? Math.floor((size - view) / 2) : Math.max(lo, Math.min(hi, p));
    };
    const tx = target(s.player.px + TILE / 2 - viewW / 2, viewW, mw);
    const ty = target(s.player.py + TILE / 2 - viewH / 2, viewH, mh);
    // 부드러운 카메라: 지도를 바꾸거나 멀리 떨어지면 바로 붙는다
    if (cam.map !== s.map.id || Math.abs(cam.x - tx) > TILE * 4 || Math.abs(cam.y - ty) > TILE * 4) {
      cam = { x: tx, y: ty, map: s.map.id };
      parts.length = 0;
    } else {
      const k = 1 - Math.pow(0.0001, dt / 1000);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      if (Math.abs(tx - cam.x) < 0.5) cam.x = tx;
      if (Math.abs(ty - cam.y) < 0.5) cam.y = ty;
    }
    const camX = Math.round(cam.x);
    const camY = Math.round(cam.y);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const tiles = tilesOf(s.map);
    const W = mapWidth(s.map);
    const H = mapHeight(s.map);
    const outdoor = OUTDOOR.has(s.map.id);
    const wave = Math.floor(s.time / 500) % 2;
    const slow = Math.floor(s.time / 850) % 2;
    const frameOf = (t: number) => {
      const k = kindOf(t);
      return k === 'tree' || k === 'flower' || k === 'tall' || k === 'light' ? slow : wave;
    };
    const tileAtPx = (tx2: number, ty2: number) => tiles[ty2]?.[tx2];
    const x0 = Math.floor(camX / TILE);
    const y0 = Math.floor(camY / TILE);
    const x1 = Math.floor((camX + viewW) / TILE);
    const y1 = Math.floor((camY + viewH) / TILE);
    const night = outdoor && s.tint ? s.tint.a : 0;
    const glows: { x: number; y: number; k: string }[] = [];
    for (let ty2 = y0; ty2 <= y1; ty2 += 1) {
      for (let tx2 = x0; tx2 <= x1; tx2 += 1) {
        const inside = tx2 >= 0 && ty2 >= 0 && tx2 < W && ty2 < H;
        // 바깥 지도는 가장자리 타일을 이어 그려 끝이 허공처럼 보이지 않게 한다
        if (!inside && !outdoor) continue;
        const cx = Math.max(0, Math.min(W - 1, tx2));
        const cy = Math.max(0, Math.min(H - 1, ty2));
        const t = tiles[cy][cx];
        const seed = (((tx2 * 7 + ty2 * 13) % 4) + 4) % 4;
        ctx.drawImage(tileImage(t, frameOf(t), s.map.region, seed), tx2 * TILE - camX, ty2 * TILE - camY);
        if (night > 0.12 && inside && GLOW_KINDS.has(kindOf(t))) glows.push({ x: tx2, y: ty2, k: kindOf(t) });
      }
    }

    // 숨은 물건: 땅에서 반짝
    for (const it of s.items ?? []) {
      const ph = (s.time / 700 + it.x * 0.37 + it.y * 0.21) % 1;
      if (ph > 0.55) continue;
      const a = Math.sin((ph / 0.55) * Math.PI);
      const cx = it.x * TILE - camX + 16;
      const cy = it.y * TILE - camY + 18;
      const r = Math.round(2 + a * 4);
      ctx.fillStyle = `rgba(255,250,200,${0.5 + a * 0.5})`;
      ctx.fillRect(cx - r, cy, r * 2 + 1, 1);
      ctx.fillRect(cx, cy - r, 1, r * 2 + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
    }

    // 사람과 오디를 아래쪽부터(앞이 위에 겹치게)
    type Drawable = { py: number; paint(): void; px: number; isMon?: boolean };
    const list: Drawable[] = [];
    const breath = Math.floor(s.time / 650) % 2;
    const person = (a: Actor, isPlayer: boolean) => list.push({
      py: a.py, px: a.px, paint: () => {
        const sx = Math.round(a.px) - camX;
        const sy = Math.round(a.py) - camY - 4 + (isPlayer && a.frame === 0 ? breath : 0);
        ctx.drawImage(charImage(a), sx, sy);
        if (a.bubble) bubble(sx + SPRITE_W / 2, sy - 2, 'notice');
      },
    });
    const mon = (m: MonActor) => list.push({
      py: m.py - 0.5, px: m.px, isMon: true, paint: () => {
        const sc = m.scale ?? 1;
        if (sc <= 0) return;
        const sx = Math.round(m.px) - camX;
        const sy = Math.round(m.py) - camY;
        const hop = Math.round(Math.sin(m.hop * Math.PI) * 6);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        const sw = Math.round((16 - hop) * sc);
        ctx.fillRect(sx + 16 - sw / 2, sy + 27, sw, 3);
        ctx.fillRect(sx + 16 - sw / 2 + 2, sy + 26, sw - 4, 5);
        const size = Math.round(MON_PX * sc);
        if (m.strong) {
          // 강한 야생 오디: 발밑에서 붉은 기운이 일렁인다
          const pulse = 0.35 + 0.2 * Math.sin(s.time / 180);
          ctx.fillStyle = `rgba(255,70,40,${pulse})`;
          ctx.beginPath();
          ctx.ellipse(sx + 16, sy + 22 - hop / 2, 18 * sc, 14 * sc, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const img = monImage(m.speciesId, m.dir === 'right', m.shiny);
        ctx.drawImage(img, sx + 16 - size / 2, sy + 30 - size - hop, size, size);
        const top = sy + 30 - size - hop - 2;
        if (m.bubble) bubble(sx + 16, top, m.bubble);
        else if (m.level !== undefined && sc > 0.9) levelTag(sx + 16, top + 4, m.level, m.tag ?? 'yellow', !!m.shiny);
      },
    });
    // 낚싯줄과 찌: 사람보다 먼저(물 위) 그린다
    const fish = s.fishing;
    if (fish) {
      const hx = Math.round(s.player.px) - camX + SPRITE_W / 2 + (s.player.dir === 'left' ? -8 : s.player.dir === 'right' ? 8 : 4);
      const hy = Math.round(s.player.py) - camY + (s.player.dir === 'down' ? 18 : 6);
      const k = Math.min(1, fish.cast);
      const dip = fish.bite ? 3 + Math.round(Math.sin(s.time / 60) * 2) : Math.round(Math.sin(s.time / 400));
      const bx = Math.round(hx + (fish.x * TILE + 16 - camX - hx) * k);
      const by = Math.round(hy + (fish.y * TILE + 16 - camY - hy) * k - Math.sin(k * Math.PI) * 18) + (k >= 1 ? dip : 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx + 0.5, hy + 0.5);
      ctx.quadraticCurveTo((hx + bx) / 2, Math.min(hy, by) - 10, bx + 0.5, by + 0.5);
      ctx.stroke();
      if (k >= 1) {
        // 물결: 입질이면 크고 빠르게
        const ph = (s.time / (fish.bite ? 250 : 900)) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`;
        ctx.beginPath();
        ctx.ellipse(bx, by + 3, 4 + ph * (fish.bite ? 12 : 7), 2 + ph * (fish.bite ? 5 : 3), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 2, by - 3, 5, 3);
      ctx.fillStyle = '#e8484f';
      ctx.fillRect(bx - 2, by, 5, 3);
    }

    for (const n of s.npcs) person(n, false);
    person(s.player, true);
    for (const m of s.mons ?? []) mon(m);
    if (s.follower) mon(s.follower);
    list.sort((a, b) => a.py - b.py);
    for (const d of list) d.paint();

    // 풀숲 속에 선 사람·오디는 아랫도리가 풀에 가려진다
    const grassCover = (px: number, py: number) => {
      const gx = Math.round(px / TILE);
      const gy = Math.round(py / TILE);
      const t = tileAtPx(gx, gy);
      if (t === undefined || kindOf(t) !== 'tall' || Math.abs(px - gx * TILE) > 6 || Math.abs(py - gy * TILE) > 6) return;
      const seed = (gx * 7 + gy * 13) % 4;
      ctx.drawImage(tileImage(t, frameOf(t), s.map.region, seed), 0, 20, TILE, 12, gx * TILE - camX, gy * TILE - camY + 20, TILE, 12);
    };
    for (const d of list) if (!d.isMon) grassCover(d.px, d.py); // 오디는 풀에 가리지 않아야 잘 보인다

    // 날씨: 설원 눈송이, 화산 불티(바깥 지도만)
    if (outdoor && (s.map.region === 'snow' || s.map.region === 'volcano')) {
      weatherAcc += dt;
      const every = s.map.region === 'snow' ? 70 : 160;
      while (weatherAcc > every) {
        weatherAcc -= every;
        if (parts.length >= MAX_PARTICLES) break;
        if (s.map.region === 'snow') {
          parts.push({ x: camX + rand(-20, viewW + 20), y: camY - 6, vx: rand(-0.012, 0.012), vy: rand(0.025, 0.05), life: 0, max: 9000, color: '#ffffff', size: Math.random() < 0.3 ? 3 : 2, g: 0 });
        } else {
          parts.push({ x: camX + rand(0, viewW), y: camY + viewH + 4, vx: rand(-0.01, 0.01), vy: rand(-0.05, -0.025), life: 0, max: 6000, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd25a', size: 2, g: 0 });
        }
      }
    }
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i];
      p.life += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt + (p.max > 5000 ? Math.sin((s.time + i * 300) / 600) * 0.15 : 0);
      p.y += p.vy * dt;
      if (p.life >= p.max || p.y > camY + viewH + 40 || p.y < camY - 60) { parts.splice(i, 1); continue; }
      const a = p.max > 5000 ? 0.85 : 1 - p.life / p.max;
      const sx = Math.round(p.x - camX);
      const sy = Math.round(p.y - camY);
      if (p.size === 0) { heart(sx, sy, a); continue; }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx, sy, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    // 화산: 아지랑이처럼 붉은 기운
    if (outdoor && s.map.region === 'volcano') {
      ctx.fillStyle = `rgba(255,90,30,${0.05 + 0.03 * Math.sin(s.time / 900)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // 낮과 밤: 바깥 지도에만 은은하게. 밤엔 창문·횃불이 빛난다
    if (outdoor && s.tint && s.tint.a > 0) {
      ctx.fillStyle = `rgba(${s.tint.r},${s.tint.g},${s.tint.b},${s.tint.a})`;
      ctx.fillRect(0, 0, viewW, viewH);
      if (glows.length) {
        const k = Math.min(1, (night - 0.12) / 0.25);
        ctx.globalCompositeOperation = 'lighter';
        for (const g of glows) {
          const flick = g.k === 'torch' || g.k === 'lava' ? 0.8 + 0.2 * Math.sin(s.time / 90 + g.x * 3 + g.y) : 1;
          ctx.globalAlpha = (g.k === 'lava' ? 0.25 : 0.55) * k * flick;
          ctx.drawImage(glowImage(), g.x * TILE - camX - 16, g.y * TILE - camY - 16);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash})`; ctx.fillRect(0, 0, viewW, viewH); }
    if (s.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${s.fade})`; ctx.fillRect(0, 0, viewW, viewH); }
  }

  function heart(x: number, y: number, a: number) {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#2b2024';
    ctx.fillRect(x - 5, y - 3, 11, 6); ctx.fillRect(x - 4, y + 3, 9, 2); ctx.fillRect(x - 2, y + 5, 5, 2);
    ctx.fillStyle = '#f2557a';
    ctx.fillRect(x - 4, y - 2, 4, 4); ctx.fillRect(x + 1, y - 2, 4, 4); ctx.fillRect(x - 3, y + 2, 7, 2); ctx.fillRect(x - 1, y + 4, 3, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 3, y - 1, 1, 1);
    ctx.globalAlpha = 1;
  }

  /** 머리 위 작은 "Lv.N" 표: 어두운 반투명 알약, 흰 글씨, 왼쪽 점 색이 강함(빨강·노랑·초록) */
  function levelTag(cx: number, bottom: number, level: number, tag: LevelTag | 'me', shiny: boolean) {
    const text = `${shiny ? '✦' : ''}Lv.${level}`;
    ctx.font = 'bold 7px system-ui, sans-serif';
    const w = Math.ceil(ctx.measureText(text).width) + 11;
    const h = 10;
    const x = Math.round(cx - w / 2);
    const y = bottom - h;
    ctx.fillStyle = 'rgba(20,22,28,0.72)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 5); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.fillStyle = TAG_COLOR[tag];
    ctx.beginPath();
    ctx.arc(x + 5, y + h / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shiny ? '#fff3a0' : '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 8.5, y + h / 2 + 0.5);
  }

  /** 머리 위 말풍선(픽셀로 그린다): "!" 또는 하트 */
  function bubble(cx: number, bottom: number, kind: 'notice' | 'heart') {
    const x = cx - 7;
    const y = bottom - 16;
    ctx.fillStyle = '#2b2024';
    ctx.fillRect(x, y, 14, 16);
    ctx.fillRect(cx - 2, y + 16, 4, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 1, y + 1, 12, 14);
    ctx.fillRect(cx - 1, y + 15, 2, 3);
    if (kind === 'heart') {
      ctx.fillStyle = '#f2557a';
      ctx.fillRect(x + 3, y + 5, 3, 3); ctx.fillRect(x + 8, y + 5, 3, 3); ctx.fillRect(x + 3, y + 7, 8, 2); ctx.fillRect(x + 4, y + 9, 6, 1); ctx.fillRect(x + 5, y + 10, 4, 1); ctx.fillRect(x + 6, y + 11, 2, 1);
      return;
    }
    ctx.fillStyle = '#d94f3d';
    ctx.fillRect(cx - 1, y + 3, 2, 6);
    ctx.fillRect(cx - 1, y + 11, 2, 2);
  }

  return { resize, draw, emit };
}
