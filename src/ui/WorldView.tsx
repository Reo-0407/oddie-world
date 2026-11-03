import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { speciesById } from '../data/index.ts';
import { buildCharacter, CHARACTERS, disposeObject } from '../world/characters.ts';
import {
  clampToArea, distance, DUEL_RANGE, inputToWorld, joystickToMove, keysToMove, NOTICE_RANGE, type Vec2,
} from '../world/math.ts';
import { MODEL_SPECIES_IDS, modelUrl, wildLevel } from '../world/spawns.ts';
import { stepChase, stepWander, type WanderState } from '../world/wander.ts';
import { typeColor } from './OddieArt.tsx';

const AREA_HALF = 28; // 초원 한 변의 절반
const WILD_COUNT = 8;
const PLAYER_SPEED = 4;
const MODEL_HEIGHT = 1.2;
const RESPAWN_SECONDS = 10;
const GRACE_SECONDS = 3; // 전투에서 돌아온 직후엔 자동 결투를 잠시 막는다
const AGGRESSIVE_RATE = 0.4; // 이 비율의 야생 오디만 먼저 다가온다. 나머지는 결투! 버튼으로만
const JOY_RADIUS = 50;

interface Props {
  name: string;
  characterIndex: number;
  playerLevel: number;
  paused: boolean;
  onDuel: (speciesId: number, level: number) => void;
}

interface Wild {
  speciesId: number;
  level: number;
  aggressive: boolean;
  state: WanderState;
  holder: THREE.Group;
  pivot: THREE.Group;
  marker: THREE.Object3D;
  alive: boolean;
  respawnAt: number;
  phase: number;
  token: number; // 모델 로딩이 끝났을 때 아직 같은 오디인지 확인
  fallback: { dispose(): void } | null;
}

interface Control {
  paused: boolean;
  dueling: boolean;
  grace: number;
  duelNearest: () => void;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function WorldView({ name, characterIndex, playerLevel, paused, onDuel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Vec2>({ x: 0, z: 0 });
  const control = useRef<Control>({ paused, dueling: false, grace: 0, duelNearest: () => {} });
  const onDuelRef = useRef(onDuel);
  const levelRef = useRef(playerLevel);
  const [nearby, setNearby] = useState(false);
  const [error, setError] = useState<string | null>(null);

  onDuelRef.current = onDuel;
  levelRef.current = playerLevel;

  useEffect(() => {
    const ctrl = control.current;
    ctrl.paused = paused;
    if (!paused) {
      ctrl.dueling = false;
      ctrl.grace = GRACE_SECONDS;
      setNearby(false);
    }
  }, [paused]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ctrl = control.current;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError('이 기기에서는 3D 화면을 쓸 수 없어요.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.display = 'block';
    container.prepend(renderer.domElement);

    const sky = new THREE.Color('#bfe3f5');
    const scene = new THREE.Scene();
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 14, 46);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight('#ffffff', '#6a8f4a', 1.6));
    const sun = new THREE.DirectionalLight('#fff3d6', 1.4);
    sun.position.set(8, 14, 6);
    scene.add(sun);

    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(item: T): T => {
      disposables.push(item);
      return item;
    };
    const lambert = (color: string) => track(new THREE.MeshLambertMaterial({ color, flatShading: true }));

    // 초원과 장식
    const ground = new THREE.Mesh(
      track(new THREE.PlaneGeometry(AREA_HALF * 2 + 20, AREA_HALF * 2 + 20)),
      lambert('#7bbf5a'),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const trunkGeo = track(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 6));
    const leafGeo = track(new THREE.ConeGeometry(1.1, 2.4, 7));
    const trunkMat = lambert('#7a5232');
    const leafMats = [lambert('#2f8f4e'), lambert('#3aa35a')];
    const rockGeo = track(new THREE.DodecahedronGeometry(0.8, 0));
    const rockMat = lambert('#9a9a96');
    const decoPoints: Vec2[] = [];
    for (let i = 0; i < 30; i += 1) {
      const x = (Math.random() * 2 - 1) * (AREA_HALF + 6);
      const z = (Math.random() * 2 - 1) * (AREA_HALF + 6);
      if (Math.hypot(x, z) < 6) continue; // 출발점 주변은 비운다
      decoPoints.push({ x, z });
      if (i % 4 === 3) {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(x, 0.3, z);
        rock.scale.setScalar(0.6 + Math.random() * 0.8);
        rock.rotation.y = Math.random() * 6;
        scene.add(rock);
      } else {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 0.6;
        const leaves = new THREE.Mesh(leafGeo, leafMats[i % 2]);
        leaves.position.y = 2.2;
        tree.add(trunk, leaves);
        tree.position.set(x, 0, z);
        tree.scale.setScalar(0.8 + Math.random() * 0.7);
        scene.add(tree);
      }
    }

    // 플레이어
    const player = buildCharacter(CHARACTERS[characterIndex] ?? CHARACTERS[0]);
    const playerRoot = new THREE.Group();
    playerRoot.add(player);
    scene.add(playerRoot);
    const playerPos: Vec2 = { x: 0, z: 0 };
    let playerHeading = Math.PI;

    // 오디 모델 불러오기 (종마다 한 번만, 높이 정규화)
    const loader = new GLTFLoader();
    const templates = new Map<number, Promise<THREE.Object3D | null>>();
    const loadTemplate = (speciesId: number) => {
      let pending = templates.get(speciesId);
      if (!pending) {
        pending = loader.loadAsync(modelUrl(speciesId)).then((gltf) => {
          const wrapper = new THREE.Group();
          wrapper.add(gltf.scene);
          const box = new THREE.Box3().setFromObject(wrapper);
          const size = box.getSize(new THREE.Vector3());
          const scale = size.y > 0
            ? Math.min(MODEL_HEIGHT / size.y, 2 / Math.max(size.x, size.z, 0.001))
            : 1;
          gltf.scene.scale.setScalar(scale);
          const fitted = new THREE.Box3().setFromObject(wrapper);
          const center = fitted.getCenter(new THREE.Vector3());
          gltf.scene.position.set(-center.x, -fitted.min.y, -center.z);
          return wrapper as THREE.Object3D;
        }).catch(() => null);
        templates.set(speciesId, pending);
      }
      return pending;
    };

    const markerGeo = track(new THREE.ConeGeometry(0.18, 0.4, 4));
    const markerMat = lambert('#e0523f');
    const wilds: Wild[] = [];

    const clearPivot = (wild: Wild) => {
      wild.pivot.clear();
      wild.fallback?.dispose();
      wild.fallback = null;
    };

    const dress = (wild: Wild) => {
      clearPivot(wild);
      const token = (wild.token += 1);
      const species = speciesById(wild.speciesId);
      void loadTemplate(wild.speciesId).then((template) => {
        if (disposed || wild.token !== token) return;
        if (template) {
          wild.pivot.add(cloneSkinned(template));
        } else {
          // GLB를 못 불러오면 타입 색 구체로 대신한다
          const geometry = new THREE.SphereGeometry(MODEL_HEIGHT / 2, 12, 10);
          const material = new THREE.MeshLambertMaterial({ color: typeColor(species.types[0]) });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.y = MODEL_HEIGHT / 2;
          wild.pivot.add(mesh);
          wild.fallback = { dispose: () => { geometry.dispose(); material.dispose(); } };
        }
      });
    };

    const placeWild = (wild: Wild) => {
      let x = 0;
      let z = 0;
      do {
        x = (Math.random() * 2 - 1) * (AREA_HALF - 2);
        z = (Math.random() * 2 - 1) * (AREA_HALF - 2);
      } while (distance({ x, z }, playerPos) < 9);
      wild.state = { x, z, heading: Math.random() * 6.28, mode: 'idle', timer: Math.random() * 2 };
    };

    const rollWild = (wild: Wild) => {
      wild.speciesId = pickRandom(MODEL_SPECIES_IDS);
      wild.level = wildLevel(levelRef.current, Math.random);
      wild.aggressive = Math.random() < AGGRESSIVE_RATE;
      wild.marker.visible = wild.aggressive;
      wild.alive = true;
      wild.holder.visible = true;
      placeWild(wild);
      dress(wild);
    };

    let disposed = false;
    for (let i = 0; i < WILD_COUNT; i += 1) {
      const holder = new THREE.Group();
      const pivot = new THREE.Group();
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.y = MODEL_HEIGHT + 0.7;
      marker.rotation.x = Math.PI;
      holder.add(pivot, marker);
      scene.add(holder);
      const wild: Wild = {
        speciesId: 1, level: 1, aggressive: false, holder, pivot, marker,
        state: { x: 0, z: 0, heading: 0, mode: 'idle', timer: 1 },
        alive: true, respawnAt: 0, phase: Math.random() * 6.28, token: 0, fallback: null,
      };
      rollWild(wild);
      wilds.push(wild);
    }

    // 결투 시작
    let clock = 0;
    const startDuel = (wild: Wild) => {
      if (ctrl.paused || ctrl.dueling) return;
      ctrl.dueling = true;
      wild.alive = false;
      wild.holder.visible = false;
      wild.respawnAt = clock + RESPAWN_SECONDS;
      inputRef.current = { x: 0, z: 0 };
      onDuelRef.current(wild.speciesId, wild.level);
    };
    let nearest: Wild | null = null;
    ctrl.duelNearest = () => { if (nearest) startDuel(nearest); };

    // 키보드
    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key.startsWith('arrow') || key === ' ') event.preventDefault();
      if ((key === ' ' || key === 'enter') && nearest) ctrl.duelNearest();
      keys.add(key);
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // 크기
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = container;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    camera.position.set(0, 5.5, 7);

    // 메인 루프
    let frame = 0;
    let last = performance.now();
    let hadNearby = false;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!ctrl.paused) {
        clock += dt;
        ctrl.grace = Math.max(0, ctrl.grace - dt);

        // 플레이어 이동
        const keyMove = keysToMove(keys);
        const raw = keyMove.x !== 0 || keyMove.z !== 0 ? keyMove : inputRef.current;
        const move = inputToWorld(raw, 0);
        const moving = move.x !== 0 || move.z !== 0;
        if (moving) {
          const next = clampToArea(
            { x: playerPos.x + move.x * PLAYER_SPEED * dt, z: playerPos.z + move.z * PLAYER_SPEED * dt },
            AREA_HALF,
          );
          playerPos.x = next.x;
          playerPos.z = next.z;
          playerHeading = Math.atan2(move.x, move.z);
        }
        playerRoot.position.set(playerPos.x, 0, playerPos.z);
        playerRoot.rotation.y = playerHeading;
        player.position.y = moving ? Math.abs(Math.sin(clock * 12)) * 0.08 : 0;

        // 야생 오디
        nearest = null;
        let nearestDist = DUEL_RANGE;
        for (const wild of wilds) {
          if (!wild.alive) {
            if (clock >= wild.respawnAt) rollWild(wild);
            continue;
          }
          const dist = distance(wild.state, playerPos);
          if (wild.aggressive && ctrl.grace <= 0 && dist <= NOTICE_RANGE) {
            wild.state = stepChase(wild.state, playerPos, dt, DUEL_RANGE * 0.6);
          } else {
            wild.state = stepWander(wild.state, dt, Math.random, AREA_HALF);
          }
          wild.holder.position.set(wild.state.x, 0, wild.state.z);
          wild.holder.rotation.y = wild.state.heading;
          const walking = wild.state.mode === 'walk';
          const t = clock * (walking ? 8 : 2) + wild.phase;
          if (walking) {
            wild.pivot.position.y = Math.abs(Math.sin(t)) * 0.15;
            wild.pivot.scale.set(1, 1, 1);
          } else {
            const breathe = Math.sin(t) * 0.04;
            wild.pivot.position.y = 0;
            wild.pivot.scale.set(1 - breathe / 2, 1 + breathe, 1 - breathe / 2);
          }
          wild.marker.position.y = MODEL_HEIGHT + 0.7 + Math.sin(clock * 5 + wild.phase) * 0.1;
          if (dist <= nearestDist) {
            nearest = wild;
            nearestDist = dist;
          }
        }
        if (nearest && wilds.includes(nearest) && nearest.aggressive && ctrl.grace <= 0) {
          startDuel(nearest);
        }
        const isNear = nearest !== null && !ctrl.dueling;
        if (isNear !== hadNearby) {
          hadNearby = isNear;
          setNearby(isNear);
        }

        // 추적 카메라
        const k = 1 - Math.exp(-6 * dt);
        camera.position.x += (playerPos.x - camera.position.x) * k;
        camera.position.y += (5.5 - camera.position.y) * k;
        camera.position.z += (playerPos.z + 7 - camera.position.z) * k;
        camera.lookAt(playerPos.x, 1, playerPos.z);
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const wild of wilds) wild.fallback?.dispose();
      disposeObject(player);
      for (const pending of templates.values()) {
        void pending.then((template) => { if (template) disposeObject(template); });
      }
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [characterIndex]);

  // 가상 조이스틱 (화면 왼쪽 아래)
  const moveStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const base = joyRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    inputRef.current = joystickToMove(dx, dy, JOY_RADIUS);
    const length = Math.min(Math.hypot(dx, dy), JOY_RADIUS);
    const angle = Math.atan2(dy, dx);
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${Math.cos(angle) * length}px, ${Math.sin(angle) * length}px)`;
    }
  };
  const releaseStick = () => {
    inputRef.current = { x: 0, z: 0 };
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
  };

  if (error) {
    return <div className="world world-error">{error}</div>;
  }

  return (
    <div className="world" ref={containerRef}>
      <div className="world-hud">{name} · 이동: WASD/방향키 또는 왼쪽 조이스틱</div>
      <div
        className="joystick"
        ref={joyRef}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); moveStick(event); }}
        onPointerMove={(event) => { if (event.buttons !== 0 || event.pointerType === 'touch') moveStick(event); }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
      >
        <div className="joystick-knob" ref={knobRef} />
      </div>
      {nearby && !paused && (
        <button className="duel-button" onClick={() => control.current.duelNearest()}>결투!</button>
      )}
    </div>
  );
}
