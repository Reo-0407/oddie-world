import { useState } from 'react';
import { MOVES, speciesById } from './data/index.ts';
import type { BattleState } from './engine/types.ts';
import { createBattle, createBattlePokemon } from './game/factory.ts';
import { highestLevel, type OwnedOddie } from './game/owned.ts';
import type { BattleReport } from './game/rewards.ts';
import { BattleScreen } from './ui/BattleScreen.tsx';
import { CharacterScreen } from './ui/CharacterScreen.tsx';
import { StarterScreen } from './ui/StarterScreen.tsx';
import { WorldView } from './ui/WorldView.tsx';
import { clearSave, loadSave, newSave, START_LEVEL, writeSave, type Ropes, type SaveData } from './world/save.ts';
import './ui/app.css';

interface ActiveBattle {
  state: BattleState;
  wildId: number;
  wildLevel: number;
}

function startBattle(team: OwnedOddie[], wildId: number, wildLevel: number): ActiveBattle {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const mine = team.map((oddie) => createBattlePokemon(speciesById(oddie.speciesId), oddie.level, MOVES));
  const wild = createBattlePokemon(speciesById(wildId), wildLevel, MOVES);
  return { state: createBattle(mine, [wild], seed), wildId, wildLevel };
}

export default function App() {
  const [data, setData] = useState<SaveData | null>(() => loadSave());
  const [battle, setBattle] = useState<ActiveBattle | null>(null);

  const update = (next: SaveData) => {
    setData(next);
    writeSave(next);
  };

  const restart = () => {
    clearSave();
    setData(null);
    setBattle(null);
  };

  const finishBattle = (report: BattleReport, ropes: Ropes) => {
    if (!data) return;
    update({
      ...data,
      team: report.team,
      box: report.box,
      ropes,
      coins: data.coins + report.coins,
      playerLevel: highestLevel(report.team, START_LEVEL),
    });
    setBattle(null);
  };

  let screen;
  if (!data) {
    screen = <CharacterScreen onDone={(name, characterIndex) => update(newSave(name, characterIndex))} />;
  } else if (data.team.length === 0) {
    screen = (
      <StarterScreen
        onPick={(id) => update({ ...data, team: [{ speciesId: id, level: START_LEVEL, exp: 0 }], playerLevel: START_LEVEL })}
      />
    );
  } else {
    // 월드는 전투 중에도 켜 둔 채 멈춰 둔다 (오디 위치·카메라 유지)
    screen = (
      <>
        <div style={{ display: battle ? 'none' : 'block' }}>
          <WorldView
            name={data.name}
            characterIndex={data.characterIndex}
            team={data.team}
            ropes={data.ropes}
            coins={data.coins}
            paused={battle !== null}
            onDuel={(wildId, level) => setBattle(startBattle(data.team, wildId, level))}
          />
          <div className="world-bar">
            <button onClick={restart}>새로 시작</button>
          </div>
        </div>
        {battle && (
          <BattleScreen
            initial={battle.state}
            team={data.team}
            box={data.box}
            ropes={data.ropes}
            onFinish={finishBattle}
          />
        )}
      </>
    );
  }

  return (
    <>
      {screen}
      <footer>「Catch an Oddie」의 캐릭터로 만든 학교 활동 게임입니다.</footer>
    </>
  );
}
