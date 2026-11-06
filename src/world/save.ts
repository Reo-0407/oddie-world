import { MAX_TEAM, type OwnedOddie } from '../game/owned.ts';

export const SAVE_KEY = 'oddie-world-save-v1'; // 키는 그대로 두고 version 필드로 구분한다
export const SAVE_VERSION = 3;
export const CHARACTER_COUNT = 6; // 옛 저장(0~3)도 그대로 유효
export const START_LEVEL = 10;
/** 새 저장의 시작 코인 (옛 저장을 옮길 때는 적용하지 않는다) */
export const START_COINS = 100;
export const START_ROPES = { basic: 5, sturdy: 1 };

export interface Ropes {
  basic: number;
  sturdy: number;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  name: string;
  characterIndex: number;
  team: OwnedOddie[];
  box: OwnedOddie[];
  ropes: Ropes;
  coins: number;
  /** 회복약 개수 */
  potions: number;
  /** 팀 최고 레벨 (팀이 비면 시작 레벨) */
  playerLevel: number;
  /** 첫 결투(튜토리얼)를 마쳤는지 */
  tutorialDone: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function newSave(name: string, characterIndex: number): SaveData {
  return {
    version: SAVE_VERSION, name, characterIndex, team: [], box: [],
    ropes: { ...START_ROPES }, coins: START_COINS, potions: 0, playerLevel: START_LEVEL,
    tutorialDone: false,
  };
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

function parseOddie(value: unknown): OwnedOddie | null {
  if (typeof value !== 'object' || value === null) return null;
  const { speciesId, level, exp } = value as Record<string, unknown>;
  if (!isCount(speciesId) || speciesId < 1 || speciesId > 999) return null;
  if (!isCount(level) || level < 1 || level > 100) return null;
  return { speciesId, level, exp: isCount(exp) ? exp : 0 };
}

function parseOddies(value: unknown, max: number): OwnedOddie[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseOddie).filter((oddie): oddie is OwnedOddie => oddie !== null).slice(0, max);
}

/** 저장된 값이 올바른 모양인지 검사해서 안전하게 돌려준다. 옛 v1(starterId만 있음)은 v2로 옮긴다 */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.name !== 'string' || data.name.trim() === '') return null;
    const index = data.characterIndex;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= CHARACTER_COUNT) return null;
    const base = newSave(data.name.trim().slice(0, 12), index);

    if (data.version === undefined || data.version === 1) {
      const starter = data.starterId;
      if (isCount(starter) && starter > 0) base.team = [{ speciesId: starter, level: START_LEVEL, exp: 0 }];
      base.coins = 0;
      return base;
    }
    // v2는 potions만 없다. 나머지는 v3와 같다
    if (data.version !== 2 && data.version !== SAVE_VERSION) return null;

    const ropes = (data.ropes ?? {}) as Record<string, unknown>;
    base.team = parseOddies(data.team, MAX_TEAM);
    base.box = parseOddies(data.box, 1000);
    base.ropes = {
      basic: isCount(ropes.basic) ? ropes.basic : START_ROPES.basic,
      sturdy: isCount(ropes.sturdy) ? ropes.sturdy : 0,
    };
    base.coins = isCount(data.coins) ? data.coins : 0;
    base.potions = isCount(data.potions) ? data.potions : 0;
    // 필드가 없는 옛 v2는 이미 돈을 번 적이 있으면 튜토리얼을 마친 걸로 본다
    base.tutorialDone = typeof data.tutorialDone === 'boolean' ? data.tutorialDone : base.coins > 0;
    base.playerLevel = isCount(data.playerLevel) && data.playerLevel >= 1 ? data.playerLevel : START_LEVEL;
    return base;
  } catch {
    return null;
  }
}

export function loadSave(storage: StorageLike | null = defaultStorage()): SaveData | null {
  try {
    return parseSave(storage?.getItem(SAVE_KEY) ?? null);
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // 저장소를 못 써도 게임은 계속된다
  }
}
