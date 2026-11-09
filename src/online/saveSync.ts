import { mergeDex } from '../game/dex.ts';
import { parseSave, type SaveData } from '../world/save.ts';

/** 클라우드 저장 한 건의 크기 상한(서버 표의 CHECK와 같은 값) */
export const MAX_SAVE_BYTES = 200 * 1024;

export function saveBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

export function withinSizeLimit(data: unknown): boolean {
  return saveBytes(data) <= MAX_SAVE_BYTES;
}

/** 서버에서 온 JSON은 믿지 않는다: 크기를 보고 parseSave로 검증, 옛 형식은 옮겨서 돌려준다. 못 쓰면 null */
export function parseCloudData(json: unknown): SaveData | null {
  if (json === null || typeof json !== 'object') return null;
  if (!withinSizeLimit(json)) return null;
  return parseSave(JSON.stringify(json));
}

function withoutDex(data: SaveData | undefined) {
  if (!data) return data;
  const { dex: _dex, ...rest } = data;
  return rest;
}

/** 고른 쪽 저장에 다른 쪽의 도감 기록을 합친다(어느 쪽을 골라도 도감은 줄지 않는다) */
export function withMergedDex(chosen: SaveData, other: SaveData): SaveData {
  return { ...chosen, dex: mergeDex(chosen.dex, other.dex) };
}

export interface SaveSide {
  data: SaveData;
  /** 마지막으로 바뀐 시각(ms) */
  at: number;
}

export type SyncDecision =
  | { action: 'none' } // 둘 다 없거나 같다
  | { action: 'upload' } // 이 기기 것만 있다: 계정에 올린다
  | { action: 'use-cloud' } // 계정 것만 있다: 내려받는다
  | { action: 'ask'; newer: 'local' | 'cloud' }; // 둘 다 있고 다르다: 어느 쪽을 쓸지 묻는다

/** 로그인 직후 이 기기의 저장과 계정의 저장을 어떻게 맞출지 정한다 */
export function decideSync(local: SaveSide | null, cloud: SaveSide | null): SyncDecision {
  if (!local && !cloud) return { action: 'none' };
  if (local && !cloud) return { action: 'upload' };
  if (!local && cloud) return { action: 'use-cloud' };
  // 도감만 다른 것은 물어볼 일이 아니다(합쳐서 쓴다)
  if (JSON.stringify(withoutDex(local?.data)) === JSON.stringify(withoutDex(cloud?.data))) return { action: 'none' };
  return { action: 'ask', newer: (local?.at ?? 0) > (cloud?.at ?? 0) ? 'local' : 'cloud' };
}

/** 고르는 화면에 보여 줄 한 줄 요약 */
export function describeSave(data: SaveData, at: number): string {
  const top = data.team.reduce((max, oddie) => Math.max(max, oddie.level), 0);
  const when = at > 0 ? new Date(at).toLocaleString('ko-KR') : '시각 모름';
  return `${data.name} · 오디 ${data.team.length + data.box.length}마리 · 최고 Lv.${top} · 코인 ${data.coins} · ${when}`;
}
