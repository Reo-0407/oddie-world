import type { StatKey, Stages } from './types.ts';

export const MAX_STAGE = 6;

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function staged(value: number, stage: number): number {
  return Math.max(1, Math.floor(value * stageMultiplier(stage)));
}

/** 단계를 바꾸고 실제로 바뀐 만큼을 돌려준다. 한계에 막히면 0이다 */
export function changeStage(stages: Stages, stat: StatKey, delta: number): number {
  const next = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stages[stat] + delta));
  const applied = next - stages[stat];
  stages[stat] = next;
  return applied;
}
