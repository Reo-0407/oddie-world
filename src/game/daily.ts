import type { SaveData } from './save.ts';

/** 매일 보상: 하루(이 기기의 날짜)에 한 번, 7일 연속 달력. 하루라도 거르면 1일째부터 */

export interface DailyState {
  /** 마지막으로 받은 날 YYYY-MM-DD */
  last: string;
  /** 그날이 연속 며칠째였나(1~7) */
  streak: number;
  /** 7일째 보상을 받은 날: 그날 하루 반짝이 확률이 오른다 */
  shinyDay?: string;
}

export interface DailyReward { coins: number; basic: number; sturdy: number; potions: number; shiny?: boolean }
export const DAILY_REWARDS: readonly DailyReward[] = [
  { coins: 150, basic: 0, sturdy: 0, potions: 0 },
  { coins: 0, basic: 5, sturdy: 0, potions: 0 },
  { coins: 200, basic: 0, sturdy: 2, potions: 0 },
  { coins: 0, basic: 0, sturdy: 0, potions: 3 },
  { coins: 300, basic: 5, sturdy: 0, potions: 0 },
  { coins: 0, basic: 0, sturdy: 3, potions: 2 },
  { coins: 0, basic: 0, sturdy: 5, potions: 0, shiny: true },
];
/** 7일째 받은 날의 반짝이 확률 배율 */
export const DAILY_SHINY_BOOST = 3;

let dayOffset = 0;
/** 개발용: 날짜를 n일 앞으로(되돌리기 0) */
export function setDayOffset(n: number) { dayOffset = n; }

const pad = (n: number) => String(n).padStart(2, '0');
/** 이 기기 시계의 날짜 YYYY-MM-DD */
export function localDay(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 두 날짜 사이 날 수(b - a) */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** 오늘 받을 차례면 연속 며칠째인지(1~7), 이미 받았으면 null */
export function dailyDue(state: DailyState | undefined, today: string): number | null {
  if (!state) return 1;
  const gap = daysBetween(state.last, today);
  if (gap <= 0) return null; // 오늘 받았다(시계를 뒤로 돌려도 두 번 받지 않는다)
  return gap === 1 ? (state.streak % DAILY_REWARDS.length) + 1 : 1;
}

/** 오늘 보상을 받는다. 이미 받았으면 null */
export function claimDaily(save: SaveData, today: string): { save: SaveData; day: number; reward: DailyReward } | null {
  const day = dailyDue(save.daily, today);
  if (day === null) return null;
  const reward = DAILY_REWARDS[day - 1];
  const daily: DailyState = { last: today, streak: day };
  if (reward.shiny) daily.shinyDay = today;
  return {
    day, reward,
    save: {
      ...save, daily, coins: save.coins + reward.coins, potions: save.potions + reward.potions,
      ropes: { basic: save.ropes.basic + reward.basic, sturdy: save.ropes.sturdy + reward.sturdy },
    },
  };
}

/** 오늘의 반짝이 확률 배율 */
export const shinyBoost = (save: Pick<SaveData, 'daily'>, today: string) => (save.daily?.shinyDay === today ? DAILY_SHINY_BOOST : 1);

export function dailyText(r: DailyReward): string {
  return [
    r.coins && `코인 ${r.coins}`, r.basic && `로프 ${r.basic}`, r.sturdy && `튼튼한 로프 ${r.sturdy}`, r.potions && `회복약 ${r.potions}`,
    r.shiny && '오늘 반짝이 ×3',
  ].filter(Boolean).join(' · ');
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function parseDaily(value: unknown): DailyState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.last !== 'string' || !DAY_RE.test(v.last)) return undefined;
  const streak = typeof v.streak === 'number' && Number.isInteger(v.streak) ? Math.min(DAILY_REWARDS.length, Math.max(1, v.streak)) : 1;
  const out: DailyState = { last: v.last, streak };
  if (typeof v.shinyDay === 'string' && DAY_RE.test(v.shinyDay)) out.shinyDay = v.shinyDay;
  return out;
}
