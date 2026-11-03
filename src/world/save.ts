export const SAVE_KEY = 'oddie-world-save-v1';
export const CHARACTER_COUNT = 4;

export interface SaveData {
  name: string;
  characterIndex: number;
  starterId: number | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 저장된 값이 올바른 모양인지 검사해서 안전하게 돌려준다 */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (typeof data.name !== 'string' || data.name.trim() === '') return null;
    const index = data.characterIndex;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= CHARACTER_COUNT) return null;
    const starter = data.starterId;
    const starterId = typeof starter === 'number' && Number.isInteger(starter) && starter > 0 ? starter : null;
    return { name: data.name.trim().slice(0, 12), characterIndex: index, starterId };
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
