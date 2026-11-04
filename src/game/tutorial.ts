import type { BattlePokemon, BattleState } from '../engine/types.ts';
import type { BattleOutcome } from './rewards.ts';

/** 첫 결투(튜토리얼): 약한 야생 오디, 낮은 체력, 도망 없음, 첫 로프는 반드시 성공 */
export const TUTORIAL_HP_RATIO = 0.35;
export const TUTORIAL_LEVEL_GAP = 4;
export const TUTORIAL_MIN_LEVEL = 3;

export function tutorialWildLevel(teamLevel: number): number {
  return Math.max(TUTORIAL_MIN_LEVEL, teamLevel - TUTORIAL_LEVEL_GAP);
}

/** 체력을 비율로 낮춘다 (최소 1). 원본은 바꾸지 않는다 */
export function withHpRatio(pokemon: BattlePokemon, ratio: number): BattlePokemon {
  const hp = Math.max(1, Math.min(pokemon.stats.hp, Math.round(pokemon.stats.hp * ratio)));
  return { ...pokemon, hp };
}

/** movesUsed: 지금까지 내가 기술을 쓴 횟수 */
export function tutorialHint(movesUsed: number): string {
  return movesUsed === 0
    ? '기술을 골라 공격해 봐!'
    : '체력이 줄었어! 가방에서 로프를 던져 봐';
}

/** 전투 결과 판정: 잡았으면 caught, 아니면 승패. 아직 안 끝났으면 null */
export function battleOutcome(state: BattleState, caught: boolean): BattleOutcome | null {
  if (caught) return 'caught';
  if (state.winner === 0) return 'won';
  if (state.winner === 1) return 'lost';
  return null;
}
