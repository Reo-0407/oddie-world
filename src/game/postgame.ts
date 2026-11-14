import { SPECIES } from '../data/index.ts';
import { BADGE_ORDER, TRAINERS, type Trainer } from '../overworld/encounters.ts';
import { MAX_LEVEL } from './growth.ts';
import type { SaveData } from './save.ts';

/** 챔피언을 이긴 뒤: 관장 재도전(하루 한 번)과 주간 레이드 보스 */

export const REMATCH_LEVELS = 12;
export const REMATCH_RARE_CANDY = 3;
export const REMATCH_PREFIX = 'rematch:';

/** 관장 재도전 팀: 레벨 +12, 기술은 다 배운 것 중 가장 센 것들(최대 레벨 기준) */
export function rematchTrainer(leaderId: string): Trainer | undefined {
  const base = TRAINERS[leaderId];
  if (!base?.badge) return undefined;
  const tier = BADGE_ORDER.indexOf(base.badge);
  return {
    ...base,
    name: `${base.name} (재도전)`,
    team: base.team.map((m) => ({ ...m, level: Math.min(MAX_LEVEL, m.level + REMATCH_LEVELS), moveLevel: MAX_LEVEL })),
    reward: 2000 + tier * 600,
    lines: { before: '', after: '다시 붙어도 역시 강하구나! 내일 또 오렴.' },
  };
}

/** 오늘 이 관장과 다시 싸울 수 있나: 챔피언을 이겼고, 오늘 아직 안 싸웠다 */
export function canRematch(save: Pick<SaveData, 'flags' | 'rematch'>, leaderId: string, today: string): boolean {
  return save.flags.includes('champion') && !!TRAINERS[leaderId]?.badge && save.rematch?.[leaderId] !== today;
}

// ---------- 레이드 ----------

export const RAID_LEVEL = 40;
export const RAID_HP = 5;
export const RAID_MS = 3 * 60_000;
export const RAID_TEAM = 3;
/** 레이드는 자유롭게 바꿔 낀다 */
export const RAID_SWITCH_MS = 500;
export const RAID_ROPES = 5;
export const RAID_COINS = 1500;
const LEGENDS = SPECIES.filter((s) => s.rarity === 'Legendary').map((s) => s.id);

/** ISO 주 번호 'YYYY-Www' (날짜 YYYY-MM-DD 기준) */
export function isoWeek(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow); // 그 주의 목요일
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 그 주의 레이드 보스(주 번호로 정해져 한 주 내내 같다) */
export function raidBoss(week: string): { speciesId: number; level: number } {
  let h = 2166136261;
  for (const ch of week) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { speciesId: LEGENDS[h % LEGENDS.length], level: RAID_LEVEL };
}

/** 이번 주 레이드에 도전할 수 있나: 챔피언을 이겼고, 이번 주에 아직 이기지 않았다 */
export const raidOpen = (save: Pick<SaveData, 'flags' | 'raid'>, week: string) => save.flags.includes('champion') && save.raid?.week !== week;
