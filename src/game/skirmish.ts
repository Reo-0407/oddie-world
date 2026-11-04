import { chooseAiAction } from '../engine/ai.ts';
import { resolveTurn } from '../engine/turn.ts';
import type { BattlePokemon, BattleState, Status } from '../engine/types.ts';
import { eventMessage } from '../ui/messages.ts';
import { createBattle } from './factory.ts';

export const SKIRMISH_TURNS = 4;

export interface SkirmishResult {
  wildHpRatio: number;
  wildFainted: boolean;
  wildStatus: Status | null;
  playerHpRatio: number;
  playerFainted: boolean;
  log: string[];
}

/** 「출동!」: 내 오디와 야생 오디가 엔진 AI로 자동 전투 (최대 4턴). 입력은 바뀌지 않는다 */
export function autoSkirmish(
  player: BattlePokemon, wild: BattlePokemon, seed: number, maxTurns = SKIRMISH_TURNS,
): SkirmishResult {
  let state: BattleState = createBattle([structuredClone(player)], [structuredClone(wild)], seed);
  const log: string[] = [];
  for (let turn = 0; turn < maxTurns && state.winner === null; turn += 1) {
    const result = resolveTurn(state, [chooseAiAction(state, 0), chooseAiAction(state, 1)]);
    for (const event of result.events) {
      const text = eventMessage(event);
      if (text) log.push(text);
    }
    // 한 마리씩이라 교체할 상대가 없다
    state = { ...result.state, pendingSwitch: [false, false], pivoting: [false, false] };
  }
  const me = state.sides[0].team[0];
  const foe = state.sides[1].team[0];
  return {
    wildHpRatio: foe.hp / foe.stats.hp,
    wildFainted: foe.hp <= 0,
    wildStatus: foe.status,
    playerHpRatio: me.hp / me.stats.hp,
    playerFainted: me.hp <= 0,
    log,
  };
}
