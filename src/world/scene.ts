import * as THREE from 'three';
import { MOVES, speciesById } from '../data/index.ts';
import type { BattleEvent, Status } from '../engine/types.ts';
import { fieldCatchChance, ropeSequence, type RopeKind, type RopeSequence } from '../game/capture.ts';
import { createBattlePokemon } from '../game/factory.ts';
import { gainExp } from '../game/growth.ts';
import { highestLevel, type OwnedOddie } from '../game/owned.ts';
import { autoSkirmish } from '../game/skirmish.ts';
import { TUTORIAL_HP_RATIO, tutorialWildLevel, withHpRatio } from '../game/tutorial.ts';
import { buildCharacter, CHARACTERS, disposeObject, loadCharacterModel, rigOf } from './characters.ts';
import type { CharacterRig } from './rig.ts';
import {
  clampToArea, distance, DUEL_RANGE, inputToWorld, keysToMove, NOTICE_RANGE, type Vec2,
} from './math.ts';
import { pixelRatioFor } from './device.ts';
import { MODEL_HEIGHT, OddieModels } from './oddieModels.ts';
import {
  blendHex, clampToMap, MAP_HALF, pickSpeciesForRegion, REGIONS, regionAt, regionWeights, START_POS, TOWN_POS,
  type RegionId, type SpawnCandidate,
} from './regions.ts';
import type { Ropes } from './save.ts';
import { MODEL_SPECIES_IDS, wildLevel } from './spawns.ts';
import { stepChase, stepWander, type WanderState } from './wander.ts';

const AREA_HALF = MAP_HALF; // 맵 한 변(120)의 절반
const WILD_COUNT = 26; // 동시에 있는 야생 오디 최대 수
const SPAWN_MIN = 9; // 플레이어 주변 이 거리 안쪽에는 새로 나타나지 않는다
const SPAWN_MAX = 34;
const DESPAWN_DIST = 56; // 이보다 멀어지면 사라지고 플레이어 주변에 다시 나타난다
const FAR_SKIP = 38; // 이보다 먼 오디는 움직임 계산을 건너뛴다(안개 속이라 안 보인다)
const PLAYER_SPEED = 4;
const RESPAWN_SECONDS = 10;
const GRACE_SECONDS = 3; // 전투에서 돌아온 직후엔 자동 결투를 잠시 막는다
const WILD_SCALE = 1.6; // 필드에서 야생 오디를 크게 보여 준다
const AGGRESSIVE_RATE = 0.4; // 이 비율의 야생 오디만 먼저 다가온다
const FIELD_RANGE = 8; // 필드 로프/출동 가능 거리
const BATTLE_GAP = 4.4;
const TOWN = TOWN_POS; // 마을 구역 중심 (상점, 회복소)
const TOWN_RADIUS = 9;
const ENTER_RANGE = 2.6;
const BUILDINGS: { kind: BuildingKind; x: number; z: number; label: string; wall: string; roof: string }[] = [
  { kind: 'shop', x: TOWN.x - 3.6, z: TOWN.z, label: '상점', wall: '#e8d4a8', roof: '#c0503a' },
  { kind: 'healer', x: TOWN.x + 3.6, z: TOWN.z, label: '회복소', wall: '#f4f0f0', roof: '#4a9a6a' },
]; // 전투 때 내 오디와 야생 오디 사이 거리

export interface WildInfo {
  key: number;
  speciesId: number;
  level: number;
  hpRatio: number;
  status: Status | null;
}

export type BuildingKind = 'shop' | 'healer';

export interface NearbyState {
  duel: boolean;
  /** 가까이 있는 건물 (들어가기 버튼) */
  building: BuildingKind | null;
  field: { name: string; level: number; hpPct: number } | null;
}

export interface SceneData {
  team: OwnedOddie[];
  ropes: Ropes;
  tutorialDone: boolean;
}

export interface SceneHooks {
  /** 결투가 시작됐다 (React가 전투 상태를 만든다) */
  duel(wild: WildInfo): void;
  nearby(state: NearbyState): void;
  spendRope(kind: RopeKind): void;
  /** 필드에서 로프로 잡았다 */
  caught(wild: WildInfo): void;
  /** 출동으로 야생 오디를 쓰러뜨려 선두 오디가 경험치를 받는다 */
  gainExp(exp: number, wild: WildInfo): void;
  toast(text: string): void;
  /** 이 종을 만났다 (필드 로프, 출동 때; 결투는 duel로 알린다) */
  seen(speciesId: number): void;
  /** 다른 구역에 들어갔다 */
  region(name: string): void;
}

/** 연출용 보정값: 위치 어긋남, 크기, 흔들림, 깜빡임 */
interface Fx {
  offX: number; offY: number; offZ: number;
  scale: number; shake: number; blink: number; hidden: boolean; tilt: number;
}

const newFx = (): Fx => ({ offX: 0, offY: 0, offZ: 0, scale: 1, shake: 0, blink: 0, hidden: false, tilt: 0 });

interface Wild {
  key: number;
  speciesId: number;
  level: number;
  hpRatio: number;
  status: Status | null;
  aggressive: boolean;
  state: WanderState;
  holder: THREE.Group;
  pivot: THREE.Group;
  marker: THREE.Object3D;
  alive: boolean;
  frozen: boolean;
  respawnAt: number;
  phase: number;
  token: number;
  fx: Fx;
}

interface Tween {
  t: number;
  dur: number;
  step: (progress: number) => void;
  resolve: () => void;
}

const SPAWN_CANDIDATES: SpawnCandidate[] = MODEL_SPECIES_IDS.map((id) => ({ id, types: speciesById(id).types }));

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function applyFx(holder: THREE.Object3D, x: number, z: number, fx: Fx, clock: number) {
  const jitter = fx.shake > 0 ? Math.sin(clock * 60) * fx.shake : 0;
  holder.position.set(x + fx.offX + jitter, fx.offY, z + fx.offZ);
  holder.scale.setScalar(Math.max(fx.scale, 0.001));
  holder.rotation.z = fx.tilt;
  holder.visible = !fx.hidden && !(fx.blink > 0 && Math.floor(clock * 16) % 2 === 0);
}

/** 3D 초원 월드와 필드 전투 연출. React와는 hooks/메서드로만 이야기한다 */
export class WorldScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  private models = new OddieModels();
  private disposables: { dispose(): void }[] = [];
  private tweens: Tween[] = [];
  private keys = new Set<string>();
  private camYaw = 0; // 카메라가 플레이어 둘레를 도는 각도 (드래그, Q/E)
  private dragId: number | null = null;
  private wilds: Wild[] = [];

  private playerRoot = new THREE.Group();
  private player = new THREE.Group();
  private playerPos: Vec2 = { ...START_POS };
  private skyColor = new THREE.Color('#bfe3f5');
  private region: RegionId | null = null;
  private playerHeading = Math.PI;
  private playerRig: CharacterRig | undefined;
  private walkPhase = 0;
  private walkBlend = 0;

  private allyHolder = new THREE.Group();
  private allyPivot = new THREE.Group();
  private allyFx = newFx();
  private allyPos: Vec2 = { x: 0, z: 0 };
  private allyToken = 0;

  private mode: 'explore' | 'battle' = 'explore';
  private busy = false; // 필드 로프 던지는 중
  private locked = false; // 상점·회복소 화면이 열려 있는 동안 멈춤
  private building: BuildingKind | null = null;
  private engaged: Wild | null = null;
  private duelTarget: Wild | null = null;
  private fieldTarget: Wild | null = null;
  private lastNearby = '';
  private ball: THREE.Object3D | null = null;
  private ballDisposables: { dispose(): void }[] = [];
  private arrowGeo: THREE.ConeGeometry;
  private arrowUp: THREE.MeshLambertMaterial;
  private arrowDown: THREE.MeshLambertMaterial;
  private input: Vec2 = { x: 0, z: 0 };
  private clock = 0;
  private grace = 0;
  private frame = 0;
  private last = performance.now();
  private disposed = false;
  private look = new THREE.Vector3(0, 1, 0);
  private observer: ResizeObserver;
  private projected = new THREE.Vector3();

  constructor(
    private container: HTMLElement,
    characterIndex: number,
    private getData: () => SceneData,
    private hooks: SceneHooks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(pixelRatioFor(window.devicePixelRatio, navigator.maxTouchPoints, window.innerWidth));
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.display = 'block';
    container.prepend(this.renderer.domElement);

    this.scene.background = this.skyColor;
    this.scene.fog = new THREE.Fog(this.skyColor, 14, 46);
    this.updateSky(1);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a8f4a', 1.6));
    const sun = new THREE.DirectionalLight('#fff3d6', 1.4);
    sun.position.set(8, 14, 6);
    this.scene.add(sun);

    this.buildWorld();
    this.buildTown();
    this.arrowGeo = this.track(new THREE.ConeGeometry(0.12, 0.3, 4));
    this.arrowUp = this.lambert('#3bb273');
    this.arrowDown = this.lambert('#e0523f');

    // 플레이어: 먼저 원시 도형 인간형, GLB가 오면 바꾼다
    const look = CHARACTERS[characterIndex] ?? CHARACTERS[0];
    let fallback: THREE.Object3D | null = buildCharacter(look);
    this.player.add(fallback);
    this.playerRoot.add(this.player);
    this.scene.add(this.playerRoot);
    void loadCharacterModel(look).then((model) => {
      if (this.disposed || !model) return;
      if (fallback) {
        this.player.remove(fallback);
        disposeObject(fallback);
        fallback = null;
      }
      this.player.add(model);
      this.playerRig = rigOf(model);
    });

    // 내 오디(전투 때만 보인다)
    this.allyHolder.add(this.allyPivot);
    this.allyHolder.visible = false;
    this.scene.add(this.allyHolder);

    const markerGeo = this.track(new THREE.ConeGeometry(0.18, 0.4, 4));
    const markerMat = this.lambert('#e0523f');
    for (let i = 0; i < WILD_COUNT; i += 1) {
      const holder = new THREE.Group();
      const pivot = new THREE.Group();
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.y = MODEL_HEIGHT * WILD_SCALE + 1.5;
      marker.rotation.x = Math.PI;
      holder.add(pivot, marker);
      this.scene.add(holder);
      const wild: Wild = {
        key: i, speciesId: 1, level: 1, hpRatio: 1, status: null, aggressive: false,
        state: { x: 0, z: 0, heading: 0, mode: 'idle', timer: 1 },
        holder, pivot, marker, alive: true, frozen: false, respawnAt: 0,
        phase: Math.random() * 6.28, token: 0, fx: newFx(),
      };
      this.rollWild(wild, i < 8);
      this.wilds.push(wild);
    }

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onDragStart);
    dom.addEventListener('pointermove', this.onDragMove);
    dom.addEventListener('pointerup', this.onDragEnd);
    dom.addEventListener('pointercancel', this.onDragEnd);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    this.camera.position.set(this.playerPos.x, 6.8, this.playerPos.z + 8.5);
    this.look.set(this.playerPos.x, 1.1, this.playerPos.z - 2.5);
    this.frame = requestAnimationFrame(this.tick);
  }

  // ---------- 외부에서 부르는 것 ----------

  setInput(vec: Vec2) { this.input = vec; }

  /** 미니맵용 */
  getPlayerPos(): Vec2 { return { ...this.playerPos }; }

  /** 상점·회복소 화면이 열려 있으면 멈춘다 */
  setLocked(locked: boolean) {
    this.locked = locked;
    if (locked) this.input = { x: 0, z: 0 };
    this.publishNearby(true);
  }

  /** 회복소 연출: 플레이어 주위로 초록 화살표가 솟는다 */
  healEffect() {
    this.arrowsAt(this.playerPos.x - 0.5, this.playerPos.z, true);
    this.arrowsAt(this.playerPos.x + 0.5, this.playerPos.z, true);
  }

  /** 가까운 야생 오디와 결투 */
  tryDuel() {
    if (this.duelTarget) this.startDuel(this.duelTarget);
  }

  /** 필드 로프: 전투 없이 시야 안 가장 가까운 오디에게 바로 던진다 */
  async fieldThrow() {
    const wild = this.fieldTarget;
    if (!wild || this.mode !== 'explore' || this.busy) return;
    const ropes = this.getData().ropes;
    const kind: RopeKind | null = ropes.basic > 0 ? 'basic' : ropes.sturdy > 0 ? 'sturdy' : null;
    if (!kind) {
      this.hooks.toast('로프가 없어!');
      return;
    }
    this.busy = true;
    wild.frozen = true;
    this.publishNearby();
    this.hooks.seen(wild.speciesId);
    this.hooks.spendRope(kind);
    const chance = fieldCatchChance(speciesById(wild.speciesId).rarity, wild.hpRatio, wild.status, kind);
    const from = new THREE.Vector3(this.playerPos.x, 1, this.playerPos.z);
    const success = await this.throwBall(from, wild, ropeSequence(chance));
    if (this.disposed) return;
    wild.frozen = false;
    this.busy = false;
    const info = this.infoOf(wild);
    if (success) {
      this.removeBall();
      this.vanish(wild);
      this.hooks.caught(info);
      return;
    }
    if (Math.random() < 0.5) {
      this.hooks.toast(`${speciesById(wild.speciesId).name}이(가) 도망쳤다!`);
      await this.shrink(wild);
      this.vanish(wild);
    } else {
      this.hooks.toast(`${speciesById(wild.speciesId).name}이(가) 화가 났다!`);
      this.startDuel(wild);
    }
  }

  /** 출동!: 내 선두 오디가 가까운 야생 오디와 자동으로 싸운다 */
  skirmish() {
    const wild = this.fieldTarget;
    if (!wild || this.mode !== 'explore' || this.busy) return;
    const lead = this.getData().team[0];
    if (!lead) return;
    this.hooks.seen(wild.speciesId);
    const mine = createBattlePokemon(speciesById(lead.speciesId), lead.level, MOVES);
    let foe = withHpRatio(createBattlePokemon(speciesById(wild.speciesId), wild.level, MOVES), wild.hpRatio);
    if (wild.status) foe = { ...foe, status: wild.status, sleepTurns: wild.status === 'sleep' ? 2 : 0 };
    const result = autoSkirmish(mine, foe, Math.floor(Math.random() * 2 ** 32));
    const allyName = mine.name;
    const wildName = foe.name;
    const faintedNote = result.playerFainted ? ` ${allyName}은(는) 쓰러졌지만 곧 회복했어.` : '';
    wild.fx.blink = 0.8;
    wild.fx.shake = 0.1;
    void this.tween(0.6, (p) => { wild.fx.shake = 0.1 * (1 - p); });
    if (result.wildFainted) {
      const info = this.infoOf(wild);
      const exp = gainExp(wild.level, speciesById(wild.speciesId).rarity);
      this.hooks.toast(`출동! ${allyName}이(가) ${wildName}을(를) 쓰러뜨렸다!${faintedNote}`);
      this.hooks.gainExp(exp, info);
      wild.frozen = true;
      void this.shrink(wild).then(() => { wild.frozen = false; this.vanish(wild); });
      return;
    }
    wild.hpRatio = Math.max(0.01, result.wildHpRatio);
    wild.status = result.wildStatus;
    this.hooks.toast(
      `출동! ${wildName} 체력 ${Math.round(wild.hpRatio * 100)}% 남음. 지금 로프를 던져 봐!${faintedNote}`,
    );
    this.publishNearby(true);
  }

  /** 전투 중 이벤트에 맞춘 연출 */
  battleEvent(event: BattleEvent) {
    const engaged = this.engaged;
    if (this.mode !== 'battle' || !engaged) return;
    const fxOf = (side: 0 | 1) => (side === 0 ? this.allyFx : engaged.fx);
    switch (event.t) {
      case 'move': void this.lunge(event.side); break;
      case 'damage': case 'confusionHit': case 'delayedHit': case 'statusDamage': case 'recoil':
        this.hit(fxOf(event.side)); break;
      case 'faint': void this.faint(fxOf(event.side), event.side === 1); break;
      case 'stage': this.arrows(event.side, event.delta > 0); break;
      case 'heal': this.arrows(event.side, true); break;
      case 'switch':
        if (event.side === 0) {
          const species = this.getData().team[event.teamIndex]?.speciesId;
          if (species !== undefined) this.showAlly(species);
        }
        break;
      default: break;
    }
  }

  /** 전투 중 로프 던지기 연출. 잡혔으면 true */
  playRope(seq: RopeSequence): Promise<boolean> {
    const engaged = this.engaged;
    if (this.mode !== 'battle' || !engaged) return Promise.resolve(seq.success);
    const from = new THREE.Vector3(this.allyPos.x, 1, this.allyPos.z);
    return this.throwBall(from, engaged, seq);
  }

  /** 전투 끝: 야생 오디는 사라지고 카메라가 돌아온다 */
  exitBattle() {
    if (this.mode !== 'battle') return;
    const wild = this.engaged;
    this.mode = 'explore';
    this.engaged = null;
    for (const other of this.wilds) if (other !== wild && other.alive) other.holder.visible = true;
    this.removeBall();
    this.allyHolder.visible = false;
    this.playerRoot.visible = true;
    this.grace = GRACE_SECONDS;
    if (wild) this.vanish(wild);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.onDragStart);
    this.renderer.domElement.removeEventListener('pointermove', this.onDragMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onDragEnd);
    this.renderer.domElement.removeEventListener('pointercancel', this.onDragEnd);
    this.removeBall();
    disposeObject(this.player);
    this.models.dispose(disposeObject);
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- 장면 만들기 ----------

  private track<T extends { dispose(): void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private lambert(color: string) {
    return this.track(new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }

  /** 한 종류의 장식을 InstancedMesh 부품들로 한꺼번에 세운다 (부품마다 오프셋이 있다) */
  private scatter(
    parts: { geo: THREE.BufferGeometry; mat: THREE.Material; x?: number; y: number; z?: number }[],
    placements: { x: number; z: number; s: number; ry: number }[],
  ) {
    if (placements.length === 0) return;
    const dummy = new THREE.Object3D();
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
      placements.forEach((p, i) => {
        const ox = (part.x ?? 0) * p.s;
        const oz = (part.z ?? 0) * p.s;
        const cos = Math.cos(p.ry);
        const sin = Math.sin(p.ry);
        dummy.position.set(p.x + ox * cos + oz * sin, part.y * p.s, p.z - ox * sin + oz * cos);
        dummy.rotation.set(0, p.ry, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.frustumCulled = false;
      this.track(mesh);
      this.scene.add(mesh);
    }
  }

  /** 구역 안의 무작위 자리들 (출발점과 마을은 비운다) */
  private spots(region: RegionId, count: number, scale: [number, number]) {
    const spots: { x: number; z: number; s: number; ry: number }[] = [];
    const margin = 3;
    for (let tries = 0; spots.length < count && tries < count * 6; tries += 1) {
      const x = (Math.random() * 2 - 1) * (MAP_HALF - margin);
      const z = (Math.random() * 2 - 1) * (MAP_HALF - margin);
      if (regionAt(x, z) !== region) continue;
      if (distance({ x, z }, START_POS) < 6) continue;
      if (distance({ x, z }, TOWN) < TOWN_RADIUS + 2) continue;
      spots.push({ x, z, s: scale[0] + Math.random() * (scale[1] - scale[0]), ry: Math.random() * Math.PI * 2 });
    }
    return spots;
  }

  /** 바닥(구역 색이 경계에서 섞인다), 구역별 장식, 맵 가장자리 산 */
  private buildWorld() {
    const size = MAP_HALF * 2 + 60;
    const segments = size / 2;
    const geometry = this.track(new THREE.PlaneGeometry(size, size, segments, segments));
    const position = geometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const [r, g, b] = blendHex(regionWeights(position.getX(i), -position.getY(i)), (info) => info.ground);
      color.setRGB(r, g, b, THREE.SRGBColorSpace);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geometry, this.track(new THREE.MeshLambertMaterial({ vertexColors: true })));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const trunk = { geo: this.track(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 6)), mat: this.lambert('#7a5232') };
    const rockGeo = this.track(new THREE.DodecahedronGeometry(0.8, 0));
    const rock = (color: string, y = 0.3) => ({ geo: rockGeo, mat: this.lambert(color), y });

    // 초원: 나무와 바위
    const leaf = this.track(new THREE.ConeGeometry(1.1, 2.4, 7));
    const meadowTrees = this.spots('meadow', 70, [0.8, 1.5]);
    const half = Math.ceil(meadowTrees.length / 2);
    this.scatter([{ ...trunk, y: 0.6 }, { geo: leaf, mat: this.lambert('#2f8f4e'), y: 2.2 }], meadowTrees.slice(0, half));
    this.scatter([{ ...trunk, y: 0.6 }, { geo: leaf, mat: this.lambert('#3aa35a'), y: 2.2 }], meadowTrees.slice(half));
    this.scatter([rock('#9a9a96')], this.spots('meadow', 18, [0.6, 1.4]));

    // 사막: 선인장과 사암
    const cactusBody = this.track(new THREE.CylinderGeometry(0.25, 0.3, 2.2, 8));
    const cactusArm = this.track(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8));
    const cactusLink = this.track(new THREE.BoxGeometry(0.5, 0.28, 0.28));
    const cactusMat = this.lambert('#4f9a4a');
    this.scatter([
      { geo: cactusBody, mat: cactusMat, y: 1.1 },
      { geo: cactusArm, mat: cactusMat, x: -0.55, y: 1.45 },
      { geo: cactusArm, mat: cactusMat, x: 0.55, y: 1.25 },
      { geo: cactusLink, mat: cactusMat, x: -0.3, y: 1.05 },
      { geo: cactusLink, mat: cactusMat, x: 0.3, y: 0.85 },
    ], this.spots('desert', 45, [0.8, 1.6]));
    this.scatter([rock('#c9a063')], this.spots('desert', 30, [0.7, 2]));

    // 설원: 눈 덮인 나무, 얼음 바위, 눈 더미
    const snowLeaf = this.track(new THREE.ConeGeometry(1.1, 2.4, 7));
    const snowCap = this.track(new THREE.ConeGeometry(0.75, 1.1, 7));
    this.scatter([
      { ...trunk, y: 0.6 },
      { geo: snowLeaf, mat: this.lambert('#2f6f58'), y: 2.2 },
      { geo: snowCap, mat: this.lambert('#ffffff'), y: 3.0 },
    ], this.spots('snow', 55, [0.8, 1.5]));
    this.scatter([rock('#bfe3f0', 0.4)], this.spots('snow', 16, [0.7, 1.8]));
    const mound = this.track(new THREE.SphereGeometry(1, 10, 6));
    this.scatter([{ geo: mound, mat: this.lambert('#ffffff'), y: 0 }], this.spots('snow', 30, [0.6, 1.8]));

    // 화산: 용암 바위, 흑요석 가시, 용암 웅덩이(은은하게 빛난다)
    this.scatter([rock('#3a3030', 0.4)], this.spots('volcano', 40, [0.7, 2]));
    const spike = this.track(new THREE.ConeGeometry(0.5, 2.2, 5));
    this.scatter([{ geo: spike, mat: this.lambert('#241c1c'), y: 1.1 }], this.spots('volcano', 28, [0.8, 1.8]));
    const pool = this.track(new THREE.CircleGeometry(1, 14));
    const lava = this.track(new THREE.MeshBasicMaterial({ color: '#ff6a2a' }));
    const pools = this.spots('volcano', 12, [1.6, 3]);
    const poolMesh = new THREE.InstancedMesh(pool, lava, pools.length);
    const dummy = new THREE.Object3D();
    pools.forEach((p, i) => {
      dummy.position.set(p.x, 0.04, p.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      poolMesh.setMatrixAt(i, dummy.matrix);
    });
    poolMesh.frustumCulled = false;
    this.track(poolMesh);
    this.scene.add(poolMesh);

    // 맵 둘레의 산 (넘어갈 수 없다는 표시)
    const ring: { x: number; z: number; s: number; ry: number }[] = [];
    for (let t = -MAP_HALF; t <= MAP_HALF; t += 9) {
      const edge = MAP_HALF + 10;
      for (const [x, z] of [[t, -edge], [t, edge], [-edge, t], [edge, t]]) ring.push({ x, z, s: 1.4 + Math.random() * 0.8, ry: 0 });
    }
    this.scatter([{ geo: this.track(new THREE.ConeGeometry(6, 12, 6)), mat: this.lambert('#7d8a8f'), y: 6 }], ring);
  }

  /** 마을: 흙바닥 위에 상점과 회복소. 간판 글자는 캔버스 텍스처 */
  private buildTown() {
    const ground = new THREE.Mesh(this.track(new THREE.CircleGeometry(TOWN_RADIUS, 20)), this.lambert('#dccb9b'));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(TOWN.x, 0.02, TOWN.z);
    this.scene.add(ground);

    const wallGeo = this.track(new THREE.BoxGeometry(4, 2.6, 3));
    const roofGeo = this.track(new THREE.ConeGeometry(3.3, 1.6, 4));
    const doorGeo = this.track(new THREE.BoxGeometry(1, 1.7, 0.1));
    const doorMat = this.lambert('#5a3a22');
    for (const b of BUILDINGS) {
      const group = new THREE.Group();
      const wall = new THREE.Mesh(wallGeo, this.lambert(b.wall));
      wall.position.y = 1.3;
      const roof = new THREE.Mesh(roofGeo, this.lambert(b.roof));
      roof.position.y = 3.4;
      roof.rotation.y = Math.PI / 4;
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(0, 0.85, 1.52);
      group.add(wall, roof, door, this.makeSign(b.label));
      group.position.set(b.x, 0, b.z);
      this.scene.add(group);
    }
  }

  private makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(20,24,30,0.72)';
      ctx.beginPath();
      ctx.roundRect(2, 6, 316, 52, 26);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 160, 33);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(3.6, 0.72, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private makeSign(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(0, 0, 256, 96);
      ctx.strokeStyle = '#23262b';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 248, 88);
      ctx.fillStyle = '#23262b';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 50);
    }
    const texture = this.track(new THREE.CanvasTexture(canvas));
    const sprite = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: texture })));
    sprite.scale.set(2.4, 0.9, 1);
    sprite.position.set(0, 3.9, 1.7);
    return sprite;
  }

  // ---------- 야생 오디 ----------

  private dress(wild: Wild, speciesId = wild.speciesId) {
    wild.pivot.clear();
    for (const old of wild.holder.children.filter((c) => c.name === 'label')) {
      wild.holder.remove(old);
      disposeObject(old);
    }
    const token = (wild.token += 1);
    void this.models.create(speciesId).then((object) => {
      if (this.disposed || wild.token !== token) return;
      object.scale.multiplyScalar(WILD_SCALE);
      wild.pivot.add(object);
      const label = this.makeLabel(`${speciesById(speciesId).name} Lv.${wild.level}`);
      label.name = 'label';
      label.visible = this.engaged !== wild;
      label.position.y = MODEL_HEIGHT * WILD_SCALE + 0.55;
      wild.holder.add(label);
    });
  }

  private rollWild(wild: Wild, near = false) {
    // 플레이어 주변(SPAWN_MIN~SPAWN_MAX)에서만 나타난다. 마을과 맵 밖은 피한다
    let x = this.playerPos.x;
    let z = this.playerPos.z;
    for (let tries = 0; tries < 12; tries += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = near ? 6 + Math.random() * 10 : SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const spot = clampToMap({ x: this.playerPos.x + Math.sin(angle) * radius, z: this.playerPos.z + Math.cos(angle) * radius });
      x = spot.x;
      z = spot.z;
      if (distance(spot, TOWN) >= TOWN_RADIUS + 2 && distance(spot, this.playerPos) >= (near ? 5 : SPAWN_MIN * 0.7)) break;
    }
    wild.speciesId = pickSpeciesForRegion(regionAt(x, z), SPAWN_CANDIDATES, Math.random);
    wild.level = wildLevel(highestLevel(this.getData().team, 10), Math.random);
    wild.hpRatio = 1;
    wild.status = null;
    wild.aggressive = Math.random() < AGGRESSIVE_RATE;
    wild.marker.visible = wild.aggressive;
    wild.alive = true;
    wild.frozen = false;
    wild.fx = newFx();
    wild.holder.visible = true;
    wild.state = { x, z, heading: Math.random() * 6.28, mode: 'idle', timer: Math.random() * 2 };
    this.dress(wild);
  }

  private vanish(wild: Wild) {
    wild.alive = false;
    wild.holder.visible = false;
    wild.respawnAt = this.clock + RESPAWN_SECONDS;
    if (this.duelTarget === wild) this.duelTarget = null;
    if (this.fieldTarget === wild) this.fieldTarget = null;
  }

  private infoOf(wild: Wild): WildInfo {
    return { key: wild.key, speciesId: wild.speciesId, level: wild.level, hpRatio: wild.hpRatio, status: wild.status };
  }

  private shrink(wild: Wild) {
    return this.tween(0.5, (p) => { wild.fx.scale = 1 - p; });
  }

  // ---------- 전투 ----------

  private startDuel(wild: Wild) {
    if (this.mode !== 'explore' || this.busy || !wild.alive) return;
    const data = this.getData();
    if (!data.tutorialDone) {
      // 첫 결투: 흔한 오디, 레벨-4, 체력 35%
      if (speciesById(wild.speciesId).rarity !== 'Common') {
        const commons = MODEL_SPECIES_IDS.filter((id) => speciesById(id).rarity === 'Common');
        wild.speciesId = pickRandom(commons.length > 0 ? commons : MODEL_SPECIES_IDS);
        this.dress(wild);
      }
      wild.level = tutorialWildLevel(highestLevel(data.team, 10));
      wild.hpRatio = TUTORIAL_HP_RATIO;
      wild.status = null;
    }
    this.mode = 'battle';
    for (const c of wild.holder.children) if (c.name === 'label') c.visible = false;
    for (const other of this.wilds) if (other !== wild) other.holder.visible = false; // 싸우는 동안 다른 야생 오디는 숨긴다
    this.engaged = wild;
    wild.marker.visible = false;
    wild.frozen = false;

    // 내 오디와 야생 오디가 마주 보는 자리
    const dx = wild.state.x - this.playerPos.x;
    const dz = wild.state.z - this.playerPos.z;
    const length = Math.hypot(dx, dz) || 1;
    const dir = { x: dx / length, z: dz / length };
    this.allyPos = { x: this.playerPos.x, z: this.playerPos.z };
    const target = clampToArea(
      { x: this.playerPos.x + dir.x * BATTLE_GAP, z: this.playerPos.z + dir.z * BATTLE_GAP }, AREA_HALF + 4,
    );
    const from = { x: wild.state.x, z: wild.state.z };
    void this.tween(0.5, (p) => {
      wild.state = { ...wild.state, mode: 'idle', x: from.x + (target.x - from.x) * p, z: from.z + (target.z - from.z) * p };
    });
    wild.state = { ...wild.state, heading: Math.atan2(-dir.x, -dir.z), mode: 'idle' };
    this.allyHolder.rotation.y = Math.atan2(dir.x, dir.z);

    this.playerRoot.visible = false;
    this.allyFx = newFx();
    this.allyHolder.visible = true;
    const lead = data.team[0];
    if (lead) this.showAlly(lead.speciesId);
    this.input = { x: 0, z: 0 };
    this.duelTarget = null;
    this.fieldTarget = null;
    this.lastNearby = '';
    this.hooks.nearby({ duel: false, building: null, field: null });
    this.hooks.duel(this.infoOf(wild));
  }

  private showAlly(speciesId: number) {
    const token = (this.allyToken += 1);
    this.allyPivot.clear();
    this.allyFx = newFx();
    this.allyFx.scale = 0.01;
    void this.tween(0.5, (p) => { this.allyFx.scale = Math.max(0.01, p); });
    void this.models.create(speciesId).then((object) => {
      if (this.disposed || this.allyToken !== token) return;
      object.scale.multiplyScalar(WILD_SCALE);
      this.allyPivot.add(object);
    });
  }

  private opposeDir(side: 0 | 1): Vec2 {
    const engaged = this.engaged;
    if (!engaged) return { x: 0, z: 1 };
    const dx = engaged.state.x - this.allyPos.x;
    const dz = engaged.state.z - this.allyPos.z;
    const length = Math.hypot(dx, dz) || 1;
    const sign = side === 0 ? 1 : -1;
    return { x: (dx / length) * sign, z: (dz / length) * sign };
  }

  private async lunge(side: 0 | 1) {
    const fx = side === 0 ? this.allyFx : this.engaged?.fx;
    if (!fx) return;
    const dir = this.opposeDir(side);
    await this.tween(0.18, (p) => { fx.offX = dir.x * 1.3 * p; fx.offZ = dir.z * 1.3 * p; });
    await this.tween(0.25, (p) => { fx.offX = dir.x * 1.3 * (1 - p); fx.offZ = dir.z * 1.3 * (1 - p); });
    fx.offX = 0;
    fx.offZ = 0;
  }

  private hit(fx: Fx) {
    fx.blink = 0.5;
    void this.tween(0.45, (p) => { fx.shake = 0.14 * (1 - p); });
  }

  private async faint(fx: Fx, lieDown = false) {
    if (lieDown) {
      // 야생 오디는 사라지지 않고 쓰러져 누워 있다 (로프를 던져 잡을 수 있다)
      await this.tween(0.5, (p) => { fx.tilt = p * 1.45; });
      return;
    }
    await this.tween(0.6, (p) => { fx.scale = Math.max(0.001, 1 - p); });
    fx.hidden = true;
  }

  /** 능력 단계가 오르면 위로, 내려가면 아래로 가는 화살표 */
  private arrows(side: 0 | 1, up: boolean) {
    const engaged = this.engaged;
    if (!engaged) return;
    this.arrowsAt(side === 0 ? this.allyPos.x : engaged.state.x, side === 0 ? this.allyPos.z : engaged.state.z, up);
  }

  private arrowsAt(x: number, z: number, up: boolean) {
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(this.arrowGeo, up ? this.arrowUp : this.arrowDown);
      if (!up) mesh.rotation.x = Math.PI;
      mesh.position.set(x + (i - 1) * 0.35, up ? 0.3 : 1.7, z);
      this.scene.add(mesh);
      meshes.push(mesh);
    }
    void this.tween(0.9, (p) => {
      meshes.forEach((mesh, i) => {
        const delay = i * 0.12;
        const q = Math.min(1, Math.max(0, (p - delay) / (1 - delay)));
        mesh.position.y = up ? 0.3 + q * 1.4 : 1.7 - q * 1.4;
      });
    }).then(() => { for (const mesh of meshes) this.scene.remove(mesh); });
  }

  // ---------- 로프 ----------

  private removeBall() {
    if (this.ball) this.scene.remove(this.ball);
    this.ball = null;
    for (const item of this.ballDisposables) item.dispose();
    this.ballDisposables = [];
  }

  /** 로프를 호를 그리며 던지고, 감싸고, 3번 흔든다. 잡혔으면 true. 풀려나면 오디가 되돌아온다 */
  private async throwBall(from: THREE.Vector3, wild: Wild, seq: RopeSequence): Promise<boolean> {
    this.removeBall();
    const mat = (color: string) => {
      const material = new THREE.MeshLambertMaterial({ color });
      this.ballDisposables.push(material);
      return material;
    };
    const geo = <T extends THREE.BufferGeometry>(g: T) => { this.ballDisposables.push(g); return g; };
    const ballGroup = new THREE.Group();
    ballGroup.add(new THREE.Mesh(geo(new THREE.SphereGeometry(0.22, 10, 8)), mat('#b0782f')));
    const band = new THREE.Mesh(geo(new THREE.TorusGeometry(0.23, 0.045, 6, 14)), mat('#f0d890'));
    band.rotation.x = Math.PI / 2;
    ballGroup.add(band);
    const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(0.7, 0.06, 6, 18)), mat('#f0d890'));
    ring.rotation.x = Math.PI / 2;
    this.ball = ballGroup;

    const wx = wild.state.x;
    const wz = wild.state.z;
    const to = new THREE.Vector3(wx, 0.7, wz);
    ballGroup.position.copy(from);
    this.scene.add(ballGroup);
    await this.tween(0.9, (p) => {
      ballGroup.position.lerpVectors(from, to, p);
      ballGroup.position.y += Math.sin(p * Math.PI) * 1.8;
      ballGroup.rotation.z = p * 12;
    });

    // 로프가 오디를 감싼다
    ballGroup.visible = false;
    ring.position.set(wx, 0.6, wz);
    this.scene.add(ring);
    await this.tween(0.4, (p) => { ring.scale.setScalar(2 - p); });
    await this.tween(0.3, (p) => {
      wild.fx.scale = 1 - 0.95 * p;
      ring.scale.setScalar(1 - 0.6 * p);
    });
    this.scene.remove(ring);
    ballGroup.visible = true;
    ballGroup.rotation.set(0, 0, 0);
    ballGroup.position.set(wx, 0.25, wz);

    // 흔들림: 1.0초 간격으로 최대 3번
    for (let shake = 1; shake <= 3; shake += 1) {
      await this.tween(0.5, (p) => { ballGroup.rotation.z = Math.sin(p * Math.PI * 2) * 0.5; });
      ballGroup.rotation.z = 0;
      await this.tween(0.5, () => {});
      if (!seq.success && shake === seq.shakes) break;
    }

    if (seq.success) {
      await this.tween(0.4, (p) => { ballGroup.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.4); });
      return true;
    }
    this.removeBall();
    wild.fx.blink = 0.5;
    await this.tween(0.25, (p) => { wild.fx.scale = 0.05 + 0.95 * p; });
    wild.fx.scale = 1;
    return false;
  }

  // ---------- 틱 ----------

  private tween(dur: number, step: (progress: number) => void): Promise<void> {
    return new Promise((resolve) => { this.tweens.push({ t: 0, dur, step, resolve }); });
  }

  private onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key.startsWith('arrow') || key === ' ') event.preventDefault();
    if ((key === ' ' || key === 'enter') && this.duelTarget && this.mode === 'explore') this.tryDuel();
    this.keys.add(key);
  };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.key.toLowerCase()); };
  private onBlur = () => { this.keys.clear(); };
  private onDragStart = (e: PointerEvent) => { if (this.mode === 'explore') this.dragId = e.pointerId; };
  private onDragMove = (e: PointerEvent) => {
    if (this.dragId !== e.pointerId || this.mode !== 'explore') return;
    this.camYaw -= e.movementX * 0.008;
  };
  private onDragEnd = (e: PointerEvent) => { if (this.dragId === e.pointerId) this.dragId = null; };

  private resize = () => {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private inView(wild: Wild): boolean {
    this.projected.set(wild.state.x, 0.7, wild.state.z).project(this.camera);
    return Math.abs(this.projected.x) <= 1 && Math.abs(this.projected.y) <= 1 && this.projected.z < 1;
  }

  private publishNearby(force = false) {
    const wild = this.fieldTarget;
    const visible = this.mode === 'explore' && !this.busy && !this.locked;
    const state: NearbyState = {
      duel: visible && this.duelTarget !== null,
      building: visible ? this.building : null,
      field: visible && wild
        ? { name: speciesById(wild.speciesId).name, level: wild.level, hpPct: Math.round(wild.hpRatio * 100) }
        : null,
    };
    const signature = JSON.stringify(state);
    if (force || signature !== this.lastNearby) {
      this.lastNearby = signature;
      this.hooks.nearby(state);
    }
  }

  private updatePlayer(dt: number) {
    if (this.mode !== 'explore' || this.busy || this.locked) return;
    const keyMove = keysToMove(this.keys);
    const raw = keyMove.x !== 0 || keyMove.z !== 0 ? keyMove : this.input;
    if (this.keys.has('q')) this.camYaw += 1.8 * dt;
    if (this.keys.has('e')) this.camYaw -= 1.8 * dt;
    const move = inputToWorld(raw, this.camYaw);
    const moving = move.x !== 0 || move.z !== 0;
    if (moving) {
      const next = clampToArea(
        { x: this.playerPos.x + move.x * PLAYER_SPEED * dt, z: this.playerPos.z + move.z * PLAYER_SPEED * dt },
        AREA_HALF,
      );
      this.playerPos = next;
      this.playerHeading = Math.atan2(move.x, move.z);
    }
    this.playerRoot.position.set(this.playerPos.x, 0, this.playerPos.z);
    this.playerRoot.rotation.y = this.playerHeading;
    this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 10);
    if (moving) this.walkPhase += dt * 11;
    this.playerRig?.setPose(this.walkPhase, this.walkBlend);
    this.player.position.y = moving ? Math.abs(Math.sin(this.clock * 12)) * 0.08 : 0;
    this.player.rotation.z = moving ? Math.sin(this.clock * 12) * 0.1 : 0;
  }

  private updateWilds(dt: number) {
    const exploring = this.mode === 'explore' && !this.busy && !this.locked;
    let duel: Wild | null = null;
    let duelDist = DUEL_RANGE;
    let field: Wild | null = null;
    let fieldDist = FIELD_RANGE;
    for (const wild of this.wilds) {
      if (!wild.alive) {
        if (this.clock >= wild.respawnAt && this.mode === 'explore') this.rollWild(wild);
        continue;
      }
      const dist = distance(wild.state, this.playerPos);
      const isEngaged = wild === this.engaged;
      if (!isEngaged && !wild.frozen && this.mode === 'explore' && dist > DESPAWN_DIST) {
        this.rollWild(wild); // 너무 멀어진 오디는 플레이어 근처에 새로 나타난다
        continue;
      }
      if (!isEngaged && !wild.frozen && dist > FAR_SKIP) continue; // 먼 오디는 움직임 계산을 건너뛴다
      if (!isEngaged && !wild.frozen) {
        if (exploring && wild.aggressive && this.grace <= 0 && dist <= NOTICE_RANGE) {
          wild.state = stepChase(wild.state, this.playerPos, dt, DUEL_RANGE * 0.6);
        } else {
          wild.state = stepWander(wild.state, dt, Math.random, AREA_HALF);
        }
      }
      const walking = wild.state.mode === 'walk' && !isEngaged && !wild.frozen;
      const t = this.clock * (walking ? 8 : 2) + wild.phase;
      wild.fx.blink = Math.max(0, wild.fx.blink - dt);
      applyFx(wild.holder, wild.state.x, wild.state.z, wild.fx, this.clock);
      if (this.mode === 'battle' && !isEngaged) wild.holder.visible = false;
      wild.holder.rotation.y = wild.state.heading;
      if (walking) {
        wild.pivot.position.y = Math.abs(Math.sin(t)) * 0.15;
        wild.pivot.scale.set(1, 1, 1);
      } else {
        const breathe = Math.sin(t) * 0.04;
        wild.pivot.position.y = 0;
        wild.pivot.scale.set(1 - breathe / 2, 1 + breathe, 1 - breathe / 2);
      }
      wild.marker.position.y = MODEL_HEIGHT + 0.7 + Math.sin(this.clock * 5 + wild.phase) * 0.1;
      if (!exploring || isEngaged) continue;
      if (dist <= duelDist) { duel = wild; duelDist = dist; }
      if (dist <= fieldDist && this.inView(wild)) { field = wild; fieldDist = dist; }
    }
    this.building = null;
    if (exploring) {
      for (const b of BUILDINGS) {
        if (distance(this.playerPos, { x: b.x, z: b.z + 3 }) <= ENTER_RANGE) this.building = b.kind;
      }
    }
    this.duelTarget = exploring ? duel : null;
    this.fieldTarget = exploring ? field : null;
    if (exploring && duel && duel.aggressive && this.grace <= 0) this.startDuel(duel);
    this.publishNearby();
  }

  /** 플레이어가 있는 곳의 구역 색으로 하늘과 안개를 천천히 바꾼다 */
  private updateSky(k: number) {
    const target = new THREE.Color();
    const [r, g, b] = blendHex(regionWeights(this.playerPos.x, this.playerPos.z), (info) => info.sky);
    target.setRGB(r, g, b, THREE.SRGBColorSpace);
    this.skyColor.lerp(target, k);
    if (this.scene.fog) this.scene.fog.color.copy(this.skyColor);
  }

  private updateRegion() {
    const region = regionAt(this.playerPos.x, this.playerPos.z);
    if (region === this.region) return;
    this.region = region;
    this.hooks.region(`${REGIONS[region].name} 지역`);
  }

  private updateCamera(dt: number) {
    const k = 1 - Math.exp(-(this.mode === 'battle' ? 3.5 : 6) * dt);
    let goal: THREE.Vector3;
    let focus: THREE.Vector3;
    const engaged = this.engaged;
    if (this.mode === 'battle' && engaged) {
      const midX = (this.allyPos.x + engaged.state.x) / 2;
      const midZ = (this.allyPos.z + engaged.state.z) / 2;
      const dx = engaged.state.x - this.allyPos.x;
      const dz = engaged.state.z - this.allyPos.z;
      const length = Math.hypot(dx, dz) || 1;
      let sideX = -dz / length;
      let sideZ = dx / length;
      if (sideZ < 0) { sideX = -sideX; sideZ = -sideZ; } // 항상 화면 아래쪽에서 바라본다
      // 세로로 긴 화면에서도 두 오디가 다 들어오게 화면 비율에 맞춰 물러난다
      const halfTan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const dist = Math.max(6.5, (BATTLE_GAP / 2 + 1.9) / (this.camera.aspect * halfTan));
      const height = 2.8 + dist * 0.2;
      goal = new THREE.Vector3(midX + sideX * dist, height, midZ + sideZ * dist);
      // 아래쪽 메뉴가 화면을 가리므로, 카메라를 조금 더 숙여 두 오디를 화면 위쪽에 올린다
      const below = Math.atan((height - 0.7) / dist);
      const focusDist = height / Math.tan(below + 0.1);
      focus = new THREE.Vector3(goal.x - sideX * focusDist, 0, goal.z - sideZ * focusDist);
    } else {
      const sy = Math.sin(this.camYaw);
      const cy = Math.cos(this.camYaw);
      goal = new THREE.Vector3(this.playerPos.x + sy * 8.5, 6.8, this.playerPos.z + cy * 8.5);
      focus = new THREE.Vector3(this.playerPos.x - sy * 2.5, 1.1, this.playerPos.z - cy * 2.5);
    }
    this.camera.position.lerp(goal, k);
    this.look.lerp(focus, k);
    this.camera.lookAt(this.look);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.clock += dt;
    this.grace = Math.max(0, this.grace - dt);

    for (const tween of [...this.tweens]) {
      tween.t += dt;
      const progress = Math.min(1, tween.t / tween.dur);
      tween.step(progress);
      if (progress >= 1) {
        this.tweens.splice(this.tweens.indexOf(tween), 1);
        tween.resolve();
      }
    }

    this.updatePlayer(dt);
    this.updateWilds(dt);
    this.updateSky(1 - Math.exp(-2 * dt));
    if (this.mode === 'explore') this.updateRegion();
    if (this.mode === 'battle') {
      this.allyFx.blink = Math.max(0, this.allyFx.blink - dt);
      applyFx(this.allyHolder, this.allyPos.x, this.allyPos.z, this.allyFx, this.clock);
      const breathe = Math.sin(this.clock * 2.5) * 0.04;
      this.allyPivot.scale.set(1 - breathe / 2, 1 + breathe, 1 - breathe / 2);
    }
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  };
}
