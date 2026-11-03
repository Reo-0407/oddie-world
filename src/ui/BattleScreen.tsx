import { useState } from 'react';
import { speciesById } from '../data/index.ts';
import { isLegalAction } from '../engine/turn.ts';
import type { BattlePokemon, BattleState, Move, Status } from '../engine/types.ts';
import { ROPE_NAMES, tryCatch, type RopeKind } from '../game/capture.ts';
import type { OwnedOddie } from '../game/owned.ts';
import { settleBattle, type BattleOutcome, type BattleReport } from '../game/rewards.ts';
import type { Ropes } from '../world/save.ts';
import { OddieArt } from './OddieArt.tsx';
import { useBattle } from './useBattle.ts';

const powerLabel = (move: Move) =>
  move.category === 'status' ? '변화'
    : move.effects.some((e) => e.kind === 'percent' || e.kind === 'gamble') ? '특수'
    : `위력 ${move.power}`;

const STATUS_LABELS: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '수면' };

function Fighter({ pokemon, hp, view }: { pokemon: BattlePokemon; hp: number; view: 'front' | 'back' }) {
  const percent = Math.round((hp / pokemon.stats.hp) * 100);
  return (
    <div className={`fighter fighter-${view}`}>
      <div className="plate">
        <div className="plate-name">
          {pokemon.name} <small>Lv.{pokemon.level}</small>
          {pokemon.status && <span className="status">{STATUS_LABELS[pokemon.status]}</span>}
        </div>
        <div className="hp-bar" role="progressbar" aria-valuenow={percent}>
          <div className={`hp-fill ${percent < 25 ? 'low' : ''}`} style={{ width: `${percent}%` }} />
        </div>
        {view === 'back' && <div className="hp-text">{hp} / {pokemon.stats.hp}</div>}
      </div>
      <OddieArt name={pokemon.name} types={pokemon.types} size={96} />
    </div>
  );
}

interface Props {
  initial: BattleState;
  /** 전투 전 내 팀(initial의 내 쪽과 같은 순서), 박스, 가진 로프 */
  team: OwnedOddie[];
  box: OwnedOddie[];
  ropes: Ropes;
  onFinish: (report: BattleReport, ropesLeft: Ropes) => void;
}

export function BattleScreen({ initial, team, box, ropes, onFinish }: Props) {
  const { state, shown, message, playing, caught, act, forceSwitch, throwRope } = useBattle(initial);
  const [choosingSwitch, setChoosingSwitch] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [ropesLeft, setRopesLeft] = useState(ropes);

  const player = state.sides[0];
  const opponent = state.sides[1];
  const mustSwitch = state.pendingSwitch[0];
  const over = state.winner !== null || caught;
  const showTeam = (choosingSwitch || mustSwitch) && !over;
  const wild = opponent.team[0];

  const throwOne = (kind: RopeKind) => {
    if (ropesLeft[kind] <= 0) return;
    setBagOpen(false);
    setRopesLeft({ ...ropesLeft, [kind]: ropesLeft[kind] - 1 });
    const target = opponent.team[opponent.active];
    const { success } = tryCatch(speciesById(target.speciesId).rarity, target.hp / target.stats.hp, target.status, kind);
    throwRope(success);
  };

  const report = over && !playing
    ? settleBattle({
      outcome: (caught ? 'caught' : state.winner === 0 ? 'won' : 'lost') as BattleOutcome,
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

  return (
    <main className="screen battle">
      <div className="arena">
        <Fighter pokemon={opponent.team[shown.active[1]]} hp={shown.hp[1]} view="front" />
        <Fighter pokemon={player.team[shown.active[0]]} hp={shown.hp[0]} view="back" />
      </div>

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
          <button className="wide" onClick={() => onFinish(report, ropesLeft)}>월드로</button>
        </div>
      )}

      {!over && !playing && !showTeam && !bagOpen && (
        <div className="moves">
          {player.team[player.active].moves.map((move, moveIndex) => (
            <button key={move.id} className={`move type-${move.type}`} onClick={() => act({ kind: 'move', moveIndex })}>
              {move.name}
              <small>{powerLabel(move)}</small>
            </button>
          ))}
          {player.team.length > 1 && (
            <button className="wide" onClick={() => setChoosingSwitch(true)}>오디 교체</button>
          )}
          <button className="wide" onClick={() => setBagOpen(true)}>가방</button>
        </div>
      )}

      {!over && !playing && bagOpen && !showTeam && (
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
    </main>
  );
}
