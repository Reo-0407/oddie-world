import { useEffect, useRef, useState } from 'react';
import { signInWithPin, signUpWithPin, type Account } from '../online/accountClient.ts';
import { PIN_LENGTH, USERNAME_MAX, USERNAME_MIN, validateUsername } from '../online/account.ts';
import { describeSave, type SaveSide } from '../online/saveSync.ts';
import { PLAYER_LOOKS, drawCharacter } from '../overworld/sprites.ts';
import type { Dir } from '../overworld/maps/types.ts';

interface AuthProps {
  onLogin: (account: Account) => void;
  /** 가입하면 고른 캐릭터와 함께 알린다(저장은 App이 만든다) */
  onSignedUp: (account: Account, characterIndex: number) => void;
  /** 게스트가 게임 중에 로그인 화면을 연 경우 돌아가기 */
  onCancel?: () => void;
}

type Tab = 'login' | 'signup';

const SCALE = 3;
const DIRS: Dir[] = ['down', 'right', 'up', 'left'];

/** 캐릭터 그림이 제자리에서 걷는 미리보기(월드와 같은 그리기 함수) */
function LookPreview({ index }: { index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    let t = 0;
    const draw = () => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, 32 * SCALE, 40 * SCALE);
      c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      c.imageSmoothingEnabled = false;
      drawCharacter(c, PLAYER_LOOKS[index], DIRS[Math.floor(t / 8) % 4], 1 + (t % 2), 0, 4);
      t += 1;
    };
    draw();
    const id = window.setInterval(draw, 180);
    return () => window.clearInterval(id);
  }, [index]);
  return <canvas ref={ref} className="look-preview" width={32 * SCALE} height={40 * SCALE} aria-label="캐릭터 미리보기" />;
}

/** 6색 캐릭터 고르기 + 미리보기 */
export function LookPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  return (
    <div>
      <LookPreview index={value} />
      <div className="look-pick" role="radiogroup" aria-label="캐릭터 색">
        {PLAYER_LOOKS.map((look, i) => (
          <button
            key={i} type="button" role="radio" aria-checked={value === i} aria-label={`캐릭터 ${i + 1}`}
            className={value === i ? 'selected' : ''} onClick={() => onChange(i)}
          >
            <span style={{ display: 'block', width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(${look.hair} 0 40%, ${look.shirt} 40% 100%)` }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** 숫자 4자리 PIN 입력(화면 숫자판 + 키보드 숫자) */
function PinPad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const live = useRef({ value, disabled, onChange });
  live.current = { value, disabled, onChange };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const s = live.current;
      if (s.disabled || (t && t.tagName === 'INPUT')) return;
      if (/^\d$/.test(e.key) && s.value.length < PIN_LENGTH) s.onChange(s.value + e.key);
      else if (e.key === 'Backspace') s.onChange(s.value.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const press = (d: string) => { if (!disabled && value.length < PIN_LENGTH) onChange(value + d); };
  return (
    <div>
      <div className="pin-dots" aria-label={`PIN ${value.length}자리 입력됨`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => <i key={i} className={i < value.length ? 'on' : ''} />)}
      </div>
      <div className="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" disabled={disabled} onClick={() => press(d)}>{d}</button>)}
        <span />
        <button type="button" disabled={disabled} onClick={() => press('0')}>0</button>
        <button type="button" disabled={disabled} aria-label="지우기" onClick={() => onChange(value.slice(0, -1))}>←</button>
      </div>
    </div>
  );
}

/** 로그인/가입 화면. 아이디 + 숫자 4자리 PIN. 가입할 때 캐릭터도 고른다 */
export function AuthScreen({ onLogin, onSignedUp, onCancel }: AuthProps) {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [look, setLook] = useState(0);
  /** 0=아이디(가입은 캐릭터도), 1=PIN, 2=가입 PIN 한 번 더 */
  const [step, setStep] = useState(0);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clearPins = () => { setPin(''); setPin2(''); };
  const reset = (next: Tab) => { setTab(next); setStep(0); clearPins(); setMessage(null); };

  const submit = async (p: string) => {
    setBusy(true);
    setMessage(null);
    const result = tab === 'signup' ? await signUpWithPin(username, p) : await signInWithPin(username, p);
    setBusy(false);
    clearPins();
    if (result.ok) {
      if (tab === 'signup') onSignedUp(result.account, look);
      else onLogin(result.account);
    } else {
      setMessage(result.message);
      setStep(1);
    }
  };

  const onPin = (v: string) => {
    setPin(v);
    if (v.length < PIN_LENGTH) return;
    if (tab === 'login') void submit(v);
    else { setStep(2); setMessage(null); }
  };
  const onPin2 = (v: string) => {
    setPin2(v);
    if (v.length < PIN_LENGTH) return;
    if (v !== pin) { setMessage('PIN이 서로 달라요. 처음부터 다시 눌러 주세요.'); clearPins(); setStep(1); return; }
    void submit(v);
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateUsername(username);
    if (!check.ok) { setMessage(check.message); return; }
    setMessage(null);
    setStep(1);
  };

  return (
    <main className="screen auth">
      <h1>오디 월드</h1>
      <div className="menu-row" role="tablist" aria-label="로그인 또는 가입">
        <button role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'selected' : ''} onClick={() => reset('login')}>로그인</button>
        <button role="tab" aria-selected={tab === 'signup'} className={tab === 'signup' ? 'selected' : ''} onClick={() => reset('signup')}>가입</button>
      </div>
      {step === 0 ? (
        <form onSubmit={next}>
          <label className="name-field">
            아이디
            <input
              value={username} maxLength={USERNAME_MAX} placeholder={`${USERNAME_MIN}~${USERNAME_MAX}자, 한글·영문·숫자`}
              autoComplete="username" onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          {tab === 'signup' && <><p className="note">캐릭터를 골라 줘!</p><LookPicker value={look} onChange={setLook} /></>}
          {message && <p className="online-error" role="alert">{message}</p>}
          <button className="wide" type="submit" disabled={username.trim() === ''}>다음</button>
        </form>
      ) : (
        <div>
          <p className="note">
            <b>{username.trim()}</b> · {tab === 'login' ? 'PIN 4자리를 눌러 줘' : step === 1 ? '새 PIN 4자리를 정해 줘' : '같은 PIN을 한 번 더'}
          </p>
          {step === 1
            ? <PinPad key="p1" value={pin} onChange={onPin} disabled={busy} />
            : <PinPad key="p2" value={pin2} onChange={onPin2} disabled={busy} />}
          {busy && <p className="online-note">잠깐만요…</p>}
          {message && <p className="online-error" role="alert">{message}</p>}
          <button className="wide" type="button" disabled={busy} onClick={() => { setStep(0); clearPins(); setMessage(null); }}>뒤로</button>
        </div>
      )}
      <p className="online-note">계정을 만들면 어디서든 이어 하고 대전 랭킹도 남아요. PIN은 잊지 않게 기억해 둬요.</p>
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
