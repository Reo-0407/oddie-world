import { useState } from 'react';
import { signInWithId, signUpWithId, type Account } from '../online/accountClient.ts';
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '../online/account.ts';
import { describeSave, type SaveSide } from '../online/saveSync.ts';

interface AuthProps {
  onLogin: (account: Account) => void;
  onGuest: () => void;
  /** 게스트가 게임 중에 로그인 화면을 연 경우 돌아가기 */
  onCancel?: () => void;
}

type Tab = 'login' | 'signup';

/** 로그인/가입 화면. 아이디와 비밀번호만 쓰고, 비밀번호는 이 화면 밖으로 나가지 않는다 */
export function AuthScreen({ onLogin, onGuest, onCancel }: AuthProps) {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (tab === 'signup' && password !== confirm) {
      setMessage('비밀번호가 서로 달라요.');
      return;
    }
    setBusy(true);
    const result = tab === 'signup' ? await signUpWithId(username, password) : await signInWithId(username, password);
    setBusy(false);
    setPassword('');
    setConfirm('');
    if (result.ok) onLogin(result.account);
    else setMessage(result.message);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setMessage(null);
    setPassword('');
    setConfirm('');
  };

  return (
    <main className="screen auth">
      <h1>오디 월드</h1>
      <div className="menu-row" role="tablist" aria-label="로그인 또는 가입">
        <button role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'selected' : ''} onClick={() => switchTab('login')}>로그인</button>
        <button role="tab" aria-selected={tab === 'signup'} className={tab === 'signup' ? 'selected' : ''} onClick={() => switchTab('signup')}>가입</button>
      </div>
      <form onSubmit={submit}>
        <label className="name-field">
          아이디
          <input
            value={username}
            maxLength={USERNAME_MAX}
            placeholder={`${USERNAME_MIN}~${USERNAME_MAX}자, 한글·영문·숫자`}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="name-field">
          비밀번호
          <input
            type="password"
            value={password}
            placeholder={`${PASSWORD_MIN}자 이상`}
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {tab === 'signup' && (
          <label className="name-field">
            비밀번호 한 번 더
            <input type="password" value={confirm} autoComplete="new-password" onChange={(event) => setConfirm(event.target.value)} />
          </label>
        )}
        {message && <p className="online-error" role="alert">{message}</p>}
        <button className="wide" type="submit" disabled={busy || username.trim() === '' || password === ''}>
          {busy ? '잠깐만요…' : tab === 'signup' ? '가입하기' : '로그인'}
        </button>
      </form>
      <button className="wide" onClick={onGuest}>게스트로 시작</button>
      <p className="online-note">
        게스트로 하면 저장이 이 기기에만 남아요. 브라우저 데이터를 지우면 사라지고, 다른 기기에서는 이어 할 수 없어요.
        계정을 만들면 어디서든 이어 하고 대전 랭킹도 남아요.
      </p>
      {onCancel && <button className="wide" onClick={onCancel}>돌아가기</button>}
    </main>
  );
}

interface ConflictProps {
  local: SaveSide;
  cloud: SaveSide;
  newer: 'local' | 'cloud';
  onChoose: (side: 'local' | 'cloud') => void;
}

/** 이 기기의 저장과 계정의 저장이 다를 때 어느 쪽을 쓸지 묻는다 */
export function ConflictDialog({ local, cloud, newer, onChoose }: ConflictProps) {
  return (
    <div className="panel-overlay conflict" role="dialog" aria-label="저장 선택" style={{ position: 'fixed' }}>
      <div className="panel">
        <h2>어느 저장을 쓸까요?</h2>
        <p className="note">이 기기의 저장과 계정에 올라간 저장이 달라요. 고르지 않은 쪽은 덮어써져요.</p>
        <button className="wide" onClick={() => onChoose('local')}>
          이 기기의 저장 사용{newer === 'local' ? ' (더 최근)' : ''}
          <small style={{ display: 'block', fontWeight: 400 }}>{describeSave(local.data, local.at)}</small>
        </button>
        <button className="wide" onClick={() => onChoose('cloud')}>
          계정의 저장 사용{newer === 'cloud' ? ' (더 최근)' : ''}
          <small style={{ display: 'block', fontWeight: 400 }}>{describeSave(cloud.data, cloud.at)}</small>
        </button>
      </div>
    </div>
  );
}
