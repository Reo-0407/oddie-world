import { OddieArt } from './OddieArt.tsx';
import { useEffect, useRef, useState } from 'react';
import { MOVES, speciesById } from '../data/index.ts';
import type { BattleState } from '../engine/types.ts';
import { createBattle, createBattlePokemon } from '../game/factory.ts';
import { addCaught, highestLevel } from '../game/owned.ts';
import { grantExp, type BattleReport } from '../game/rewards.ts';
import { withHpRatio } from '../game/tutorial.ts';
import { joystickToMove } from '../world/math.ts';
import { MAP_HALF, REGIONS, TOWN_POS } from '../world/regions.ts';
import { START_LEVEL, type Ropes, type SaveData } from '../world/save.ts';
import { WorldScene, type NearbyState, type SceneHooks, type WildInfo } from '../world/scene.ts';
import { BattleOverlay } from './BattleOverlay.tsx';
import { HealerOverlay, ShopOverlay } from './TownOverlays.tsx';

const JOY_RADIUS = 50;
const TOAST_MS = 5000;
const MINIMAP_SIZE = 92;

/** 작은 지도: 네 구역 색, 마을(노랑), 플레이어(빨강) */
function Minimap({ scene }: { scene: WorldScene | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const scale = MINIMAP_SIZE / (MAP_HALF * 2);
    const toPx = (v: number) => (v + MAP_HALF) * scale;
    const draw = () => {
      const half = MINIMAP_SIZE / 2;
      ctx.fillStyle = REGIONS.meadow.ground; ctx.fillRect(0, 0, half, half);
      ctx.fillStyle = REGIONS.desert.ground; ctx.fillRect(half, 0, half, half);
      ctx.fillStyle = REGIONS.snow.ground; ctx.fillRect(0, half, half, half);
      ctx.fillStyle = REGIONS.volcano.ground; ctx.fillRect(half, half, half, half);
      ctx.fillStyle = '#f4c542';
      ctx.strokeStyle = '#23262b';
      ctx.lineWidth = 1;
      ctx.fillRect(toPx(TOWN_POS.x) - 3, toPx(TOWN_POS.z) - 3, 6, 6);
      ctx.strokeRect(toPx(TOWN_POS.x) - 3, toPx(TOWN_POS.z) - 3, 6, 6);
      const player = scene?.getPlayerPos();
      if (player) {
        ctx.fillStyle = '#e0302a';
        ctx.beginPath();
        ctx.arc(toPx(player.x), toPx(player.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    };
    draw();
    const timer = setInterval(draw, 250);
    return () => clearInterval(timer);
  }, [scene]);
  return <canvas ref={canvasRef} className="minimap" width={MINIMAP_SIZE} height={MINIMAP_SIZE} aria-label="지도" />;
}

interface Props {
  data: SaveData;
  onData: (next: SaveData) => void;
}

interface ActiveBattle {
  state: BattleState;
  tutorial: boolean;
}

function startBattle(data: SaveData, wild: WildInfo): BattleState {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const mine = data.team.map((oddie) => createBattlePokemon(speciesById(oddie.speciesId), oddie.level, MOVES));
  let foe = withHpRatio(createBattlePokemon(speciesById(wild.speciesId), wild.level, MOVES), wild.hpRatio);
  if (wild.status) foe = { ...foe, status: wild.status, sleepTurns: wild.status === 'sleep' ? 2 : 0 };
  return createBattle(mine, [foe], seed);
}

/** 3D 월드. 결투가 시작되면 같은 장면에서 카메라만 옮기고 전투 메뉴를 위에 얹는다 */
export function WorldView({ data, onData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  const onDataRef = useRef(onData);
  const sceneRef = useRef<WorldScene | null>(null);
  const [scene, setScene] = useState<WorldScene | null>(null);
  const [battle, setBattle] = useState<ActiveBattle | null>(null);
  const [nearby, setNearby] = useState<NearbyState>({ duel: false, building: null, field: null });
  const [panel, setPanel] = useState<'shop' | 'healer' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  dataRef.current = data;
  onDataRef.current = onData;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const commit = (next: SaveData) => {
      dataRef.current = next;
      onDataRef.current(next);
    };
    const hooks: SceneHooks = {
      duel: (wild) => {
        const current = dataRef.current;
        setBattle({ state: startBattle(current, wild), tutorial: !current.tutorialDone });
      },
      nearby: setNearby,
      spendRope: (kind) => {
        const current = dataRef.current;
        commit({ ...current, ropes: { ...current.ropes, [kind]: Math.max(0, current.ropes[kind] - 1) } });
      },
      caught: (wild) => {
        const current = dataRef.current;
        const added = addCaught(current.team, current.box, { speciesId: wild.speciesId, level: wild.level, exp: 0 });
        commit({ ...current, team: added.team, box: added.box });
        const name = speciesById(wild.speciesId).name;
        setToast(`${name} 포획! ${added.toBox ? '팀이 가득 차서 박스로 갔어.' : '팀에 들어왔어.'}`);
      },
      gainExp: (exp) => {
        const current = dataRef.current;
        const result = grantExp(current.team, 0, exp);
        commit({ ...current, team: result.team, playerLevel: highestLevel(result.team, START_LEVEL) });
        const up = result.levelUp;
        const extra = up
          ? ` 경험치 +${exp}! ${up.name} Lv.${up.to}${up.newMoves.length > 0 ? ` · 새 기술: ${up.newMoves.join(', ')}` : ''}`
          : ` 경험치 +${exp}`;
        setToast((previous) => `${previous ?? ''}${extra}`);
      },
      toast: setToast,
      region: (name) => setToast(name),
    };
    let created: WorldScene;
    try {
      created = new WorldScene(
        container,
        dataRef.current.characterIndex,
        () => ({ team: dataRef.current.team, ropes: dataRef.current.ropes, tutorialDone: dataRef.current.tutorialDone }),
        hooks,
      );
    } catch {
      setError('이 기기에서는 3D 화면을 쓸 수 없어요.');
      return;
    }
    sceneRef.current = created;
    // 개발 중 콘솔에서 장면을 만져 볼 수 있게 한다 (배포 빌드에는 없다)
    if (import.meta.env.DEV) (window as unknown as { __oddieScene?: WorldScene }).__oddieScene = created;
    setScene(created);
    return () => {
      created.dispose();
      sceneRef.current = null;
      setScene(null);
    };
    // 캐릭터가 바뀔 때만 장면을 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.characterIndex]);

  // 상점·회복소 화면이 열려 있는 동안 월드는 멈춘다
  useEffect(() => { scene?.setLocked(panel !== null); }, [panel, scene]);

  const finishBattle = (report: BattleReport, bag: { ropes: Ropes; potions: number }) => {
    const current = dataRef.current;
    const next: SaveData = {
      ...current,
      team: report.team,
      box: report.box,
      ropes: bag.ropes,
      potions: bag.potions,
      coins: current.coins + report.coins,
      playerLevel: highestLevel(report.team, START_LEVEL),
      tutorialDone: current.tutorialDone || (battle?.tutorial ?? false),
    };
    dataRef.current = next;
    onData(next);
    sceneRef.current?.exitBattle();
    setBattle(null);
    if (report.outcome === 'fled') setToast('무사히 도망쳤다!');
  };

  // 가상 조이스틱 (화면 왼쪽 아래)
  const moveStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const base = joyRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    sceneRef.current?.setInput(joystickToMove(dx, dy, JOY_RADIUS));
    const length = Math.min(Math.hypot(dx, dy), JOY_RADIUS);
    const angle = Math.atan2(dy, dx);
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${Math.cos(angle) * length}px, ${Math.sin(angle) * length}px)`;
    }
  };
  const releaseStick = () => {
    sceneRef.current?.setInput({ x: 0, z: 0 });
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
  };

  if (error) {
    return <div className="world world-error">{error}</div>;
  }

  return (
    <div className="world" ref={containerRef}>
      {!battle && (
        <div className="world-hud">
          <div>{data.name} · 코인 {data.coins} · 로프 {data.ropes.basic} · 튼튼한 로프 {data.ropes.sturdy} · 회복약 {data.potions}</div>
          <div className="hud-team">
            {data.team.map((oddie, index) => {
              const species = speciesById(oddie.speciesId);
              return (
                <span key={index} className="hud-mon">
                  <OddieArt speciesId={oddie.speciesId} name={species.name} types={species.types} size={28} />
                  {species.name} Lv.{oddie.level}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {!battle && <Minimap scene={scene} />}
      {toast && <div className="toast" role="status">{toast}</div>}

      {!battle && (
        <>
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
          <div className="field-buttons">
            {nearby.field && (
              <>
                <div className="field-info">
                  {nearby.field.name} Lv.{nearby.field.level} · 체력 {nearby.field.hpPct}%
                </div>
                <button className="field-button" onClick={() => void scene?.fieldThrow()}>로프 던지기</button>
                <button className="field-button" onClick={() => scene?.skirmish()}>출동!</button>
              </>
            )}
            {nearby.building && (
              <button className="field-button" onClick={() => setPanel(nearby.building)}>
                {nearby.building === 'shop' ? '상점 ' : '회복소 '}들어가기
              </button>
            )}
            {nearby.duel && <button className="duel-button" onClick={() => scene?.tryDuel()}>결투!</button>}
          </div>
        </>
      )}

      {panel === 'shop' && (
        <ShopOverlay
          inventory={{ coins: data.coins, ropes: data.ropes, potions: data.potions }}
          onChange={(next) => onData({ ...data, coins: next.coins, ropes: next.ropes, potions: next.potions })}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'healer' && (
        <HealerOverlay
          team={data.team}
          onHeal={() => { sceneRef.current?.healEffect(); }}
          onClose={() => setPanel(null)}
        />
      )}

      {battle && (
        <BattleOverlay
          initial={battle.state}
          team={data.team}
          box={data.box}
          ropes={data.ropes}
          potions={data.potions}
          tutorial={battle.tutorial}
          scene={scene}
          onFinish={finishBattle}
        />
      )}
    </div>
  );
}
