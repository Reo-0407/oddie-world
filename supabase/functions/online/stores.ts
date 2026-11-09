import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Stores } from '../_shared/src/online/edgeHandler.ts';
import type { LimitState } from '../_shared/src/online/rateLimit.ts';
import type { Room } from '../_shared/src/online/room.ts';

/** Supabase 표를 쓰는 저장소. service role 클라이언트로만 만든다 (표는 클라이언트에게 열려 있지 않다) */
export function createStores(db: SupabaseClient): Stores {
  const fail = (what: string, error: { message: string }) => new Error(`${what}: ${error.message}`);
  return {
    rooms: {
      async load(code) {
        const { data, error } = await db.from('rooms').select('room, version').eq('code', code).maybeSingle();
        if (error) throw fail('rooms.load', error);
        return data ? { room: data.room as Room, version: data.version as number } : null;
      },
      async insert(room) {
        const { error } = await db.from('rooms').insert({ code: room.code, room });
        if (error) {
          if ((error as { code?: string }).code === '23505') return false; // 같은 코드가 이미 있다
          throw fail('rooms.insert', error);
        }
        return true;
      },
      async save(code, room, expectedVersion) {
        // 읽은 뒤 아무도 안 바꿨을 때(version이 그대로일 때)만 저장한다 = 낙관적 잠금
        const { data, error } = await db
          .from('rooms')
          .update({ room, version: expectedVersion + 1, updated_at: new Date().toISOString() })
          .eq('code', code)
          .eq('version', expectedVersion)
          .select('version');
        if (error) throw fail('rooms.save', error);
        return data && data.length > 0 ? expectedVersion + 1 : null;
      },
      async cleanup() {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        await db.from('rooms').delete().lt('updated_at', cutoff);
      },
    },
    channels: {
      async set(userId, secret) {
        const { error } = await db
          .from('player_channels')
          .upsert({ user_id: userId, secret, updated_at: new Date().toISOString() });
        if (error) throw fail('channels.set', error);
      },
      async getMany(userIds) {
        const { data, error } = await db.from('player_channels').select('user_id, secret').in('user_id', userIds);
        if (error) throw fail('channels.getMany', error);
        return Object.fromEntries((data ?? []).map((row) => [row.user_id as string, row.secret as string]));
      },
    },
    limits: {
      async get(userId) {
        const { data, error } = await db.from('guess_limits').select('window_start, fails').eq('user_id', userId).maybeSingle();
        if (error) throw fail('limits.get', error);
        return data ? ({ windowStart: Number(data.window_start), fails: data.fails as number } satisfies LimitState) : null;
      },
      async set(userId, state) {
        const { error } = await db
          .from('guess_limits')
          .upsert({ user_id: userId, window_start: state.windowStart, fails: state.fails });
        if (error) throw fail('limits.set', error);
      },
    },
    ranking: {
      async ratings(userIds) {
        const { data, error } = await db.from('ratings').select('user_id, rating').in('user_id', userIds);
        if (error) throw fail('ranking.ratings', error);
        return Object.fromEntries((data ?? []).map((row) => [row.user_id as string, row.rating as number]));
      },
      async record({ match, deltaA, deltaB }) {
        const { data, error } = await db.rpc('record_match', {
          p_room_code: match.roomCode,
          p_player_a: match.aId,
          p_player_b: match.bId,
          p_name_a: match.aName,
          p_name_b: match.bName,
          p_winner: match.winnerId,
          p_loser: match.loserId,
          p_draw: match.draw,
          p_reason: match.reason,
          p_delta_a: deltaA,
          p_delta_b: deltaB,
        });
        if (error) throw fail('ranking.record', error);
        return data === true;
      },
    },
  };
}
