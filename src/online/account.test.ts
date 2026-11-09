import { describe, expect, it } from 'vitest';
import { clearLocalAccountData, loadOwner, loadSaveAt, newSave, SAVE_KEY, setOwner, writeSave } from '../world/save.ts';
import {
  authErrorMessage, canonicalUsername, emailToUsername, FAKE_EMAIL_DOMAIN, usernameToEmail, validatePassword, validateUsername,
} from './account.ts';
import { decideSync, describeSave, MAX_SAVE_BYTES, parseCloudData, saveBytes, withinSizeLimit } from './saveSync.ts';

const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
};

describe('아이디 검사', () => {
  it('2~12자, 한글/영문/숫자만', () => {
    for (const ok of ['ab', '준우', 'Oddie123', '가나다라마바사아자차카타']) expect(validateUsername(ok).ok, ok).toBe(true);
    for (const bad of ['a', '', '가나다라마바사아자차카타파', 'a b', 'ab!', 'ab_c', '😀😀', 'ㄱㄴ', 'ab-c']) {
      expect(validateUsername(bad).ok, bad).toBe(false);
    }
    expect(validateUsername(' 준우 ').ok).toBe(true); // 앞뒤 공백은 잘라서 본다
    const result = validateUsername('a');
    expect(!result.ok && result.message).toContain('2~12');
  });
  it('비밀번호는 6자 이상', () => {
    expect(validatePassword('12345').ok).toBe(false);
    expect(validatePassword('123456').ok).toBe(true);
    expect(validatePassword('가'.repeat(73)).ok).toBe(false);
  });
});

describe('가짜 이메일 변환', () => {
  it('글자마다 4자리 hex, 한글 12자도 이메일 앞부분 64자 안', () => {
    expect(usernameToEmail('ab')).toBe(`u00610062@${FAKE_EMAIL_DOMAIN}`);
    const longest = usernameToEmail('가나다라마바사아자차카타');
    expect(longest.split('@')[0].length).toBeLessThanOrEqual(64);
    expect(longest.split('@')[0].length).toBe(1 + 12 * 4);
  });
  it('영문 대소문자는 같은 아이디, 되돌리면 원래 글자', () => {
    expect(usernameToEmail('Oddie')).toBe(usernameToEmail('oddie'));
    expect(canonicalUsername(' Oddie ')).toBe('oddie');
    expect(emailToUsername(usernameToEmail('준우A1'))).toBe('준우a1');
    expect(emailToUsername('someone@example.com')).toBeNull();
    expect(emailToUsername(undefined)).toBeNull();
    expect(emailToUsername(`uzz@${FAKE_EMAIL_DOMAIN}`)).toBeNull();
  });
  it('서로 다른 아이디는 서로 다른 이메일', () => {
    const emails = new Set(['ab', 'ba', 'a', 'abc', '가', '나', '1', '01'].map(usernameToEmail));
    expect(emails.size).toBe(8);
  });
});

describe('오류 안내', () => {
  it('이미 있는 아이디, 틀린 비밀번호, 약한 비밀번호, 너무 많은 시도, 네트워크', () => {
    expect(authErrorMessage({ code: 'user_already_exists' })).toBe('이미 사용 중인 아이디예요.');
    expect(authErrorMessage({ message: 'User already registered' })).toContain('이미 사용 중');
    expect(authErrorMessage({ code: 'invalid_credentials' })).toBe('아이디나 비밀번호가 맞지 않아요.');
    expect(authErrorMessage({ message: 'Invalid login credentials' })).toContain('맞지 않아요');
    expect(authErrorMessage({ code: 'weak_password' })).toContain('6자');
    expect(authErrorMessage({ status: 429 })).toContain('너무 많이');
    expect(authErrorMessage({ message: 'Failed to fetch' })).toContain('인터넷');
    expect(authErrorMessage(null)).toContain('문제가 생겼어요');
  });
});

describe('저장 병합 판단', () => {
  const a = { ...newSave('가', 0), team: [{ speciesId: 1, level: 10, exp: 0 }] };
  const b = { ...a, coins: 999 };
  it('한쪽만 있으면 올리거나 내려받고, 둘 다 없으면 없음', () => {
    expect(decideSync(null, null)).toEqual({ action: 'none' });
    expect(decideSync({ data: a, at: 1 }, null)).toEqual({ action: 'upload' });
    expect(decideSync(null, { data: a, at: 1 })).toEqual({ action: 'use-cloud' });
  });
  it('둘 다 있고 같으면 아무것도 안 하고, 다르면 묻는다(더 최신 쪽을 알려 준다)', () => {
    expect(decideSync({ data: a, at: 1 }, { data: structuredClone(a), at: 9 })).toEqual({ action: 'none' });
    expect(decideSync({ data: a, at: 10 }, { data: b, at: 5 })).toEqual({ action: 'ask', newer: 'local' });
    expect(decideSync({ data: a, at: 5 }, { data: b, at: 10 })).toEqual({ action: 'ask', newer: 'cloud' });
  });
  it('요약 한 줄', () => {
    expect(describeSave(a, 0)).toContain('Lv.10');
    expect(describeSave(a, 0)).toContain('시각 모름');
  });
});

describe('서버에서 온 저장은 믿지 않는다', () => {
  it('올바른 v3 저장은 통과, 옛 형식은 옮기고, 이상한 값은 거절', () => {
    const good = { ...newSave('가', 1), team: [{ speciesId: 2, level: 5, exp: 0 }] };
    expect(parseCloudData(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseCloudData({ name: '옛', characterIndex: 1, starterId: 42 })?.team).toEqual([{ speciesId: 42, level: 10, exp: 0 }]);
    for (const bad of [null, 'text', 5, { version: 99, name: 'a', characterIndex: 0 }, { name: '', characterIndex: 0 }]) {
      expect(parseCloudData(bad as never), JSON.stringify(bad)).toBeNull();
    }
  });
  it('200KB를 넘으면 거절', () => {
    const big = { ...newSave('가', 0), junk: 'x'.repeat(MAX_SAVE_BYTES) };
    expect(withinSizeLimit(big)).toBe(false);
    expect(parseCloudData(big)).toBeNull();
    expect(saveBytes({ a: '가' })).toBe(new TextEncoder().encode('{"a":"가"}').length); // 한글은 3바이트
  });
});

describe('이 기기의 저장 표식', () => {
  it('저장하면 시각이 남고, 로그아웃 정리는 저장과 표식을 모두 지운다', () => {
    const s = store();
    expect(loadSaveAt(s)).toBe(0);
    writeSave(newSave('가', 0), s);
    setOwner('user-1', s);
    expect(loadSaveAt(s)).toBeGreaterThan(0);
    expect(loadOwner(s)).toBe('user-1');
    clearLocalAccountData(s);
    expect(s.map.has(SAVE_KEY)).toBe(false);
    expect(loadSaveAt(s)).toBe(0);
    expect(loadOwner(s)).toBeNull();
  });
});
