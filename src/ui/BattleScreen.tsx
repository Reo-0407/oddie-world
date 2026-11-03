import { useState } from 'react';
import { isLegalAction } from '../engine/turn.ts';
import type { BattlePokemon, BattleState, Move, Status } from '../engine/types.ts';
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
  onExit: () => void;
}

export function BattleScreen({ initial, onExit }: Props) {
  const { state, shown, message, playing, act, forceSwitch } = useBattle(initial);
  const [choosingSwitch, setChoosingSwitch] = useState(false);

  const player = state.sides[0];
  const opponent = state.sides[1];
  const mustSwitch = state.pendingSwitch[0];
  const over = state.winner !== null;
  const showTeam = (choosingSwitch || mustSwitch) && !over;

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

      {over && !playing && <button className="wide" onClick={onExit}>처음으로</button>}

      {!over && !playing && !showTeam && (
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
