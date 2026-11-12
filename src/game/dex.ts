import type { OwnedOddie } from './owned.ts';

/** 도감 기록: 만난(seen) 종과 잡은(caught) 종의 번호. 순수 클라이언트 기록이고 항상 caught ⊆ seen, 번호순 중복 없음 */
export interface Dex {
  seen: number[];
  caught: number[];
  /** 반짝이로 잡은 종(옛 저장에는 없다) */
  shinyCaught?: number[];
}

export type DexStatus = 'caught' | 'seen' | 'unknown';

export const emptyDex = (): Dex => ({ seen: [], caught: [] });

const insertSorted = (list: number[], id: number): number[] => {
  if (list.includes(id)) return list;
  return [...list, id].sort((a, b) => a - b);
};

/** 만났다고 적는다. 이미 있으면 같은 객체를 그대로 돌려준다(불필요한 저장을 피한다) */
export function markSeen(dex: Dex, id: number): Dex {
  const seen = insertSorted(dex.seen, id);
  return seen === dex.seen ? dex : { ...dex, seen };
}

/** 잡았다고 적는다(만난 것으로도 적힌다) */
export function markCaught(dex: Dex, id: number): Dex {
  const seen = insertSorted(dex.seen, id);
  const caught = insertSorted(dex.caught, id);
  return seen === dex.seen && caught === dex.caught ? dex : { ...dex, seen, caught };
}

/** 반짝이로 잡았다고 적는다(잡은 것으로도 적힌다) */
export function markShiny(dex: Dex, id: number): Dex {
  const base = markCaught(dex, id);
  const list = base.shinyCaught ?? [];
  const shinyCaught = insertSorted(list, id);
  return shinyCaught === list && base.shinyCaught ? base : { ...base, shinyCaught };
}

/** 두 도감의 합집합 (저장 두 개를 합칠 때 기록이 줄지 않게) */
export function mergeDex(a: Dex, b: Dex): Dex {
  const union = (x: number[], y: number[]) => [...new Set([...x, ...y])].sort((p, q) => p - q);
  const caught = union(a.caught, b.caught);
  const merged: Dex = { seen: union(union(a.seen, b.seen), caught), caught };
  if (a.shinyCaught?.length || b.shinyCaught?.length) merged.shinyCaught = union(a.shinyCaught ?? [], b.shinyCaught ?? []);
  return merged;
}

/** 옛 저장(도감이 없던 때): 지금 팀과 박스에 있는 오디를 잡은 것으로 본다 */
export function dexFromOwned(owned: readonly OwnedOddie[]): Dex {
  return owned.reduce((dex, oddie) => markCaught(dex, oddie.speciesId), emptyDex());
}

export function dexStatus(dex: Dex, id: number): DexStatus {
  if (dex.caught.includes(id)) return 'caught';
  return dex.seen.includes(id) ? 'seen' : 'unknown';
}

export interface DexProgress {
  caught: number;
  /** 만난 종 수 (잡은 종 포함) */
  seen: number;
  total: number;
}

export function dexProgress(dex: Dex, total: number): DexProgress {
  const valid = (id: number) => id >= 1 && id <= total;
  return { caught: dex.caught.filter(valid).length, seen: dex.seen.filter(valid).length, total };
}

/** 저장에서 읽은 값을 믿지 않고 정리한다: 정수 1~999만, 중복 제거, caught는 seen에도 포함 */
export function cleanDex(value: unknown): Dex {
  const ids = (list: unknown): number[] => (Array.isArray(list) ? list : [])
    .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= 999)
    .slice(0, 1000);
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const caught = [...new Set(ids(raw.caught))].sort((a, b) => a - b);
  const seen = [...new Set([...ids(raw.seen), ...caught])].sort((a, b) => a - b);
  const shiny = [...new Set(ids(raw.shinyCaught))].filter((id) => caught.includes(id)).sort((a, b) => a - b);
  return shiny.length ? { seen, caught, shinyCaught: shiny } : { seen, caught };
}

/** 새 종을 5마리 잡을 때마다 주는 도감 보상. 넘어간 칸마다 합쳐서 준다 */
export const DEX_MILESTONE_STEP = 5;
export function dexMilestoneReward(beforeCaught: number, afterCaught: number): { steps: number; coins: number; ropes: number; sturdy: number } | null {
  const steps = Math.floor(afterCaught / DEX_MILESTONE_STEP) - Math.floor(beforeCaught / DEX_MILESTONE_STEP);
  if (steps <= 0) return null;
  return { steps, coins: 150 * steps, ropes: 3 * steps, sturdy: steps };
}
