import type { SaveData } from '../game/save.ts';
import { parseCloudData, withinSizeLimit, type SaveSide } from './saveSync.ts';
import { getSupabase } from './supabaseTransport.ts';

/** 클라우드 저장(표 saves, RLS로 본인 행만). 서버에서 온 값은 parseCloudData로 검증한다 */

export type CloudFetch =
  | { kind: 'ok'; save: SaveSide | null } // 없으면 save null
  | { kind: 'invalid' } // 행은 있는데 못 쓰는 내용
  | { kind: 'error' }; // 인터넷 문제 등: 로컬 저장으로 계속하고 나중에 다시 시도

export async function fetchCloudSave(userId: string): Promise<CloudFetch> {
  try {
    const { data, error } = await getSupabase().from('saves').select('data, updated_at').eq('user_id', userId).maybeSingle();
    if (error) return { kind: 'error' };
    if (!data) return { kind: 'ok', save: null };
    const parsed = parseCloudData(data.data);
    if (!parsed) return { kind: 'invalid' };
    return { kind: 'ok', save: { data: parsed, at: Date.parse(String(data.updated_at)) || 0 } };
  } catch {
    return { kind: 'error' };
  }
}

/** 올리기. 성공하면 true. 너무 크거나 실패하면 false(다음 기회에 다시 시도) */
export async function uploadCloudSave(userId: string, data: SaveData): Promise<boolean> {
  if (!withinSizeLimit(data)) return false;
  try {
    const { error } = await getSupabase().from('saves').upsert({ user_id: userId, data }, { onConflict: 'user_id' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteCloudSave(userId: string): Promise<boolean> {
  try {
    const { error } = await getSupabase().from('saves').delete().eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}
