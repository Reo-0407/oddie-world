/**
 * 실제 Supabase에서 계정과 클라우드 저장을 확인하는 스모크 테스트. 끝나면 만든 계정과 저장 행을 지운다.
 * 실행: npm run smoke:auth   (.env.local의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, 정리용으로 SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF)
 * 비밀번호는 실행할 때마다 새로 만든 무작위 값이고 출력하지 않는다. 토큰도 출력하지 않는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authErrorMessage, emailToUsername, usernameToEmail } from '../src/online/account.ts';
import { MAX_SAVE_BYTES, parseCloudData } from '../src/online/saveSync.ts';
import { newSave } from '../src/game/save.ts';
import { loadEnvLocal } from './env.ts';

const env = loadEnvLocal();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('.env.local에 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY가 필요함');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures += 1;
};
const fresh = (): SupabaseClient => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const random = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const createdIds: string[] = [];

const stamp = String(Date.now()).slice(-6);
const nameA = `스모크A${stamp}`; // 한글 + 영문 + 숫자 (11자)
const nameB = `smokeB${stamp}`;
const passA = random(8); // 16자 무작위
const passB = random(8);

try {
  // 1) 가입
  const a = fresh();
  const signUp = await a.auth.signUp({ email: usernameToEmail(nameA), password: passA, options: { data: { username: nameA } } });
  const userA = signUp.data.user;
  if (userA) createdIds.push(userA.id);
  check('한글 아이디 가입 → 바로 세션(이메일 확인 꺼짐)', !signUp.error && !!signUp.data.session, signUp.error?.message);
  check('가짜 이메일에서 아이디를 되돌릴 수 있음', emailToUsername(userA?.email) === nameA.toLowerCase());
  check('가입한 사용자는 익명이 아님', userA?.is_anonymous === false);

  // 2) 같은 아이디(대소문자만 다름) 다시 가입 → 이미 사용 중
  const dup = await fresh().auth.signUp({ email: usernameToEmail(nameA.toUpperCase()), password: random(8) });
  check('이미 있는 아이디는 거절되고 한국어 안내', !!dup.error && authErrorMessage(dup.error).includes('이미 사용 중'), `${dup.error?.code} ${dup.error?.message}`);

  // 3) 로그인
  const wrong = await fresh().auth.signInWithPassword({ email: usernameToEmail(nameA), password: `${passA}x` });
  check('틀린 비밀번호는 한국어 안내', !!wrong.error && authErrorMessage(wrong.error).includes('맞지 않아요'), `${wrong.error?.code}`);
  const login = fresh();
  const signedIn = await login.auth.signInWithPassword({ email: usernameToEmail(nameA), password: passA });
  check('올바른 비밀번호로 로그인하면 같은 사용자', !signedIn.error && signedIn.data.user?.id === userA?.id);

  // 4) 클라우드 저장 올리기/내려받기
  const save = { ...newSave('스모크', 2), team: [{ speciesId: 42, level: 12, exp: 7 }], coins: 321 };
  const up = await login.from('saves').upsert({ user_id: userA?.id, data: save }, { onConflict: 'user_id' });
  check('내 저장 올리기', !up.error, up.error?.message);
  const down = await login.from('saves').select('data, updated_at').eq('user_id', userA?.id ?? '').maybeSingle();
  const parsed = parseCloudData(down.data?.data);
  check('내려받은 저장이 올린 것과 같고 parseSave를 통과', JSON.stringify(parsed) === JSON.stringify(save));
  const first = Date.parse(String(down.data?.updated_at));
  check('updated_at은 서버 시계(지금과 1분 이내)', Math.abs(Date.now() - first) < 60_000);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await login.from('saves').upsert({ user_id: userA?.id, data: { ...save, coins: 999 } }, { onConflict: 'user_id' });
  const again = await login.from('saves').select('data, updated_at').eq('user_id', userA?.id ?? '').maybeSingle();
  check('다시 올리면 덮어쓰고 updated_at이 늦어짐', parseCloudData(again.data?.data)?.coins === 999 && Date.parse(String(again.data?.updated_at)) > first);

  // 5) 크기 제한
  const big = await login.from('saves').upsert({ user_id: userA?.id, data: { ...save, junk: 'x'.repeat(MAX_SAVE_BYTES) } }, { onConflict: 'user_id' });
  check('서버가 200KB 넘는 저장을 거절(CHECK)', !!big.error, '거절되지 않음');
  const stillOk = await login.from('saves').select('data').eq('user_id', userA?.id ?? '').maybeSingle();
  check('거절된 뒤에도 이전 저장은 그대로', parseCloudData(stillOk.data?.data)?.coins === 999);

  // 5-2) 이상한 모양의 JSON은 클라이언트가 거르는지(서버는 모양까지는 검사하지 않는다)
  check('모양이 이상한 저장은 parseCloudData가 거절', parseCloudData({ hello: 'world' }) === null);

  // 6) 다른 사용자는 남의 행을 읽거나 고칠 수 없다
  const b = fresh();
  const signUpB = await b.auth.signUp({ email: usernameToEmail(nameB), password: passB, options: { data: { username: nameB } } });
  if (signUpB.data.user) createdIds.push(signUpB.data.user.id);
  check('두 번째 사용자 가입', !signUpB.error && !!signUpB.data.session, signUpB.error?.message);
  const peek = await b.from('saves').select('*').eq('user_id', userA?.id ?? '');
  check('B가 A의 행을 읽을 수 없음', !peek.error && (peek.data ?? []).length === 0);
  const peekAll = await b.from('saves').select('*');
  check('B가 전체를 읽어도 A의 행은 안 보임', (peekAll.data ?? []).every((row) => row.user_id !== userA?.id));
  const hijack = await b.from('saves').update({ data: { ...save, coins: 1 } }).eq('user_id', userA?.id ?? '').select();
  check('B가 A의 행을 고칠 수 없음', (hijack.data ?? []).length === 0);
  const forge = await b.from('saves').insert({ user_id: userA?.id, data: save });
  check('B가 A의 id로 행을 만들 수 없음(RLS)', !!forge.error);
  const wipe = await b.from('saves').delete().eq('user_id', userA?.id ?? '').select();
  check('B가 A의 행을 지울 수 없음', (wipe.data ?? []).length === 0);
  const intact = await login.from('saves').select('data').eq('user_id', userA?.id ?? '').maybeSingle();
  check('A의 저장은 그대로', parseCloudData(intact.data?.data)?.coins === 999);
  const mineB = await b.from('saves').upsert({ user_id: signUpB.data.user?.id, data: newSave('비', 0) }, { onConflict: 'user_id' });
  check('B는 자기 행은 만들 수 있음', !mineB.error, mineB.error?.message);

  // 7) 로그인 안 한 요청(publishable key만)
  const anon = await fresh().from('saves').select('*');
  check('로그인 없이는 아무 행도 못 읽음', (anon.data ?? []).length === 0);

  // 8) 익명(게스트) 사용자를 계정으로 올려도 같은 id가 유지된다(랭킹 이어 가기)
  const guest = fresh();
  const anonymous = await guest.auth.signInAnonymously();
  const guestId = anonymous.data.user?.id ?? '';
  if (guestId) createdIds.push(guestId);
  const nameC = `smokeC${stamp}`;
  const passC = random(8);
  const upgrade = await guest.auth.updateUser({ email: usernameToEmail(nameC), password: passC, data: { username: nameC } });
  check('게스트(익명)를 계정으로 바꾸면 같은 id', !upgrade.error && upgrade.data.user?.id === guestId && upgrade.data.user?.is_anonymous === false, upgrade.error?.message);
  const relogin = await fresh().auth.signInWithPassword({ email: usernameToEmail(nameC), password: passC });
  check('바꾼 계정으로 다시 로그인', !relogin.error && relogin.data.user?.id === guestId, relogin.error?.message);
} finally {
  // 정리: 만든 계정을 지우면 saves 행도 on delete cascade로 같이 지워진다
  if (createdIds.length > 0 && env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF) {
    const ids = createdIds.map((id) => `'${id}'`).join(',');
    const response = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `delete from public.saves where user_id in (${ids}); delete from auth.users where id in (${ids});` }),
    });
    console.log(`정리: 테스트 계정 ${createdIds.length}개 삭제 (${response.status})`);
  } else if (createdIds.length > 0) {
    console.log('정리하지 못함: SUPABASE_ACCESS_TOKEN이 없어 테스트 계정이 남았을 수 있음');
  }
}
console.log(failures === 0 ? '모두 통과' : `${failures}건 실패`);
process.exit(failures === 0 ? 0 : 1);
