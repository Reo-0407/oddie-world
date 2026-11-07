import { useState } from 'react';
import { CharacterScreen } from './ui/CharacterScreen.tsx';
import { StarterScreen } from './ui/StarterScreen.tsx';
import { OnlineScreen } from './ui/OnlineScreen.tsx';
import { WorldView } from './ui/WorldView.tsx';
import { clearSave, loadSave, newSave, START_LEVEL, writeSave, type SaveData } from './world/save.ts';
import './ui/app.css';

export default function App() {
  const [data, setData] = useState<SaveData | null>(() => loadSave());
  const [online, setOnline] = useState(false);

  const update = (next: SaveData) => {
    setData(next);
    writeSave(next);
  };

  const restart = () => {
    clearSave();
    setData(null);
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
  } else if (online) {
    screen = <OnlineScreen name={data.name} owned={[...data.team, ...data.box]} onClose={() => setOnline(false)} />;
  } else {
    screen = (
      <>
        <WorldView data={data} onData={update} />
        <div className="world-bar">
          <button onClick={() => setOnline(true)}>친구 대전</button>
          <button onClick={restart}>새로 시작</button>
        </div>
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
