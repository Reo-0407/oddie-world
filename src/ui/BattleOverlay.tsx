import { useRef, useState } from 'react';
import { speciesById } from '../data/index.ts';
import { isLegalAction } from '../engine/turn.ts';
import type { BattlePokemon, BattleState, Move, Status } from '../engine/types.ts';
import { catchChance, ROPE_NAMES, ropeSequence, type RopeKind } from '../game/capture.ts';
import type { OwnedOddie } from '../game/owned.ts';
import { settleBattle, type BattleReport } from '../game/rewards.ts';
import { battleOutcome, tutorialHint } from '../game/tutorial.ts';
import type { WorldScene } from '../world/scene.ts';
import type { Ropes } from '../world/save.ts';
import { moveDetail, moveSummary, powerText } from './moveText.ts';
import { typeColor } from './OddieArt.tsx';
import { useBattle } from './useBattle.ts';

const STATUS_LABELS: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '수면' };
const LONG_PRESS_MS = 500;

function Plate({ pokemon, hp, showHp }: { pokemon: BattlePokemon; hp: number; showHp: boolean }) {
  const percent = Math.round((hp / pokemon.stats.hp) * 100);
  return (
    <div className="plate b-plate">
      <div className="plate-name">
        {pokemon.name} <small>Lv.{pokemon.level}</small>
        {pokemon.status && <span className="status">{STATUS_LABELS[pokemon.status]}</span>}
      </div>
      <div className="hp-bar" role="progressbar" aria-valuenow={percent}>
        <div className={`hp-fill ${percent < 25 ? 'low' : ''}`} style={{ width: `${percent}%` }} />
      </div>
      {showHp && <div className="hp-text">{hp} / {pokemon.stats.hp}</div>}
    </div>
  );
}

interface Props {
  initial: BattleState;
  /** 전투 전 내 팀(initial의 내 쪽과 같은 순서), 박스, 가진 로프 */
  team: OwnedOddie[];
  box: OwnedOddie[];
  ropes: Ropes;
  /** 첫 결투: 도망 없음, 안내 문구, 첫 로프 100% 성공 */
  tutorial: boolean;
  scene: WorldScene | null;
  onFinish: (report: BattleReport, ropesLeft: Ropes) => void;
}

/** 월드 3D 장면 위에 얹는 전투 메뉴. 전투 규칙은 useBattle(엔진)이 맡는다 */
export function BattleOverlay({ initial, team, box, ropes, tutorial, scene, onFinish }: Props) {
  const { state, shown, message, playing, caught, act, forceSwitch, throwRope } = useBattle(initial, {
    onEvent: (event) => scene?.battleEvent(event),
    playRope: scene ? (seq) => scene.playRope(seq) : undefined,
  });
  const [choosingSwitch, setChoosingSwitch] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [detail, setDetail] = useState<Move | null>(null);
  const [ropesLeft, setRopesLeft] = useState(ropes);
  const [movesUsed, setMovesUsed] = useState(0);
  const [thrown, setThrown] = useState(0);
  const longPressed = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const player = state.sides[0];
  const opponent = state.sides[1];
  const mustSwitch = state.pendingSwitch[0];
  const outcome = battleOutcome(state, caught);
  const over = outcome !== null;
  const showTeam = (choosingSwitch || mustSwitch) && !over;
  const wild = opponent.team[0];
  const me = player.team[player.active];
  const myShownHp = shown.hp[0];
  const busy = playing || over;

  const report = outcome && !playing
    ? settleBattle({
      outcome,
      team,
      box,
      alive: player.team.map((pokemon) => pokemon.hp > 0),
      wildSpeciesId: wild.speciesId,
      wildLevel: wild.level,
    })
    : null;

  const pickSwitch = (teamIndex: number) => {
    setChoosingSwitch(false);
    if (mustSwitch) forceSwitch(0, teamIndex);
    else act({ kind: 'switch', teamIndex });
  };

  const useMove = (moveIndex: number) => {
    setDetail(null);
    setMovesUsed((n) => n + 1);
    act({ kind: 'move', moveIndex });
  };

  const throwOne = (kind: RopeKind) => {
    if (ropesLeft[kind] <= 0) return;
    setBagOpen(false);
    setThrown((n) => n + 1);
    setRopesLeft({ ...ropesLeft, [kind]: ropesLeft[kind] - 1 });
    const target = opponent.team[opponent.active];
    const chance = catchChance(speciesById(target.speciesId).rarity, target.hp / target.stats.hp, target.status, kind);
    throwRope(ropeSequence(chance, Math.random, tutorial && thrown === 0));
  };

  const flee = () => {
    onFinish(settleBattle({
      outcome: 'fled', team, box, alive: player.team.map((pokemon) => pokemon.hp > 0),
      wildSpeciesId: wild.speciesId, wildLevel: wild.level,
    }), ropesLeft);
  };

  const canFlee = !tutorial && me.trapped === 0;
  const startPress = (move: Move) => {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => { longPressed.current = true; setDetail(move); }, LONG_PRESS_MS);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  const signatureId = speciesById(me.speciesId).signatureMoveId;
  const hint = tutorial && !busy && !showTeam ? tutorialHint(movesUsed) : null;

  return (
    <div className="battle-overlay">
      <div className="b-top">
        <Plate pokemon={opponent.team[shown.active[1]]} hp={shown.hp[1]} showHp={false} />
        <Plate pokemon={player.team[shown.active[0]]} hp={myShownHp} showHp />
      </div>

      <div className="b-bottom">
        {hint && <p className="hint">{hint}</p>}
        <p className="message" aria-live="polite">{message}</p>

        {report && (
          <div className="report">
            {report.outcome === 'won' && <p>경험치 +{report.exp} · 코인 +{report.coins}</p>}
            {report.outcome === 'lost' && <p>눈앞이 깜깜해졌다… 오디들이 쉬고 나서 회복했어.</p>}
            {report.caught && (
              <p>{report.caught.name} 포획! {report.caught.toBox ? '팀이 가득 차서 박스로 갔어.' : '팀에 들어왔어.'}</p>
            )}
            {report.levelUps.map((up) => (
              <p key={up.name + up.to}>
                {up.name} Lv.{up.from} → Lv.{up.to}
                {up.newMoves.length > 0 && ` · 새 기술: ${up.newMoves.join(', ')}`}
              </p>
            ))}
            <button className="wide" onClick={() => onFinish(report, ropesLeft)}>계속하기</button>
          </div>
        )}

        {!busy && !showTeam && !bagOpen && (
          <>
            {detail && (
              <div className="move-detail" role="dialog">
                <strong>{detail.name}</strong>
                {moveDetail(detail).map((line) => <div key={line}>{line}</div>)}
                <button onClick={() => setDetail(null)}>닫기</button>
              </div>
            )}
            <div className="moves">
              {me.moves.map((move, moveIndex) => (
                <div key={move.id} className="move-wrap">
                  <button
                    className="move"
                    style={{ borderColor: typeColor(move.type), background: `${typeColor(move.type)}40` }}
                    onPointerDown={() => startPress(move)}
                    onPointerUp={endPress}
                    onPointerLeave={endPress}
                    onPointerCancel={endPress}
                    onClick={() => {
                      if (longPressed.current) { longPressed.current = false; return; }
                      useMove(moveIndex);
                    }}
                  >
                    <span>{move.id === signatureId && <b className="star">★</b>}{move.name}</span>
                    <small>{powerText(move)}</small>
                    <small className="effect-line">{moveSummary(move)}</small>
                  </button>
                  <button className="info" aria-label={`${move.name} 설명`} onClick={() => setDetail(move)}>ⓘ</button>
                </div>
              ))}
            </div>
            <div className="menu-row">
              <button className={tutorial && movesUsed >= 1 ? 'pulse' : ''} onClick={() => setBagOpen(true)}>가방</button>
              <button disabled={player.team.length <= 1} onClick={() => setChoosingSwitch(true)}>교체</button>
              {!tutorial && <button disabled={!canFlee} onClick={flee}>도망</button>}
            </div>
          </>
        )}

        {!busy && bagOpen && !showTeam && (
          <div className="team">
            {(['basic', 'sturdy'] as RopeKind[]).map((kind) => (
              <button key={kind} disabled={ropesLeft[kind] <= 0} onClick={() => throwOne(kind)}>
                로프 던지기: {ROPE_NAMES[kind]} ({ropesLeft[kind]}개)
              </button>
            ))}
            <button onClick={() => setBagOpen(false)}>취소</button>
          </div>
        )}

        {!playing && showTeam && (
          <div className="team">
            {player.team.map((pokemon, teamIndex) => (
              <button
                key={teamIndex}
                disabled={!isLegalAction(state, 0, { kind: 'switch', teamIndex })}
                onClick={() => pickSwitch(teamIndex)}
              >
                {pokemon.name} ({pokemon.hp}/{pokemon.stats.hp})
              </button>
            ))}
            {!mustSwitch && <button onClick={() => setChoosingSwitch(false)}>취소</button>}
          </div>
        )}
      </div>
    </div>
  );
}
