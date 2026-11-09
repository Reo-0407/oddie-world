/**
 * 배포된 online 함수를 익명 사용자 두 명으로 실제로 호출해 보는 스모크 테스트.
 * 실행: npm run smoke:online   (.env.local의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY만 쓴다. 토큰은 출력하지 않는다)
 * 확인: 익명 로그인 → create → join → 팀 제출 → 전투 시작 → Realtime broadcast 수신 → 기권으로 끝내 랭킹 기록
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MOVES, speciesById } from '../src/data/index.ts';
import { createBattlePokemon } from '../src/game/factory.ts';
import type { RoomView, ServerMessage, TeamSpec } from '../src/online/protocol.ts';
import { loadEnvLocal } from './env.ts';

const env = loadEnvLocal();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('.env.local에 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY가 필요함');

const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures += 1;
};

const teamOf = (ids: number[]): TeamSpec => ids.map((id) => ({
  speciesId: id, level: 20, moveIds: createBattlePokemon(speciesById(id), 20, MOVES).moves.map((m) => m.id),
}));

async function newUser(name: string) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw new Error(`익명 로그인 실패(${name}): ${error?.message}`);
  const secret = hex();
  const inbox: { message: ServerMessage; rev: number }[] = [];
  const channel = client.channel(`player:${secret}`, { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'msg' }, ({ payload }) => inbox.push(payload as { message: ServerMessage; rev: number }));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime 구독 시간 초과')), 10000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
    });
  });
  const call = async (message: unknown) => {
    const { data: reply, error: callError } = await client.functions.invoke('online', { body: { message, secret } });
    if (callError) throw new Error(`호출 실패: ${callError.message}`);
    return reply as { replies: { message: ServerMessage; rev: number }[] };
  };
  return { client, call, inbox, userId: data.user?.id ?? '', channel };
}

const view = (reply: { replies: { message: ServerMessage }[] }): RoomView | null => {
  const found = reply.replies.find((r) => r.message.t === 'state');
  return found && found.message.t === 'state' ? found.message.view : null;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const a = await newUser('A');
const b = await newUser('B');
check('익명 사용자 두 명이 다른 id를 받음', a.userId !== '' && a.userId !== b.userId);

// 로그인 없는 호출은 거절
const anon = await fetch(`${url}/functions/v1/online`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify({ message: { t: 'create' }, secret: hex() }),
});
check('토큰 없이 호출하면 401', anon.status === 401, String(anon.status));

const created = view(await a.call({ t: 'create', playerId: 'spoofed', name: 'Smoke A' }));
check('방 만들기: 6자리 코드, 0번 자리', created?.code.length === 6 && created.seat === 0, JSON.stringify(created?.code));
const code = created?.code ?? '';

const joined = view(await b.call({ t: 'join', code, name: 'Smoke B' }));
check('참가: 팀 고르기 단계, 1번 자리', joined?.phase === 'teams' && joined.seat === 1);
await sleep(1500);
const pushedToA = a.inbox.find((m) => m.message.t === 'state' && m.message.view.phase === 'teams');
check('방 주인에게 Realtime broadcast로 상태가 도착함', pushedToA !== undefined, `수신 ${a.inbox.length}건`);

const bad = await b.call({ t: 'join', code: 'QQQQQ9', name: 'x' });
check('없는 방 코드는 no-room 오류', bad.replies[0].message.t === 'error' && bad.replies[0].message.reason === 'no-room');

await a.call({ t: 'team', code, team: teamOf([1, 2, 3]) });
const started = view(await b.call({ t: 'team', code, team: teamOf([42, 43, 45]) }));
check('두 팀을 내면 전투 시작', started?.phase === 'battle' && started.you.team.length === 3);
check('상대 오디는 안 나온 것이 숨겨짐', started?.foe.team[1] === null && started?.foe.team[2] === null);

const move = view(await a.call({ t: 'action', code, turn: 1, action: { kind: 'move', moveIndex: 0 } }));
check('내 행동만 낸 상태', move?.you.submitted === true && move.foe.submitted === false);
const resolved = view(await b.call({ t: 'action', code, turn: 1, action: { kind: 'move', moveIndex: 0 } }));
check('두 행동이 모이면 턴 진행', resolved?.turn === 2 && (resolved?.lastEvents.length ?? 0) > 0);

const ended = view(await a.call({ t: 'leave', code }));
check('나가기: 상대 승리로 종료', ended?.phase === 'finished' && ended.winner === 1 && ended.endReason === 'forfeit');

const ranking = await b.client.rpc('top_ratings', { n: 20 });
check('랭킹 조회 함수가 동작', !ranking.error && Array.isArray(ranking.data), ranking.error?.message);
const mine = await b.client.rpc('my_rating');
check('내 점수: 이긴 쪽이 1016', !mine.error && mine.data?.[0]?.rating === 1016, JSON.stringify(mine.data));
const direct = await b.client.from('ratings').select('*');
check('표를 클라이언트가 직접 읽을 수는 없음', direct.error !== null || (direct.data ?? []).length === 0);
const directRooms = await b.client.from('rooms').select('code');
check('rooms 표도 직접 못 읽음', directRooms.error !== null || (directRooms.data ?? []).length === 0);

await Promise.all([a, b].map(async (user: { client: SupabaseClient; channel: { unsubscribe(): unknown } }) => {
  await user.channel.unsubscribe();
  await user.client.removeAllChannels();
}));
console.log(failures === 0 ? '모두 통과' : `${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
