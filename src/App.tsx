import { useState } from 'react';
import { MOVES, speciesById } from './data/index.ts';
import type { BattleState } from './engine/types.ts';
import { createBattle, createBattlePokemon } from './game/factory.ts';
import { BattleScreen } from './ui/BattleScreen.tsx';
import { StarterScreen } from './ui/StarterScreen.tsx';
import './ui/app.css';

const PLAYER_LEVEL = 10;
const WILD_IDS = [2, 3, 4];

function startBattle(starterId: number): BattleState {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const wildId = WILD_IDS[seed % WILD_IDS.length];
  const player = createBattlePokemon(speciesById(starterId), PLAYER_LEVEL, MOVES);
  const wild = createBattlePokemon(speciesById(wildId), PLAYER_LEVEL, MOVES);
  return createBattle([player], [wild], seed);
}

export default function App() {
  const [battle, setBattle] = useState<BattleState | null>(null);
  return (
    <>
      {battle
        ? <BattleScreen initial={battle} onExit={() => setBattle(null)} />
        : <StarterScreen onPick={(id) => setBattle(startBattle(id))} />}
      <footer>「Catch an Oddie」의 캐릭터로 만든 학교 활동 게임입니다.</footer>
    </>
  );
}
