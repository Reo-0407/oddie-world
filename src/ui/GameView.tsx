import { useEffect, useRef, useState } from 'react';
import { START_LEVEL, TOWN_START, type SaveData } from '../game/save.ts';
import { markCaught } from '../game/dex.ts';
import { speciesById } from '../data/index.ts';
import { getMap } from '../overworld/maps/index.ts';
import type { HiddenItem, MapData, Npc } from '../overworld/maps/types.ts';
import { createRenderer, type Actor, type MonActor } from '../overworld/render.ts';
import { PLAYER_LOOKS } from '../overworld/sprites.ts';
import { kindOf, TILE } from '../overworld/tiles.ts';
import {
  DELTA, STEP_MS, canStep, exitOf, facingTile, gateOpen, hiddenItems, interactTarget, itemFlag, noticed, npcInSight, npcLines, placeNpcs,
  progressOf, spawnOf, spawnWild, stepPlayer, tileAt, wildCap, wildStep, type Dir, type PlayerState, type WildMon,
} from '../overworld/world.ts';
import { rollWild } from '../overworld/encounters.ts';
import type { RegionId } from '../overworld/regions.ts';
import { Dialog, type DialogControl } from './Dialog.tsx';
import { GameMenu, type MenuActions } from './GameMenu.tsx';
import { ShopPanel } from './ShopPanel.tsx';
import { StarterScreen } from './StarterScreen.tsx';
import { jingle, sfx } from '../audio/audio.ts';

export interface EncounterInfo { speciesId: number; level: number; region: RegionId }

interface Props {
  data: SaveData;
  onData(next: SaveData): void;
  onEncounter(info: EncounterInfo): void;
  onTrainer(npcId: string): void;
  /** 처음 그릴 때 보여 줄 대화(전투 결과 등) */
  message?: { speaker?: string; pages: string[] } | null;
  /** 둥근 메뉴 버튼 안의 항목들 */
  menu: MenuActions;
}

interface NpcRt extends Npc {
  anim: { fx: number; fy: number; t: number } | null;
  bubble: boolean;
}

interface DialogSpec {
  key: number;
  speaker?: string;
  pages: string[];
  choices?: string[];
  after(choice?: number): void;
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};
const A_KEYS = new Set(['KeyZ', 'Enter', 'Space']);
const B_KEYS = new Set(['KeyX', 'Escape']);
const FADE_MS = 150;
const FLASH_MS = 380;

const cloneNpcs = (map: MapData, data: SaveData): NpcRt[] => placeNpcs(map, progressOf(data)).map((n) => ({ ...n, anim: null, bubble: false }));
const HEAL_MS = 900;

type Anim = { fx: number; fy: number; t: number };
/** 필드 위 야생 오디 한 마리의 실행 상태 */
interface WildRt { mon: WildMon; anim: Anim | null; wait: number; seen: boolean; bubble: number; appear: number; leaving: number }
const GIFT_NAME: Record<HiddenItem['gift'], string> = { rope: '로프', sturdy: '튼튼한 로프', potion: '회복약', coins: '코인' };
const HAPPY = ['은(는) 기분이 좋아 보인다!', '은(는) 신나서 깡충 뛰었다!', '이(가) 너에게 꼭 붙어 왔다.', '은(는) 다음 모험이 기대되나 보다!'];
const WILD_STEP_MS = 260;
/** 박사가 스타터와 함께 주는 로프 */
export const LAB_ROPES = 5;

/** 위에서 내려다보는 2D 월드: 캔버스 + 키보드/터치 조작 + 대화 상자 */
export function GameView({ data, onData, onEncounter, onTrainer, message, menu }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const control = useRef<DialogControl | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const cb = useRef({ onData, onEncounter, onTrainer });
  cb.current = { onData, onEncounter, onTrainer };
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const [mapName, setMapName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<null | 'shop' | 'starter'>(null);
  const menuRef = useRef(false);
  menuRef.current = menuOpen || overlay !== null;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const firstMessage = useRef(message);
  const api = useRef<{ press(d: Dir): void; release(d: Dir): void; a(): void; say(pages: string[], speaker?: string): void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const renderer = createRenderer(canvas);
    const fit = () => renderer.resize(wrap.clientWidth, wrap.clientHeight, window.devicePixelRatio || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const start = dataRef.current;
    // 저장된 칸에 설 수 없으면(지도가 바뀌었거나 망가진 저장) 부활 지점이나 마을 시작점으로
    const player: PlayerState = spawnOf(start, start.respawn, TOWN_START, getMap, progressOf(start));
    let map: MapData = getMap(player.map)!;
    let npcs = cloneNpcs(map, start);
    const look = PLAYER_LOOKS[start.characterIndex % PLAYER_LOOKS.length];
    setMapName(map.name);

    const rt = {
      time: 0, anim: null as null | { fx: number; fy: number; t: number }, parity: 0, cooldown: 0,
      pending: null as null | { warp?: PlayerState; encounter?: boolean },
      fade: null as null | { t: number; dest: PlayerState; switched: boolean },
      flash: null as null | { t: number; info: EncounterInfo },
      heal: null as null | { t: number; done(): void },
      ev: null as null | { npc: NpcRt; phase: 'bubble' | 'walk'; t: number },
      held: [] as Dir[],
      triggered: new Set<string>(),
      dialogOpen: false,
      wild: [] as WildRt[],
      wildId: 0,
      respawn: 0,
      /** 따라오는 내 첫 오디: 플레이어와 같은 칸이면 숨는다(문으로 막 들어왔을 때) */
      follower: { x: player.x, y: player.y, dir: player.facing as Dir, anim: null as Anim | null, heart: 0 },
      idleTurn: 2500,
      /** 전투로 넘어가는 중: 더 걷지 않는다 */
      locked: false,
      key: 0,
    };

    const persist = () => {
      const d = dataRef.current;
      if (d.map === player.map && d.x === player.x && d.y === player.y && d.facing === player.facing) return;
      const next = { ...d, map: player.map, x: player.x, y: player.y, facing: player.facing };
      dataRef.current = next;
      cb.current.onData(next);
    };

    const closeDialog = () => { rt.dialogOpen = false; setDialog(null); };
    const openDialog = (spec: Omit<DialogSpec, 'key' | 'after'> & { after?: DialogSpec['after'] }) => {
      rt.dialogOpen = true;
      rt.key += 1;
      setDialog({ ...spec, after: spec.after ?? (() => closeDialog()), key: rt.key });
    };
    /** 대화 상자를 닫고 after를 부른다. after가 새 대화를 열면 그대로 유지 */
    const finish = (after?: (c?: number) => void) => (c?: number) => {
      closeDialog();
      after?.(c);
    };

    const loadMap = (dest: PlayerState) => {
      map = getMap(dest.map)!;
      Object.assign(player, dest);
      npcs = cloneNpcs(map, dataRef.current);
      rt.triggered.clear();
      rt.wild = [];
      rt.respawn = 0;
      Object.assign(rt.follower, { x: player.x, y: player.y, dir: player.facing, anim: null, heart: 0 });
      fillWild(true);
      setMapName(map.name);
      persist();
    };

    const blocked = (x: number, y: number) => !canStep(map, npcs, x, y);

    // ---------- 눈에 보이는 야생 오디 ----------
    const wildTaken = (except?: WildRt) => [
      ...rt.wild.filter((w) => w !== except).map((w) => w.mon), ...npcs, { x: rt.follower.x, y: rt.follower.y },
    ];
    const addWild = (minDist: number) => {
      const p = spawnWild(map, [...wildTaken(), player], player, Math.random, minDist);
      if (!p) return;
      const roll = rollWild(map.region, Math.random);
      rt.wildId += 1;
      rt.wild.push({
        mon: { id: rt.wildId, speciesId: roll.speciesId, level: roll.level, x: p.x, y: p.y, facing: 'down', bold: Math.random() < 0.3 },
        anim: null, wait: 400 + Math.random() * 1600, seen: false, bubble: 0, appear: 0, leaving: 0,
      });
      renderer.emit('poof', p.x * TILE, p.y * TILE);
    };
    function fillWild(first: boolean) {
      if (dataRef.current.team.length === 0) return;
      for (let k = rt.wild.length; k < wildCap(map); k += 1) addWild(first ? 4 : 6);
    }
    const startWildBattle = (w: WildRt) => {
      rt.wild = rt.wild.filter((o) => o !== w);
      rt.held = [];
      rt.flash = { t: 0, info: { speciesId: w.mon.speciesId, level: w.mon.level, region: map.region } };
    };
    const updateWild = (dt: number) => {
      for (const w of [...rt.wild]) {
        if (w.appear < 1) w.appear = Math.min(1, w.appear + dt / 300);
        if (w.bubble > 0) w.bubble -= dt;
        if (w.leaving > 0) {
          w.leaving -= dt;
          if (w.leaving <= 0) rt.wild = rt.wild.filter((o) => o !== w);
          continue;
        }
        if (w.anim) { w.anim.t += dt; if (w.anim.t >= WILD_STEP_MS) w.anim = null; continue; }
        // 화면 밖 멀리 벗어나면 펑 하고 사라졌다가 나중에 다른 곳에 나타난다
        if (Math.abs(w.mon.x - player.x) > 11 || Math.abs(w.mon.y - player.y) > 9) {
          w.leaving = 300;
          renderer.emit('poof', w.mon.x * TILE, w.mon.y * TILE);
          continue;
        }
        const see = noticed(w.mon, player);
        if (see && !w.seen) {
          w.seen = true; w.bubble = 700; w.wait = 700;
          w.mon.facing = player.x > w.mon.x ? 'right' : player.x < w.mon.x ? 'left' : player.y > w.mon.y ? 'down' : 'up';
        }
        if (!see) w.seen = false;
        w.wait -= dt;
        if (w.wait > 0) continue;
        w.wait = see ? 380 : 900 + Math.random() * 1800;
        if (!see && Math.random() < 0.35) continue; // 가만히 쉬기
        const r = wildStep(w.mon, map, wildTaken(w), player, Math.random);
        w.mon.facing = r.facing;
        if (r.touch && !rt.anim && dataRef.current.team.length > 0) {
          // 오디가 먼저 부딪쳐 왔다: 전투
          player.facing = OPPOSITE[r.facing];
          persist();
          startWildBattle(w);
          return;
        }
        if (r.moved) {
          w.anim = { fx: w.mon.x, fy: w.mon.y, t: 0 };
          w.mon.x = r.x; w.mon.y = r.y;
          const t = tileAt(map, r.x, r.y);
          if (t !== undefined && kindOf(t) === 'tall' && Math.random() < 0.5) renderer.emit('leaf', r.x * TILE, r.y * TILE, map.region);
        }
      }
      rt.respawn -= dt;
      if (rt.respawn <= 0) { rt.respawn = 2500 + Math.random() * 2500; fillWild(false); }
    };

    // ---------- 숨은 물건 ----------
    const pickItem = (x: number, y: number) => {
      const d = dataRef.current;
      const it = hiddenItems(map, d.flags).find((i) => i.x === x && i.y === y);
      if (!it) return false;
      const next: SaveData = { ...d, flags: [...d.flags, itemFlag(it.id)] };
      if (it.gift === 'rope') next.ropes = { ...d.ropes, basic: d.ropes.basic + it.n };
      else if (it.gift === 'sturdy') next.ropes = { ...d.ropes, sturdy: d.ropes.sturdy + it.n };
      else if (it.gift === 'potion') next.potions = d.potions + it.n;
      else next.coins = d.coins + it.n;
      setData(next);
      renderer.emit('sparkle', x * TILE, y * TILE);
      sfx('ding');
      rt.held = [];
      openDialog({ pages: [`반짝이는 곳에서 ${GIFT_NAME[it.gift]} ${it.n}개를 주웠다!`] });
      return true;
    };

    const setData = (next: SaveData) => { dataRef.current = next; cb.current.onData(next); };

    const fightTrainer = (id: string) => { rt.locked = true; cb.current.onTrainer(id); };

    const checkTrainers = () => {
      if (dataRef.current.team.length === 0) return;
      for (const n of npcs) {
        if (!n.trainer || dataRef.current.beaten.includes(n.id) || rt.triggered.has(n.id)) continue;
        if (npcInSight(n, player, n.trainer.sight, blocked)) {
          rt.triggered.add(n.id);
          n.bubble = true;
          rt.ev = { npc: n, phase: 'bubble', t: 0 };
          return;
        }
      }
    };

    const speak = (n: NpcRt) => {
      n.facing = OPPOSITE[player.facing];
      const beaten = dataRef.current.beaten.includes(n.id);
      if (n.trainer) {
        if (beaten) return openDialog({ speaker: n.name, pages: n.trainer.after });
        return openDialog({ speaker: n.name, pages: n.trainer.before, after: finish(() => { rt.triggered.add(n.id); fightTrainer(n.id); }) });
      }
      const p = progressOf(dataRef.current);
      const lines = npcLines(n, p);
      if (n.role === 'nurse') {
        return openDialog({
          speaker: n.name, pages: lines,
          after: finish(() => {
            jingle('heal');
            rt.heal = { t: 0, done: () => {
              const out = exitOf(map);
              if (out) setData({ ...dataRef.current, respawn: out });
              openDialog({ speaker: n.name, pages: ['오디들이 모두 건강해졌어요!', '쓰러지면 이 오디 센터 앞에서 다시 시작해요. 또 오세요!'] });
            } };
          }),
        });
      }
      if (n.role === 'clerk') return openDialog({ speaker: n.name, pages: lines, after: finish(() => { rt.held = []; setOverlay('shop'); }) });
      if (n.role === 'professor' && !p.flags.includes('starter')) {
        return openDialog({ speaker: n.name, pages: lines, after: finish(() => { rt.held = []; setOverlay('starter'); }) });
      }
      const ch = n.choice;
      openDialog({
        speaker: n.name, pages: lines, choices: ch?.options,
        after: finish((c) => { if (ch && c !== undefined) openDialog({ speaker: n.name, pages: ch.replies[c], after: finish() }); }),
      });
    };

    const idle = () => !rt.locked && !rt.anim && !rt.fade && !rt.flash && !rt.heal && !rt.ev && !rt.dialogOpen && !menuRef.current;

    const pressA = () => {
      if (rt.dialogOpen) return control.current?.press();
      if (!idle()) return;
      const f = facingTile(player);
      const lead = dataRef.current.team[0];
      if (lead && rt.follower.x === f.x && rt.follower.y === f.y && !(f.x === player.x && f.y === player.y)) {
        rt.follower.heart = 1400;
        rt.follower.dir = OPPOSITE[player.facing];
        renderer.emit('heart', f.x * TILE, f.y * TILE);
        sfx('blip');
        return openDialog({ pages: [`${speciesById(lead.speciesId).name}${HAPPY[Math.floor(Math.random() * HAPPY.length)]}`] });
      }
      if (pickItem(f.x, f.y)) return;
      const t = interactTarget(map, npcs, player);
      if (!t) return;
      if (t.type === 'sign') openDialog({ pages: [t.sign.text] });
      else speak(npcs.find((n) => n.id === t.npc.id)!);
    };

    const tryStep = (dir: Dir) => {
      // 야생 오디에게 걸어 들어가면 전투
      const ahead = { x: player.x + DELTA[dir].dx, y: player.y + DELTA[dir].dy };
      const hit = rt.wild.find((w) => w.leaving <= 0 && w.mon.x === ahead.x && w.mon.y === ahead.y);
      if (hit && dataRef.current.team.length > 0) {
        player.facing = dir;
        persist();
        startWildBattle(hit);
        return;
      }
      const from = { x: player.x, y: player.y };
      const r = stepPlayer(player, dir, map, npcs, Math.random, getMap);
      if (!r.moved) {
        player.facing = r.state.facing;
        rt.cooldown = 110;
        sfx('bump');
        persist();
        // 닫힌 문지기에게 부딪히면 말을 건다
        const f = facingTile(player);
        const gate = npcs.find((n) => n.gate && n.x === f.x && n.y === f.y && !gateOpen(n, progressOf(dataRef.current)));
        if (gate) { rt.held = []; speak(gate); }
        return;
      }
      rt.anim = { fx: player.x, fy: player.y, t: 0 };
      rt.parity ^= 1;
      if (!r.warped) {
        // 따라오는 오디는 내가 있던 칸으로
        const fo = rt.follower;
        fo.anim = { fx: fo.x, fy: fo.y, t: 0 };
        fo.dir = fo.x === from.x && fo.y === from.y ? dir : fo.x < from.x ? 'right' : fo.x > from.x ? 'left' : fo.y < from.y ? 'down' : 'up';
        fo.x = from.x; fo.y = from.y;
        const k = kindOf(tileAt(map, r.state.x, r.state.y)!);
        if (k === 'tall') renderer.emit('leaf', r.state.x * TILE, r.state.y * TILE, map.region);
        else if (k === 'path' || k === 'sand' || k === 'snow') renderer.emit('dust', from.x * TILE, from.y * TILE, map.region);
      }
      if (r.warped) {
        const f = { x: player.x + DELTA[dir].dx, y: player.y + DELTA[dir].dy };
        Object.assign(player, { x: f.x, y: f.y, facing: dir });
        rt.pending = { warp: r.state };
      } else {
        Object.assign(player, r.state);
        rt.pending = { encounter: r.encounter };
      }
    };

    const finishStep = () => {
      rt.anim = null;
      const p = rt.pending;
      rt.pending = null;
      if (p?.warp) { rt.fade = { t: 0, dest: p.warp, switched: false }; return; }
      persist();
      if (pickItem(player.x, player.y)) return;
      if (p?.encounter && dataRef.current.team.length > 0) {
        rt.flash = { t: 0, info: rollWild(map.region, Math.random) };
        return;
      }
      checkTrainers();
    };

    const updateEvent = (dt: number) => {
      const ev = rt.ev!;
      const n = ev.npc;
      if (ev.phase === 'bubble') {
        ev.t += dt;
        if (ev.t >= 650) { ev.phase = 'walk'; ev.t = 0; }
        return;
      }
      if (n.anim) {
        n.anim.t += dt;
        if (n.anim.t >= STEP_MS) n.anim = null;
        return;
      }
      const f = { x: n.x + DELTA[n.facing].dx, y: n.y + DELTA[n.facing].dy };
      if (f.x === player.x && f.y === player.y) {
        n.bubble = false;
        rt.ev = null;
        player.facing = OPPOSITE[n.facing];
        persist();
        openDialog({ speaker: n.name, pages: n.trainer!.before, after: finish(() => fightTrainer(n.id)) });
        return;
      }
      if (!canStep(map, npcs.filter((o) => o !== n), f.x, f.y)) {
        // 막히면 그 자리에서 싸움을 건다
        n.bubble = false;
        rt.ev = null;
        openDialog({ speaker: n.name, pages: n.trainer!.before, after: finish(() => fightTrainer(n.id)) });
        return;
      }
      n.anim = { fx: n.x, fy: n.y, t: 0 };
      n.x = f.x;
      n.y = f.y;
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.max(0, Math.min(50, now - last));
      last = now;
      rt.time += dt;

      if (rt.fade) {
        rt.fade.t += dt;
        if (rt.fade.t >= FADE_MS && !rt.fade.switched) { rt.fade.switched = true; loadMap(rt.fade.dest); }
        if (rt.fade.t >= FADE_MS * 2) rt.fade = null;
      } else if (rt.flash) {
        rt.flash.t += dt;
        if (rt.flash.t >= FLASH_MS) {
          const info = rt.flash.info;
          rt.flash = null;
          rt.locked = true;
          cb.current.onEncounter(info);
        }
      } else if (rt.heal) {
        rt.heal.t += dt;
        if (rt.heal.t >= HEAL_MS) { const h = rt.heal; rt.heal = null; h.done(); }
      } else if (rt.anim) {
        rt.anim.t += dt;
        if (!rt.dialogOpen && !menuRef.current) updateWild(dt);
        if (rt.anim && rt.anim.t >= STEP_MS && !rt.flash) finishStep();
      } else if (rt.ev) {
        updateEvent(dt);
      } else if (!rt.dialogOpen && !menuRef.current && !rt.locked) {
        rt.cooldown = Math.max(0, rt.cooldown - dt);
        updateWild(dt);
        const dir = rt.held[rt.held.length - 1];
        if (dir && rt.cooldown === 0 && !rt.flash) tryStep(dir);
      }

      const fo = rt.follower;
      if (fo.anim) { fo.anim.t += dt; if (fo.anim.t >= STEP_MS) fo.anim = null; }
      if (fo.heart > 0) fo.heart -= dt;
      // 평범한 마을 사람은 가끔 고개를 돌린다(트레이너·문지기·간호사·점원은 그대로)
      rt.idleTurn -= dt;
      if (rt.idleTurn <= 0) {
        rt.idleTurn = 2000 + Math.random() * 3000;
        const plain = rt.dialogOpen ? [] : npcs.filter((n) => !n.trainer && !n.gate && !n.role && !n.anim);
        const n = plain[Math.floor(Math.random() * plain.length)];
        if (n) n.facing = (['up', 'down', 'left', 'right'] as Dir[])[Math.floor(Math.random() * 4)];
      }

      const lerp = (x: number, y: number, a: { fx: number; fy: number; t: number } | null) => {
        const k = a ? Math.min(1, a.t / STEP_MS) : 1;
        return a ? { px: (a.fx + (x - a.fx) * k) * TILE, py: (a.fy + (y - a.fy) * k) * TILE } : { px: x * TILE, py: y * TILE };
      };
      const moving = rt.anim ? 1 + rt.parity : 0;
      const pp = lerp(player.x, player.y, rt.anim);
      const actor = (n: NpcRt): Actor => ({
        ...lerp(n.x, n.y, n.anim), look: n.look, dir: n.facing, frame: n.anim ? 1 + (Math.floor(n.anim.t / 90) % 2) : 0, bubble: n.bubble,
      });
      const fadeA = rt.fade ? (rt.fade.t < FADE_MS ? rt.fade.t / FADE_MS : Math.max(0, 2 - rt.fade.t / FADE_MS)) : 0;
      const flashA = rt.flash ? (Math.floor(rt.flash.t / 95) % 2 === 0 ? 0.85 : 0.1) : rt.heal ? 0.7 * Math.abs(Math.sin((rt.heal.t / HEAL_MS) * Math.PI * 3)) : 0;
      const mons: MonActor[] = rt.wild.map((w) => ({
        ...lerp(w.mon.x, w.mon.y, w.anim ? { ...w.anim, t: (w.anim.t / WILD_STEP_MS) * STEP_MS } : null),
        speciesId: w.mon.speciesId, dir: w.mon.facing, hop: w.anim ? Math.min(1, w.anim.t / WILD_STEP_MS) : 0,
        bubble: w.bubble > 0 ? 'notice' : null, scale: w.leaving > 0 ? w.leaving / 300 : w.appear,
      }));
      const lead = dataRef.current.team[0];
      const follower: MonActor | null = lead && (fo.x !== player.x || fo.y !== player.y || fo.anim) ? {
        ...lerp(fo.x, fo.y, fo.anim), speciesId: lead.speciesId, dir: fo.dir,
        hop: fo.anim ? Math.min(1, fo.anim.t / STEP_MS) : fo.heart > 0 ? (fo.heart % 350) / 350 : 0,
        bubble: fo.heart > 0 ? 'heart' : null,
      } : null;
      renderer.draw({
        map, time: rt.time, fade: Math.min(1, fadeA), flash: flashA,
        player: { ...pp, look, dir: player.facing, frame: moving },
        npcs: npcs.map(actor), mons, follower,
        items: hiddenItems(map, dataRef.current.flags),
      });
    };
    raf = requestAnimationFrame(loop);
    fillWild(true);
    if (firstMessage.current) openDialog({ ...firstMessage.current, after: finish() });

    const press = (d: Dir) => {
      if (rt.dialogOpen) { if (d === 'up' || d === 'down') control.current?.move(d); return; }
      rt.held = [...rt.held.filter((h) => h !== d), d];
    };
    const release = (d: Dir) => { rt.held = rt.held.filter((h) => h !== d); };
    api.current = { press, release, a: pressA, say: (pages, speaker) => openDialog({ speaker, pages }) };

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 메뉴·상점이 열려 있으면 키보드는 그 창의 버튼들이 쓴다. Esc/X만 닫기(스타터 고르기는 닫지 않는다)
      if (menuRef.current) {
        if (B_KEYS.has(e.code) && !e.repeat) {
          if (overlayRef.current === 'shop') { setOverlay(null); api.current?.say(['또 오세요!'], '점원'); }
          else if (overlayRef.current === null) { sfx('menuClose'); setMenuOpen(false); }
        }
        return;
      }
      // 포커스된 버튼은 Enter/Space를 스스로 처리한다
      if (t && t.tagName === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
      const dir = KEY_DIR[e.code];
      if (dir) {
        e.preventDefault();
        if (rt.dialogOpen && e.repeat) return;
        if (rt.dialogOpen) return void (dir === 'up' || dir === 'down' ? control.current?.move(dir) : undefined);
        press(dir);
      } else if (A_KEYS.has(e.code)) {
        e.preventDefault();
        if (!e.repeat) pressA();
      } else if (B_KEYS.has(e.code)) {
        e.preventDefault();
        if (e.repeat || rt.dialogOpen) return;
        if (idle()) { rt.held = []; sfx('menuOpen'); setMenuOpen(true); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { const dir = KEY_DIR[e.code]; if (dir) release(dir); };
    const onBlur = () => { rt.held = []; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      api.current = null;
    };
  }, []);

  const dpad = (dir: Dir, label: string, cls: string) => (
    <button
      type="button" className={`gv-btn ${cls}`} aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); api.current?.press(dir); }}
      onPointerUp={() => api.current?.release(dir)}
      onPointerCancel={() => api.current?.release(dir)}
      onLostPointerCapture={() => api.current?.release(dir)}
      onContextMenu={(e) => e.preventDefault()}
    >{label}</button>
  );

  return (
    <div className="gv" ref={wrapRef} onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="gv-canvas" onPointerDown={(e) => { e.preventDefault(); api.current?.a(); }} />
      <div key={mapName} className="gv-title">{mapName}</div>
      {dialog && (
        <Dialog
          key={dialog.key} speaker={dialog.speaker} pages={dialog.pages} choices={dialog.choices}
          onDone={dialog.after} control={control}
        />
      )}
      <div className="gv-pad" aria-label="십자키">
        {dpad('up', '▲', 'up')}{dpad('left', '◀', 'left')}{dpad('right', '▶', 'right')}{dpad('down', '▼', 'down')}
      </div>
      {!dialog && !menuOpen && (
        <button type="button" className="gv-menu-btn" aria-label="메뉴" data-nosfx onPointerDown={(e) => e.stopPropagation()} onClick={() => { sfx('menuOpen'); setMenuOpen(true); }}>
          <span />
        </button>
      )}
      {menuOpen && <GameMenu data={data} actions={menu} onData={(next) => { dataRef.current = next; onData(next); }} onClose={() => { sfx('menuClose'); setMenuOpen(false); }} />}
      {overlay === 'shop' && (
        <ShopPanel data={data} onBuy={(next) => { dataRef.current = next; onData(next); }} onClose={() => { setOverlay(null); api.current?.say(['또 오세요!'], '점원'); }} />
      )}
      {overlay === 'starter' && (
        <div className="gv-overlay" onPointerDown={(e) => e.stopPropagation()}>
          <StarterScreen onPick={(id) => {
            const d = dataRef.current;
            const next: SaveData = {
              ...d, team: [{ speciesId: id, level: START_LEVEL, exp: 0 }], playerLevel: START_LEVEL, dex: markCaught(d.dex, id),
              ropes: { ...d.ropes, basic: d.ropes.basic + LAB_ROPES }, flags: d.flags.includes('starter') ? d.flags : [...d.flags, 'starter'],
            };
            dataRef.current = next;
            onData(next);
            setOverlay(null);
            api.current?.say([`${speciesById(id).name}을(를) 받았다!`, `로프 ${LAB_ROPES}개도 받았다!`,
              '풀숲에서 야생 오디를 만나면 싸워서 이긴 다음 로프를 휙 던져 잡아 보렴.', '그럼, 멋진 모험을 떠나렴!'], '박사님');
          }} />
        </div>
      )}
    </div>
  );
}
