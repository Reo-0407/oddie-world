import { useState } from 'react';
import { MOVES, speciesById } from './data/index.ts';
import type { BattleState } from './engine/types.ts';
import { createBattle, createBattlePokemon } from './game/factory.ts';
import { BattleScreen } from './ui/BattleScreen.tsx';
import { CharacterScreen } from './ui/CharacterScreen.tsx';
import { StarterScreen } from './ui/StarterScreen.tsx';
import { WorldView } from './ui/WorldView.tsx';
import { clearSave, loadSave, writeSave, type SaveData } from './world/save.ts';
import './ui/app.css';

const PLAYER_LEVEL = 10;

function startBattle(starterId: number, wildId: number, wildLevel: number): BattleState {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const player = createBattlePokemon(speciesById(starterId), PLAYER_LEVEL, MOVES);
  const wild = createBattlePokemon(speciesById(wildId), wildLevel, MOVES);
  return createBattle([player], [wild], seed);
}

export default function App() {
  const [save, setSave] = useState<SaveData | null>(() => loadSave());
  const [profile, setProfile] = useState<{ name: string; characterIndex: number } | null>(
    () => (save ? { name: save.name, characterIndex: save.characterIndex } : null),
  );
  const [starterId, setStarterId] = useState<number | null>(() => save?.starterId ?? null);
  const [battle, setBattle] = useState<BattleState | null>(null);

  const restart = () => {
    clearSave();
    setSave(null);
    setProfile(null);
    setStarterId(null);
    setBattle(null);
  };

  let screen;
  if (!profile) {
    screen = (
      <CharacterScreen
        onDone={(name, characterIndex) => {
          setProfile({ name, characterIndex });
          writeSave({ name, characterIndex, starterId: null });
        }}
      />
    );
  } else if (starterId === null) {
    screen = (
      <StarterScreen
        onPick={(id) => {
          setStarterId(id);
          writeSave({ ...profile, starterId: id });
        }}
      />
    );
  } else {
    // 월드는 전투 중에도 켜 둔 채 멈춰 둔다 (오디 위치·카메라 유지)
    screen = (
      <>
        <div style={{ display: battle ? 'none' : 'block' }}>
          <WorldView
            name={profile.name}
            characterIndex={profile.characterIndex}
            playerLevel={PLAYER_LEVEL}
            paused={battle !== null}
            onDuel={(wildId, level) => setBattle(startBattle(starterId, wildId, level))}
          />
          <div className="world-bar">
            <button onClick={restart}>새로 시작</button>
          </div>
        </div>
        {battle && <BattleScreen initial={battle} onExit={() => setBattle(null)} />}
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
