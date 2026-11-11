/*
 * 아이디+비밀번호 계정의 순수 규칙. Supabase Auth는 이메일 형식을 요구하므로 아이디를 가짜 이메일로 바꿔 쓴다.
 * 비밀번호는 여기서 검사만 하고 어디에도 저장하거나 기록하지 않는다.
 */

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 12;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72; // bcrypt 한계

/** 예약 도메인(.invalid)이라 실제 메일은 절대 가지 않는다. 시험 결과 Supabase가 받아들인다 */
export const FAKE_EMAIL_DOMAIN = 'oddie.invalid';

const USERNAME_PATTERN = /^[가-힣a-zA-Z0-9]+$/;

export type FieldCheck = { ok: true } | { ok: false; message: string };

export function validateUsername(raw: string): FieldCheck {
  const name = raw.trim();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return { ok: false, message: `아이디는 ${USERNAME_MIN}~${USERNAME_MAX}자로 만들어 주세요.` };
  }
  if (!USERNAME_PATTERN.test(name)) return { ok: false, message: '아이디는 한글, 영문, 숫자만 쓸 수 있어요.' };
  return { ok: true };
}

export function validatePassword(password: string): FieldCheck {
  if (password.length < PASSWORD_MIN) return { ok: false, message: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.` };
  if (password.length > PASSWORD_MAX) return { ok: false, message: `비밀번호는 ${PASSWORD_MAX}자 이하여야 해요.` };
  return { ok: true };
}

export const PIN_LENGTH = 4;
/** 로그인 비밀번호 대신 쓰는 숫자 4자리 */
export function validatePin(pin: string): FieldCheck {
  return /^\d{4}$/.test(pin) ? { ok: true } : { ok: false, message: `PIN은 숫자 ${PIN_LENGTH}자리예요.` };
}

/** 같은 아이디로 보는 기준: 영문은 대소문자를 구분하지 않는다 */
export function canonicalUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 아이디 → 가짜 이메일. 글자마다 코드값 4자리 hex(한글, 영문, 숫자는 모두 BMP)로 바꿔
 * 이메일 앞부분 64자 제한 안에 12자 한글까지 들어가게 한다. (예: "ab" → u00610062@oddie.invalid)
 */
export function usernameToEmail(raw: string): string {
  const hex = [...canonicalUsername(raw)].map((ch) => (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0')).join('');
  return `u${hex}@${FAKE_EMAIL_DOMAIN}`;
}

/** 가짜 이메일 → 정규화된 아이디(소문자). 우리 형식이 아니면 null */
export function emailToUsername(email: string | undefined | null): string | null {
  const match = new RegExp(`^u((?:[0-9a-f]{4})+)@${FAKE_EMAIL_DOMAIN.replace('.', '\\.')}$`).exec(email ?? '');
  if (!match) return null;
  const chars = match[1].match(/.{4}/g) ?? [];
  return chars.map((hex) => String.fromCodePoint(parseInt(hex, 16))).join('');
}

/** Supabase 오류를 한국어 안내로 */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return '이미 사용 중인 아이디예요.';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return '아이디나 비밀번호가 맞지 않아요.';
  }
  if (code === 'weak_password' || message.includes('password should be')) return '비밀번호가 너무 약해요. 6자 이상으로 만들어 주세요.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error?.status === 429) {
    return '잠깐 너무 많이 시도했어요. 조금 뒤에 다시 해 주세요.';
  }
  if (message.includes('fetch') || message.includes('network') || error?.status === 0) {
    return '인터넷에 연결할 수 없어요. 연결을 확인해 주세요.';
  }
  return '문제가 생겼어요. 잠시 뒤에 다시 해 주세요.';
}
