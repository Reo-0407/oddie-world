import { cleanDex, dexFromOwned, emptyDex, type Dex } from './dex.ts';
import { MAX_TEAM, type OwnedOddie } from './owned.ts';

export const SAVE_KEY = 'oddie-world-save-v1'; // 키는 그대로 두고 version 필드로 구분한다
export const SAVE_AT_KEY = 'oddie-world-save-at'; // 이 기기에서 마지막으로 저장한 시각(ms)
export const OWNER_KEY = 'oddie-world-owner'; // 이 기기의 저장이 누구 것인지(계정 id, 게스트면 'guest')
export const SAVE_VERSION = 5;
export const CHARACTER_COUNT = 6; // 옛 저장(0~3)도 그대로 유효
export const START_LEVEL = 5;
/** 새 저장의 시작 코인 (옛 저장을 옮길 때는 적용하지 않는다) */
export const START_COINS = 100;
export const START_ROPES = { basic: 5, sturdy: 1 };

export interface Ropes {
  basic: number;
  sturdy: number;
}

export type Facing = 'up' | 'down' | 'left' | 'right';
/** 오디 마을 시작점(길 위)과 부활 지점(오디 센터 앞) */
export const TOWN_START = { map: 'town', x: 6, y: 9, facing: 'down' as Facing };
export const TOWN_RESPAWN = { map: 'town', x: 6, y: 8 };
const FACINGS: readonly string[] = ['up', 'down', 'left', 'right'];

export interface Respawn {
  map: string;
  x: number;
  y: number;
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
  /** 도감: 만난 종과 잡은 종 */
  dex: Dex;
  /** 현재 지도 id와 칸 좌표, 바라보는 방향 */
  map: string;
  x: number;
  y: number;
  facing: Facing;
  badges: string[];
  /** 이긴 트레이너 id */
  beaten: string[];
  flags: string[];
  respawn: Respawn;
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
    tutorialDone: false, dex: emptyDex(),
    map: TOWN_START.map, x: TOWN_START.x, y: TOWN_START.y, facing: TOWN_START.facing,
    badges: [], beaten: [], flags: [], respawn: { ...TOWN_RESPAWN },
  };
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const parseStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64).slice(0, 200)
    : [];

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
      base.dex = dexFromOwned(base.team);
      return base;
    }
    // v2는 potions가, v3는 dex가 없다. 나머지는 같다
    if (data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== SAVE_VERSION) return null;

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
    // 도감: v4는 저장된 값을 정리해서 쓰고, 그 전 저장은 지금 팀/박스의 오디를 잡은 것으로 채운다
    base.dex = data.version === 4 || data.version === SAVE_VERSION ? cleanDex(data.dex) : dexFromOwned([...base.team, ...base.box]);
    if (data.version === SAVE_VERSION) {
      if (typeof data.map === 'string' && data.map && isCount(data.x) && isCount(data.y)) {
        base.map = data.map; base.x = data.x; base.y = data.y;
        base.facing = FACINGS.includes(data.facing as string) ? (data.facing as Facing) : 'down';
      }
      base.badges = parseStrings(data.badges);
      base.beaten = parseStrings(data.beaten);
      base.flags = parseStrings(data.flags);
      const r = data.respawn as Record<string, unknown> | undefined;
      if (r && typeof r.map === 'string' && r.map && isCount(r.x) && isCount(r.y)) base.respawn = { map: r.map, x: r.x, y: r.y };
    }
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
    storage.setItem(SAVE_AT_KEY, String(Date.now()));
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

/** 이 기기의 저장이 마지막으로 바뀐 시각(ms). 모르면 0 */
export function loadSaveAt(storage: StorageLike | null = defaultStorage()): number {
  try {
    const value = Number(storage?.getItem(SAVE_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function loadOwner(storage: StorageLike | null = defaultStorage()): string | null {
  try { return storage?.getItem(OWNER_KEY) ?? null; } catch { return null; }
}

export function setOwner(owner: string | null, storage: StorageLike | null = defaultStorage()): void {
  try {
    if (owner === null) storage?.removeItem(OWNER_KEY);
    else storage?.setItem(OWNER_KEY, owner);
  } catch {
    // 저장소를 못 써도 게임은 계속된다
  }
}

/** 로그아웃 때: 이 기기의 저장과 표식을 모두 비운다(다른 사람이 이어 받지 못하게) */
export function clearLocalAccountData(storage: StorageLike | null = defaultStorage()): void {
  clearSave(storage);
  try {
    storage?.removeItem(SAVE_AT_KEY);
    storage?.removeItem(OWNER_KEY);
  } catch {
    // 저장소를 못 써도 게임은 계속된다
  }
}
