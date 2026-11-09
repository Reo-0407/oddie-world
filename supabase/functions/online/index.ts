// 친구 대전 서버(Edge Function). 방 로직은 ../_shared/src (src/에서 복사한 것)를 그대로 쓴다.
// 요청 한 번 = 방 하나를 읽고 → 로직 한 번 → 저장 → 상대에게 개인 채널로 broadcast.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { MOVES, SPECIES } from '../_shared/src/data/index.ts';
import { handleOnlineRequest } from '../_shared/src/online/edgeHandler.ts';
import { createStores } from './stores.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const stores = createStores(admin);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const rng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method' }, 405);

  // 로그인 확인: 보낸 playerId가 아니라 토큰에서 나온 사용자 id만 믿는다
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: new Error('no token') };
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);

  let body: { message?: unknown; secret?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-json' }, 400);
  }

  try {
    const result = await handleOnlineRequest(
      { species: SPECIES, moves: MOVES, stores, rng, now: () => Date.now() },
      data.user.id,
      body.secret,
      body.message,
    );

    if (result.pushes.length > 0) {
      // 상대의 개인 채널(player:{비밀값})로 보낸다. 비밀값은 서버만 알아서 남이 엿볼 수 없다
      const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: result.pushes.map((push) => ({
            topic: `player:${push.secret}`,
            event: 'msg',
            payload: push.reply,
            private: false,
          })),
        }),
      });
      if (!response.ok) console.error('broadcast 실패', response.status);
    }
    return json({ replies: result.replies });
  } catch (caught) {
    console.error('online 처리 오류', caught instanceof Error ? caught.message : String(caught));
    return json({ error: 'server' }, 500);
  }
});
