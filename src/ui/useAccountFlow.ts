import { useCallback, useEffect, useRef, useState } from 'react';
import { currentAccount, signOutAccount, type Account } from '../online/accountClient.ts';
import { deleteCloudSave, fetchCloudSave, uploadCloudSave } from '../online/cloudSave.ts';
import { decideSync, withMergedDex, type SaveSide } from '../online/saveSync.ts';
import {
  clearLocalAccountData, clearSave, loadOwner, loadSave, loadSaveAt, newSave, setOwner, writeSave, type SaveData,
} from '../game/save.ts';

const GUEST_KEY = 'oddie-guest';
const UPLOAD_DELAY_MS = 3000; // 저장이 바뀐 뒤 이만큼 조용하면 올린다
const RETRY_MS = 20_000; // 올리기에 실패하면 다시 시도하는 간격

export type Phase = 'booting' | 'auth' | 'ready';

export interface Conflict {
  local: SaveSide;
  cloud: SaveSide;
  newer: 'local' | 'cloud';
}

function guestFlag(): boolean {
  try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; }
}
function setGuestFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, '1');
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    // 저장소를 못 써도 게임은 계속된다
  }
}

/**
 * 로그인 상태와 저장(이 기기 + 클라우드)을 한곳에서 다룬다.
 * 게임은 언제나 이 기기의 저장으로 돌아가고, 계정이 있으면 3초 디바운스로 클라우드에 올린다.
 * 인터넷이 없거나 올리기에 실패해도 게임은 계속되고 다음 기회에 다시 올린다.
 */
export function useAccountFlow() {
  const [phase, setPhase] = useState<Phase>('booting');
  const [account, setAccount] = useState<Account | null>(null);
  const [data, setData] = useState<SaveData | null>(() => loadSave());
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [authCancelable, setAuthCancelable] = useState(false);

  const accountRef = useRef<Account | null>(null);
  const pending = useRef<SaveData | null>(null); // 아직 클라우드에 못 올린 최신 저장
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uploading = useRef(false);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const current = accountRef.current;
    const next = pending.current;
    if (!current || !next || uploading.current) return;
    uploading.current = true;
    const ok = await uploadCloudSave(current.id, next);
    uploading.current = false;
    if (ok) {
      if (pending.current === next) pending.current = null;
      else void flush(); // 올리는 사이 또 바뀌었다
    } else {
      timer.current = setTimeout(() => { void flush(); }, RETRY_MS);
    }
  }, []);

  const scheduleUpload = useCallback((next: SaveData) => {
    pending.current = next;
    if (!accountRef.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, UPLOAD_DELAY_MS);
  }, [flush]);

  /** 로그인한 직후: 이 기기의 저장과 계정의 저장을 맞춘다 */
  const syncAfterLogin = useCallback(async (who: Account) => {
    accountRef.current = who;
    setAccount(who);
    const owner = loadOwner();
    if (owner && owner !== who.id && owner !== 'guest') clearLocalAccountData(); // 다른 계정이 남긴 저장은 쓰지 않는다
    const localData = loadSave();
    const local: SaveSide | null = localData ? { data: localData, at: loadSaveAt() || Date.now() } : null;
    const fetched = await fetchCloudSave(who.id);
    setOwner(who.id);
    setGuestFlag(false);

    if (fetched.kind === 'error') {
      // 인터넷 문제: 이 기기의 저장으로 계속하고 나중에 올린다
      setData(localData);
      if (localData) scheduleUpload(localData);
      return;
    }
    const cloud = fetched.kind === 'ok' ? fetched.save : null;
    const decision = decideSync(local, cloud);
    if (decision.action === 'upload' && local) {
      setData(local.data);
      scheduleUpload(local.data);
    } else if (decision.action === 'use-cloud' && cloud) {
      writeSave(cloud.data);
      setData(cloud.data);
    } else if (decision.action === 'ask' && local && cloud) {
      setData(local.data);
      setConflict({ local, cloud, newer: decision.newer });
    } else if (local && cloud) {
      // 같은 게임: 도감 기록만 합친다(어느 한쪽이 더 많이 알고 있을 수 있다)
      const merged = withMergedDex(local.data, cloud.data);
      if (JSON.stringify(merged.dex) !== JSON.stringify(local.data.dex)) {
        writeSave(merged);
        scheduleUpload(merged);
      }
      setData(merged);
    } else {
      setData(local?.data ?? cloud?.data ?? null);
    }
  }, [scheduleUpload]);

  // 앱이 켜질 때: 저장된 로그인이 있으면 이어 가고, 없으면 게스트 저장이 있을 때만 바로 시작한다
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const who = await currentAccount();
      if (cancelled) return;
      if (who) {
        await syncAfterLogin(who);
        if (!cancelled) setPhase('ready');
      } else if (loadSave() || guestFlag()) {
        setGuestFlag(true);
        setOwner('guest');
        setPhase('ready');
      } else {
        setPhase('auth');
      }
    })();
    return () => { cancelled = true; };
  }, [syncAfterLogin]);

  // 인터넷이 돌아오거나 탭을 숨길 때 밀린 저장을 올린다
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'hidden') void flush(); };
    const onOnline = () => { void flush(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearTimeout(timer.current);
    };
  }, [flush]);

  const update = useCallback((next: SaveData) => {
    setData(next);
    writeSave(next);
    scheduleUpload(next);
  }, [scheduleUpload]);

  const restart = useCallback(() => {
    clearSave();
    pending.current = null;
    clearTimeout(timer.current);
    setData(null);
    const who = accountRef.current;
    if (who) void deleteCloudSave(who.id);
  }, []);

  const login = useCallback(async (who: Account) => {
    await syncAfterLogin(who);
    setAuthCancelable(false);
    setPhase('ready');
  }, [syncAfterLogin]);

  /** 가입 직후: 계정에 저장이 없으면 고른 캐릭터로 새 저장을 만든다(게스트 저장이 있으면 그대로 이어 간다) */
  const signup = useCallback(async (who: Account, characterIndex: number) => {
    await syncAfterLogin(who);
    if (!loadSave()) update(newSave(who.username, characterIndex));
    setAuthCancelable(false);
    setPhase('ready');
  }, [syncAfterLogin, update]);

  const guest = useCallback(() => {
    setGuestFlag(true);
    setOwner('guest');
    setAuthCancelable(false);
    setPhase('ready');
  }, []);

  /** 게스트가 게임 중에 로그인/가입 화면을 연다 */
  const openAuth = useCallback(() => { setAuthCancelable(true); setPhase('auth'); }, []);
  const cancelAuth = useCallback(() => { setAuthCancelable(false); setPhase('ready'); }, []);

  /** 로그아웃: 밀린 저장을 올려 보고, 이 기기의 저장을 비워 다른 사람이 이어 받지 못하게 한다 */
  const logout = useCallback(async () => {
    await Promise.race([flush(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    await signOutAccount();
    clearLocalAccountData();
    setGuestFlag(false);
    pending.current = null;
    clearTimeout(timer.current);
    accountRef.current = null;
    setAccount(null);
    setData(null);
    setConflict(null);
    setPhase('auth');
  }, [flush]);

  const conflictRef = useRef<Conflict | null>(null);
  conflictRef.current = conflict;
  const resolveConflict = useCallback((choice: 'local' | 'cloud') => {
    const current = conflictRef.current;
    if (!current) return;
    const picked = choice === 'local' ? current.local : current.cloud;
    const other = choice === 'local' ? current.cloud : current.local;
    const result = withMergedDex(picked.data, other.data); // 어느 쪽을 골라도 도감 기록은 합친다
    writeSave(result);
    setData(result);
    if (choice === 'local' || JSON.stringify(result.dex) !== JSON.stringify(picked.data.dex)) scheduleUpload(result);
    setConflict(null);
  }, [scheduleUpload]);

  return { phase, account, data, conflict, authCancelable, update, restart, login, signup, guest, openAuth, cancelAuth, logout, resolveConflict };
}
