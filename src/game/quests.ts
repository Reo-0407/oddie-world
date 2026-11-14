import type { TypeName } from '../engine/types.ts';
import { REGION_IDS, REGIONS, type RegionId } from '../overworld/regions.ts';

/** 오디 센터 퀘스트 게시판: 늘 3개, 끝내면 보상을 받고 새 퀘스트로 바뀐다 */
export type QuestKind = 'catchType' | 'catchAny' | 'winWild' | 'excellent' | 'findItem' | 'beatTrainer' | 'fish' | 'powerUp';
export const QUEST_KINDS: readonly QuestKind[] = ['catchType', 'catchAny', 'winWild', 'excellent', 'findItem', 'beatTrainer', 'fish', 'powerUp'];

export interface QuestReward { coins: number; basic: number; sturdy: number; potions: number }
export interface Quest {
  id: number;
  kind: QuestKind;
  /** catchType만: 잡아야 할 타입 */
  type?: TypeName;
  goal: number;
  progress: number;
  reward: QuestReward;
}
export interface QuestState {
  list: Quest[];
  /** 다음 퀘스트 번호 */
  next: number;
  /** 지금까지 끝낸 퀘스트 수 */
  done: number;
}

export type QuestEvent =
  | { kind: 'catch'; types: readonly TypeName[] }
  | { kind: 'winWild' }
  | { kind: 'excellent'; n?: number }
  | { kind: 'findItem' }
  | { kind: 'beatTrainer' }
  | { kind: 'fish' }
  | { kind: 'powerUp' };

/** 지금 할 수 있는지 판단할 재료: 남은 트레이너·숨은 물건 수 */
export interface QuestCtx { region: RegionId; trainersLeft: number; itemsLeft: number; /** 낚싯대가 있나(없으면 낚시 퀘스트는 안 나온다) */ hasRod?: boolean }

export const QUEST_SLOTS = 3;
const TYPE_NAMES: Record<TypeName, string> = {
  normal: '노말', fire: '불꽃', water: '물', electric: '전기', grass: '풀', ice: '얼음', fighting: '격투', poison: '독',
  ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레', rock: '바위', ghost: '고스트', dragon: '드래곤',
  dark: '악', steel: '강철', fairy: '페어리',
};

const tierOf = (r: RegionId) => Math.max(0, REGION_IDS.indexOf(r));

/** 구역이 뒤일수록 목표·보상이 커진다 */
function goalFor(kind: QuestKind, tier: number, rand: () => number): number {
  const pick = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  switch (kind) {
    case 'catchType': return pick(2, 3) + (tier >= 2 ? 1 : 0);
    case 'catchAny': return pick(3, 4) + tier;
    case 'winWild': return pick(4, 6) + tier;
    case 'excellent': return tier >= 2 ? 2 : pick(1, 2);
    case 'findItem': return 1;
    case 'beatTrainer': return tier >= 1 ? 2 : 1;
    case 'fish': return 2;
    case 'powerUp': return 1;
  }
}

function rewardFor(kind: QuestKind, goal: number, tier: number): QuestReward {
  const scale = 1 + tier * 0.75;
  const r: QuestReward = { coins: Math.round((60 + goal * 30) * scale / 10) * 10, basic: 0, sturdy: 0, potions: 0 };
  if (kind === 'catchType' || kind === 'catchAny') r.basic = 3 + tier;
  else if (kind === 'winWild') r.potions = 1 + Math.floor(tier / 2);
  else if (kind === 'excellent') r.sturdy = 1 + Math.floor(tier / 2);
  else if (kind === 'findItem' || kind === 'fish') r.basic = 2 + tier;
  else if (kind === 'powerUp') r.potions = 1;
  else { r.sturdy = 1; r.potions = 1; }
  return r;
}

/** 아직 할 수 있는 퀘스트인가(트레이너·숨은 물건이 모자라면 안 된다) */
export function feasible(q: Pick<Quest, 'kind' | 'goal' | 'progress'>, ctx: QuestCtx): boolean {
  const need = q.goal - q.progress;
  if (q.kind === 'beatTrainer') return ctx.trainersLeft >= need;
  if (q.kind === 'findItem') return ctx.itemsLeft >= need;
  if (q.kind === 'fish') return !!ctx.hasRod;
  return true;
}

/** 새 퀘스트 하나: 이미 있는 종류는 피한다 */
export function makeQuest(id: number, ctx: QuestCtx, rand: () => number, avoid: readonly QuestKind[] = []): Quest {
  const tier = tierOf(ctx.region);
  const ok = (k: QuestKind) => !avoid.includes(k) && feasible({ kind: k, goal: goalFor(k, tier, () => 0), progress: 0 }, ctx);
  const kinds = QUEST_KINDS.filter(ok);
  const pool = kinds.length ? kinds : (['catchAny', 'winWild'] as QuestKind[]);
  const kind = pool[Math.floor(rand() * pool.length)];
  const goal = goalFor(kind, tier, rand);
  const q: Quest = { id, kind, goal, progress: 0, reward: rewardFor(kind, goal, tier) };
  if (kind === 'catchType') {
    const types = Object.keys(REGIONS[ctx.region].typeWeights) as TypeName[];
    q.type = types[Math.floor(rand() * types.length)];
  }
  return q;
}

/** 못 하게 된 퀘스트는 빼고 3개가 되게 채운다. 바뀐 게 없으면 같은 객체 */
export function fillQuests(state: QuestState | undefined, ctx: QuestCtx, rand: () => number): QuestState {
  const base = state ?? { list: [], next: 1, done: 0 };
  const list = base.list.filter((q) => feasible(q, ctx));
  if (state && list.length === base.list.length && list.length >= QUEST_SLOTS) return state;
  let next = base.next;
  while (list.length < QUEST_SLOTS) {
    list.push(makeQuest(next, ctx, rand, list.map((q) => q.kind)));
    next += 1;
  }
  return { list, next, done: base.done };
}

const matches = (q: Quest, ev: QuestEvent): number => {
  switch (ev.kind) {
    case 'catch': return q.kind === 'catchAny' || (q.kind === 'catchType' && !!q.type && ev.types.includes(q.type)) ? 1 : 0;
    case 'winWild': return q.kind === 'winWild' ? 1 : 0;
    case 'excellent': return q.kind === 'excellent' ? ev.n ?? 1 : 0;
    case 'findItem': return q.kind === 'findItem' ? 1 : 0;
    case 'beatTrainer': return q.kind === 'beatTrainer' ? 1 : 0;
    case 'fish': return q.kind === 'fish' ? 1 : 0;
    case 'powerUp': return q.kind === 'powerUp' ? 1 : 0;
  }
};

/** 일어난 일로 진행도를 올리고, 끝난 퀘스트는 completed로 돌려주고 새 것으로 바꾼다 */
export function advanceQuests(state: QuestState | undefined, ev: QuestEvent, ctx: QuestCtx, rand: () => number): { state: QuestState; completed: Quest[] } {
  const cur = fillQuests(state, ctx, rand);
  const completed: Quest[] = [];
  let changed = false;
  const kept: Quest[] = [];
  for (const q of cur.list) {
    const n = matches(q, ev);
    if (n <= 0) { kept.push(q); continue; }
    changed = true;
    const progress = Math.min(q.goal, q.progress + n);
    if (progress >= q.goal) completed.push({ ...q, progress });
    else kept.push({ ...q, progress });
  }
  if (!changed) return { state: cur, completed };
  const filled = fillQuests({ list: kept, next: cur.next, done: cur.done + completed.length }, ctx, rand);
  return { state: filled, completed };
}

export function questText(q: Pick<Quest, 'kind' | 'goal' | 'type'>): string {
  switch (q.kind) {
    case 'catchType': return `${q.type ? TYPE_NAMES[q.type] : ''} 타입 오디 ${q.goal}마리 잡기`;
    case 'catchAny': return `야생 오디 ${q.goal}마리 잡기`;
    case 'winWild': return `야생 오디 ${q.goal}번 이기기`;
    case 'excellent': return `Excellent 던지기 ${q.goal}번`;
    case 'findItem': return `숨은 아이템 ${q.goal}개 찾기`;
    case 'beatTrainer': return `트레이너 ${q.goal}명 이기기`;
    case 'fish': return `낚시로 오디 ${q.goal}번 낚기`;
    case 'powerUp': return `오디 강화 ${q.goal}번`;
  }
}

export function rewardText(r: QuestReward): string {
  return [
    `코인 +${r.coins}`, r.basic && `로프 +${r.basic}`, r.sturdy && `튼튼한 로프 +${r.sturdy}`, r.potions && `회복약 +${r.potions}`,
  ].filter(Boolean).join(', ');
}

/** 저장에서 읽은 값을 믿지 않고 정리한다. 모양이 틀리면 undefined(다시 만든다) */
export function parseQuests(value: unknown): QuestState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const n = (x: unknown, max = 1e6) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max ? x : null);
  if (!Array.isArray(v.list)) return undefined;
  const list: Quest[] = [];
  for (const raw of v.list.slice(0, QUEST_SLOTS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const q = raw as Record<string, unknown>;
    const r = (q.reward ?? {}) as Record<string, unknown>;
    const id = n(q.id), goal = n(q.goal, 99), progress = n(q.progress, 99);
    if (id === null || !goal || progress === null || !QUEST_KINDS.includes(q.kind as QuestKind)) continue;
    const type = typeof q.type === 'string' && q.type in TYPE_NAMES ? (q.type as TypeName) : undefined;
    if (q.kind === 'catchType' && !type) continue;
    list.push({
      id, kind: q.kind as QuestKind, goal, progress: Math.min(progress, goal), ...(type ? { type } : {}),
      reward: { coins: n(r.coins, 99999) ?? 0, basic: n(r.basic, 99) ?? 0, sturdy: n(r.sturdy, 99) ?? 0, potions: n(r.potions, 99) ?? 0 },
    });
  }
  return { list, next: Math.max(n(v.next) ?? 1, ...list.map((q) => q.id + 1)), done: n(v.done) ?? 0 };
}
