import type { User } from '@supabase/supabase-js';
import {
  authErrorMessage, emailToUsername, usernameToEmail, validatePassword, validatePin, validateUsername,
} from './account.ts';
import { getSupabase } from './supabaseTransport.ts';

/** 아이디+비밀번호 계정(Supabase Auth). 비밀번호는 로그인 요청에만 쓰고 저장하거나 기록하지 않는다 */
export interface Account {
  /** Supabase 사용자 id (대전, 랭킹, 클라우드 저장의 키) */
  id: string;
  /** 화면에 보이는 아이디(처음 가입할 때 친 글자 그대로) */
  username: string;
}

export type AuthResult = { ok: true; account: Account } | { ok: false; message: string };

function toAccount(user: User | null | undefined): Account | null {
  if (!user || user.is_anonymous) return null; // 익명(게스트 대전용)은 계정이 아니다
  const typed = (user.user_metadata as { username?: unknown } | undefined)?.username;
  const username = typeof typed === 'string' && typed !== '' ? typed : emailToUsername(user.email);
  return username ? { id: user.id, username } : null;
}

/** 저장된 세션의 계정. 로그인 안 했으면(또는 게스트의 익명 세션이면) null */
export async function currentAccount(): Promise<Account | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return toAccount(data.session?.user);
  } catch {
    return null;
  }
}

function checkInputs(username: string, password: string): string | null {
  const name = validateUsername(username);
  if (!name.ok) return name.message;
  const pass = validatePassword(password);
  if (!pass.ok) return pass.message;
  return null;
}

/** 가입. 게스트로 익명 대전을 한 적이 있으면 그 사용자를 그대로 계정으로 바꿔 랭킹을 이어 간다 */
export async function signUpWithId(username: string, password: string): Promise<AuthResult> {
  const problem = checkInputs(username, password);
  if (problem) return { ok: false, message: problem };
  const supabase = getSupabase();
  const email = usernameToEmail(username);
  const typed = username.trim();
  try {
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user.is_anonymous) {
      const { data, error } = await supabase.auth.updateUser({ email, password, data: { username: typed } });
      if (error) return { ok: false, message: authErrorMessage(error) };
      const account = toAccount(data.user);
      return account ? { ok: true, account } : { ok: false, message: authErrorMessage(null) };
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username: typed } } });
    if (error) return { ok: false, message: authErrorMessage(error) };
    // 이메일 확인이 꺼져 있어 바로 세션이 온다. 세션이 없으면 확인이 켜진 것이라 쓸 수 없다
    const account = data.session ? toAccount(data.user) : null;
    return account ? { ok: true, account } : { ok: false, message: authErrorMessage(null) };
  } catch (caught) {
    return { ok: false, message: authErrorMessage(caught as { message?: string }) };
  }
}

export async function signInWithId(username: string, password: string): Promise<AuthResult> {
  const problem = checkInputs(username, password);
  if (problem) return { ok: false, message: problem };
  try {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (error) return { ok: false, message: authErrorMessage(error) };
    const account = toAccount(data.user);
    return account ? { ok: true, account } : { ok: false, message: authErrorMessage(null) };
  } catch (caught) {
    return { ok: false, message: authErrorMessage(caught as { message?: string }) };
  }
}

export async function signOutAccount(): Promise<void> {
  try {
    await getSupabase().auth.signOut();
  } catch {
    // 인터넷이 없어도 이 기기에서는 로그아웃된 것으로 본다
  }
}

/** Supabase는 비밀번호가 6자 이상이어야 해서 4자리 PIN을 이 글자로 바꿔 보낸다(바꾸는 곳은 여기 하나) */
export const pinToPassword = (pin: string) => `oddie-pin-${pin}`;

export async function signUpWithPin(username: string, pin: string): Promise<AuthResult> {
  const check = validatePin(pin);
  return check.ok ? signUpWithId(username, pinToPassword(pin)) : { ok: false, message: check.message };
}

export async function signInWithPin(username: string, pin: string): Promise<AuthResult> {
  const check = validatePin(pin);
  return check.ok ? signInWithId(username, pinToPassword(pin)) : { ok: false, message: check.message };
}
