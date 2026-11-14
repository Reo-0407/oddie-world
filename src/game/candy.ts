import { speciesById } from '../data/index.ts';
import { expToNext, MAX_LEVEL } from './growth.ts';
import { highestLevel, MAX_TEAM, type OwnedOddie } from './owned.ts';
import { START_LEVEL, type SaveData } from './save.ts';

/** 포켓몬 고식 사탕과 강화: 진화가 없으니 종마다 사탕을 모아 레벨을 올린다 */

export const CATCH_CANDY = 3;
export const TRANSFER_CANDY = 1;
/** 이상한 사탕: 어느 종에나 쓸 수 있다(재도전 보상) */
export const RARE_CANDY_NAME = '이상한 사탕';

/** 잡으면 받는 사탕: 3개, 2연속부터 연속마다 +1(최대 +3) */
export const catchCandy = (combo = 1) => CATCH_CANDY + Math.min(3, Math.max(0, combo - 1));

/** 배지 수에 따른 강화 상한 레벨 */
export const LEVEL_CAPS = [15, 22, 28, 34, MAX_LEVEL] as const;
export const levelCap = (badges: number) => LEVEL_CAPS[Math.max(0, Math.min(LEVEL_CAPS.length - 1, badges))];

/** 레벨 하나 올리는 값: 사탕 1~5개(10레벨마다 +1), 코인 레벨×20 */
export function powerUpCost(level: number): { candy: number; coins: number } {
  return { candy: 1 + Math.floor(level / 10), coins: level * 20 };
}

export const candyOf = (save: Pick<SaveData, 'candy'>, speciesId: number) => save.candy?.[speciesId] ?? 0;

export function addCandy(save: SaveData, speciesId: number, n: number): SaveData {
  if (n <= 0) return save;
  return { ...save, candy: { ...save.candy, [speciesId]: Math.min(99999, candyOf(save, speciesId) + n) } };
}

export type Where = 'team' | 'box';
const listOf = (save: SaveData, where: Where) => (where === 'team' ? save.team : save.box);

export type PowerBlock = 'max' | 'cap' | 'candy' | 'coins';
/** 강화할 수 없는 까닭(할 수 있으면 null). 종 사탕이 모자라면 이상한 사탕으로 채운다 */
export function powerUpBlock(save: SaveData, o: OwnedOddie): PowerBlock | null {
  if (o.level >= MAX_LEVEL) return 'max';
  if (o.level >= levelCap(save.badges.length)) return 'cap';
  const cost = powerUpCost(o.level);
  if (candyOf(save, o.speciesId) + (save.rareCandy ?? 0) < cost.candy) return 'candy';
  if (save.coins < cost.coins) return 'coins';
  return null;
}

/** 레벨 하나 강화. 못 하면 null */
export function powerUp(save: SaveData, where: Where, index: number): SaveData | null {
  const o = listOf(save, where)[index];
  if (!o || powerUpBlock(save, o)) return null;
  const cost = powerUpCost(o.level);
  const own = candyOf(save, o.speciesId);
  const fromOwn = Math.min(own, cost.candy);
  const level = o.level + 1;
  const up: OwnedOddie = { ...o, level, exp: level >= MAX_LEVEL ? 0 : Math.min(o.exp, expToNext(level) - 1) };
  const list = listOf(save, where).map((m, i) => (i === index ? up : m));
  const candy = { ...save.candy, [o.speciesId]: own - fromOwn };
  if (!candy[o.speciesId]) delete candy[o.speciesId];
  const next: SaveData = { ...save, coins: save.coins - cost.coins, candy, [where]: list };
  // 0개는 저장에 남기지 않는다(읽으면 없는 것과 같다)
  const rare = (save.rareCandy ?? 0) - (cost.candy - fromOwn);
  if (rare > 0) next.rareCandy = rare; else delete next.rareCandy;
  if (!Object.keys(candy).length) delete next.candy;
  next.playerLevel = highestLevel(next.team, START_LEVEL);
  return next;
}

/** 박사에게 보낼 수 있나: 같은 종이 하나 더 있어야 하고, 팀의 마지막 오디는 안 된다 */
export function canTransfer(save: SaveData, where: Where, index: number): boolean {
  const o = listOf(save, where)[index];
  if (!o) return false;
  if (where === 'team' && save.team.length <= 1) return false;
  return [...save.team, ...save.box].filter((m) => m.speciesId === o.speciesId).length >= 2;
}

/** 박사에게 보낸다: 그 종 사탕 +1 */
export function transfer(save: SaveData, where: Where, index: number): SaveData | null {
  if (!canTransfer(save, where, index)) return null;
  const o = listOf(save, where)[index];
  const next = addCandy({ ...save, [where]: listOf(save, where).filter((_, i) => i !== index) }, o.speciesId, TRANSFER_CANDY);
  return { ...next, playerLevel: highestLevel(next.team, START_LEVEL) };
}

/** 박스 → 팀. 팀이 차 있으면 teamIndex의 오디와 바꾼다 */
export function withdraw(save: SaveData, boxIndex: number, teamIndex?: number): SaveData | null {
  const o = save.box[boxIndex];
  if (!o) return null;
  const box = save.box.filter((_, i) => i !== boxIndex);
  let team: OwnedOddie[];
  if (save.team.length < MAX_TEAM) team = [...save.team, o];
  else if (teamIndex !== undefined && save.team[teamIndex]) {
    team = save.team.map((m, i) => (i === teamIndex ? o : m));
    box.splice(boxIndex, 0, save.team[teamIndex]);
  } else return null;
  return { ...save, team, box, playerLevel: highestLevel(team, START_LEVEL) };
}

/** 팀 → 박스(마지막 한 마리는 안 된다) */
export function deposit(save: SaveData, teamIndex: number): SaveData | null {
  const o = save.team[teamIndex];
  if (!o || save.team.length <= 1) return null;
  const team = save.team.filter((_, i) => i !== teamIndex);
  return { ...save, team, box: [...save.box, o], playerLevel: highestLevel(team, START_LEVEL) };
}

export const candyLabel = (speciesId: number) => `${speciesById(speciesId).name} 사탕`;
