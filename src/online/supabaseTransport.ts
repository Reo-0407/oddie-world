import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ClientMessage, ServerMessage } from './protocol.ts';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig.ts';
import type { Transport } from './transport.ts';

/*
 * 인터넷 통로(Supabase). 서버가 방 로직을 돌리고(Edge Function 'online'), 클라이언트는
 *  - 메시지를 함수 호출로 보내고(응답으로 내 몫을 받는다),
 *  - 서버가 상대 행동 결과를 내 개인 채널 player:{비밀값}으로 broadcast하면 그것도 받는다.
 * 비밀값은 이 브라우저가 만든 32자 hex이고 서버가 요청마다 받아 저장한다. 남은 이 채널 이름을 알 수 없다.
 * 계정은 익명 로그인이고 세션은 localStorage에 남는다(같은 브라우저에서 다시 열면 같은 사용자).
 */

const SECRET_KEY = 'oddie-online-secret';
const ROOM_KEY = 'oddie-online-room';
const KEEPALIVE_MS = 10_000; // 이 간격으로 hello를 보내 살아 있음을 알린다
const DEADLINE_GRACE_MS = 1_500; // 제한시간이 지난 직후 hello로 서버에 만료 처리를 부탁한다

interface Reply {
  message: ServerMessage;
  rev: number;
}

let sharedClient: SupabaseClient | null = null;

/** 한 브라우저에서 하나만 쓴다 (로그인 세션 저장소를 여러 개 만들지 않으려고) */
export function getSupabase(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'oddie-online-auth' },
    });
  }
  return sharedClient;
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장소를 못 써도 대전은 된다 (재접속만 안 된다)
  }
}

/** 이 브라우저의 개인 채널 비밀값(32자 hex). 없으면 만들어 저장 */
function loadSecret(): string {
  const saved = readStorage(SECRET_KEY);
  if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
  const secret = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  writeStorage(SECRET_KEY, secret);
  return secret;
}

/** 새로고침 뒤 다시 들어갈 방 코드 */
export function savedRoomCode(): string | null {
  return readStorage(ROOM_KEY);
}

/*
 * 개인 채널은 브라우저에 하나만 둔다. 화면이 열리고 닫히거나 개발 모드에서 효과가 두 번 돌아도
 * 같은 이름의 채널을 두 번 구독하지 않도록, 연결(connection)들이 이 하나를 나눠 쓴다.
 */
interface SharedChannel {
  secret: string;
  ready: Promise<void>;
  listeners: Set<(reply: Reply) => void>;
  refs: number;
  teardown?: ReturnType<typeof setTimeout>;
  channel: ReturnType<SupabaseClient['channel']>;
}
let shared: SharedChannel | null = null;

function acquireChannel(supabase: SupabaseClient, secret: string, listener: (reply: Reply) => void): SharedChannel {
  if (!shared || shared.secret !== secret) {
    const listeners = new Set<(reply: Reply) => void>();
    const channel = supabase.channel(`player:${secret}`, { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event: 'msg' }, ({ payload }) => { for (const l of [...listeners]) l(payload as Reply); });
    const ready = (async () => {
      await ensureSession(supabase);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('실시간 연결 시간 초과')), 10_000);
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`실시간 연결 실패(${status})`)); }
        });
      });
    })();
    const created: SharedChannel = { secret, ready, listeners, refs: 0, channel };
    ready.catch(() => { if (shared === created) { void supabase.removeChannel(channel); shared = null; } }); // 실패하면 다음에 다시 만든다
    shared = created;
  }
  clearTimeout(shared.teardown);
  shared.refs += 1;
  shared.listeners.add(listener);
  return shared;
}

function releaseChannel(supabase: SupabaseClient, hold: SharedChannel, listener: (reply: Reply) => void) {
  hold.listeners.delete(listener);
  hold.refs -= 1;
  if (hold.refs > 0) return;
  // 곧바로 다시 열릴 수 있으니(효과가 두 번 도는 경우 등) 잠깐 기다렸다가 닫는다
  hold.teardown = setTimeout(() => {
    if (hold.refs === 0 && shared === hold) {
      void supabase.removeChannel(hold.channel);
      shared = null;
    }
  }, 1_000);
}

export interface SupabaseConnection {
  transport: Transport;
  dispose(): void;
}

async function ensureSession(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`익명 로그인 실패: ${error.message}`);
}

export function createSupabaseConnection(): SupabaseConnection {
  const supabase = getSupabase();
  const secret = loadSecret();
  const handlers = new Set<(message: ServerMessage) => void>();
  const lastRev = new Map<string, number>();
  let currentCode: string | null = null;
  let disposed = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const emit = (message: ServerMessage) => { for (const handler of [...handlers]) handler(message); };

  const deliver = (reply: Reply, quiet = false, isHello = false) => {
    const { message, rev } = reply;
    if (message.t === 'error') {
      if (!quiet) emit(message);
      // 재접속(hello)이 방을 못 찾으면 저장해 둔 코드는 버린다
      if (isHello && (message.reason === 'no-room' || message.reason === 'not-seated')) forgetRoom();
      return;
    }
    // 더 오래된 상태가 늦게 도착한 것은 버린다
    const code = message.view.code;
    if (rev > 0 && rev < (lastRev.get(code) ?? 0)) return;
    if (rev > 0) lastRev.set(code, rev);
    if (message.view.phase === 'finished') forgetRoom();
    else {
      currentCode = code;
      writeStorage(ROOM_KEY, code);
    }
    scheduleDeadlinePoll(message.view.deadline);
    emit(message);
  };

  function forgetRoom() {
    currentCode = null;
    writeStorage(ROOM_KEY, null);
  }

  /** 제한시간이 지나면 서버에 hello를 보내 만료 처리(자동 pass, 기권패)를 하게 한다 */
  function scheduleDeadlinePoll(deadline: number | null) {
    clearTimeout(deadlineTimer);
    if (deadline === null || disposed) return;
    const wait = Math.max(0, deadline - Date.now()) + DEADLINE_GRACE_MS;
    deadlineTimer = setTimeout(() => { if (currentCode) void send({ t: 'hello', playerId: 'me', code: currentCode }, true); }, wait);
  }

  const listener = (reply: Reply) => deliver(reply);
  const hold = acquireChannel(supabase, secret, listener);
  let keepaliveStarted = false;
  const connect = async () => {
    await hold.ready;
    if (!keepaliveStarted && !disposed) {
      keepaliveStarted = true;
      keepalive = setInterval(() => {
        if (currentCode) void send({ t: 'hello', playerId: 'me', code: currentCode }, true);
      }, KEEPALIVE_MS);
    }
  };

  async function send(message: ClientMessage, quiet = false) {
    if (message.t === 'leave') forgetRoom(); // 일부러 나가면 다시 들어갈 방을 잊는다
    try {
      await connect();
      if (disposed) return;
      const { data, error } = await supabase.functions.invoke('online', { body: { message, secret } });
      if (error) throw new Error(error.message);
      for (const reply of (data as { replies?: Reply[] }).replies ?? []) deliver(reply, quiet, message.t === 'hello');
    } catch (caught) {
      if (!quiet) emit({ t: 'error', reason: 'bad-message', detail: `network: ${caught instanceof Error ? caught.message : String(caught)}` });
    }
  }

  return {
    transport: {
      // playerId는 서버가 로그인 정보로 덮어쓰므로 아무 값이나 보내도 된다
      send: (message) => { void send(message); },
      onMessage(handler) {
        handlers.add(handler);
        return () => { handlers.delete(handler); };
      },
    },
    dispose() {
      disposed = true;
      clearTimeout(deadlineTimer);
      clearInterval(keepalive);
      handlers.clear();
      releaseChannel(supabase, hold, listener);
    },
  };
}

export interface RankingRow {
  name: string;
  rating: number;
  games: number;
}

/** 랭킹 상위 n명 (읽기 전용 함수) */
export async function fetchRanking(n = 20): Promise<RankingRow[]> {
  const supabase = getSupabase();
  await ensureSession(supabase);
  const { data, error } = await supabase.rpc('top_ratings', { n });
  if (error) throw new Error(error.message);
  return (data ?? []) as RankingRow[];
}

/** 내 점수. 아직 한 판도 안 했으면 null */
export async function fetchMyRating(): Promise<RankingRow | null> {
  const supabase = getSupabase();
  await ensureSession(supabase);
  const { data, error } = await supabase.rpc('my_rating');
  if (error) throw new Error(error.message);
  return ((data ?? []) as RankingRow[])[0] ?? null;
}
