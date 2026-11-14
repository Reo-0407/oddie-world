import { useEffect, useRef, useState } from 'react';
import { speciesById } from '../data/index.ts';
import type { SaveData } from '../game/save.ts';
import { DexOverlay } from './DexOverlay.tsx';
import { OddieArt, typeColor } from './OddieArt.tsx';
import { SoundToggle } from './SoundToggle.tsx';
import { expToNext, MAX_LEVEL } from '../game/growth.ts';
import { BADGE_NAMES, BADGE_ORDER } from '../overworld/encounters.ts';
import { questText, rewardText } from '../game/quests.ts';
import {
  canTransfer, candyOf, deposit, levelCap, powerUp, powerUpBlock, powerUpCost, RARE_CANDY_NAME, transfer, withdraw, type Where,
} from '../game/candy.ts';
import { MAX_TEAM, type OwnedOddie } from '../game/owned.ts';
import { questsAfter } from '../battle/outcome.ts';
import { ROD_FLAG } from '../overworld/fishing.ts';
import { sfx } from '../audio/audio.ts';

export const BADGE_COLORS = { meadow: '#3a9a4a', desert: '#e0892f', snow: '#4ab0d8', volcano: '#c8402a' } as const;

export interface MenuActions {
  /** 로그인한 아이디. 게스트면 null */
  accountName: string | null;
  onOnline(): void;
  onLogout(): void;
  /** 게스트가 로그인/가입 화면을 연다 */
  onLogin(): void;
  onRestart(): void;
}

type Panel = 'main' | 'dex' | 'team' | 'bag' | 'quest' | 'badges' | 'account' | 'restart';

const ITEMS: { id: Exclude<Panel, 'main'> | 'online'; label: string; icon: string; color: string }[] = [
  { id: 'dex', label: '도감', icon: '▤', color: '#e0523f' },
  { id: 'team', label: '팀', icon: '●', color: '#3f78d8' },
  { id: 'bag', label: '가방', icon: '◆', color: '#e0892f' },
  { id: 'quest', label: '퀘스트', icon: '!', color: '#2fa89a' },
  { id: 'badges', label: '배지', icon: '★', color: '#d8a520' },
  { id: 'online', label: '친구 대전', icon: '⚔', color: '#8a5ac8' },
  { id: 'account', label: '계정', icon: '☺', color: '#3a9a4a' },
  { id: 'restart', label: '처음부터', icon: '↺', color: '#6b6f78' },
];

/** 포켓몬 고처럼 둥근 버튼으로 된 메뉴 */
export function GameMenu({ data, actions, onData, onClose, start }: {
  data: SaveData; actions: MenuActions; onData(next: SaveData): void; onClose(): void;
  /** 처음 열 창(퀘스트 게시판에서 열 때) */
  start?: 'quest' | 'dex';
}) {
  const [panel, setPanel] = useState<Panel>(start ?? 'main');
  const boxRef = useRef<HTMLDivElement>(null);
  // 창을 바꾸면 맨 위부터(가로 폰에서 앞 창의 스크롤이 남지 않게)
  useEffect(() => { boxRef.current?.scrollTo?.(0, 0); }, [panel]);
  // HUD에서 바로 연 도감은 닫으면 메뉴도 닫는다
  if (panel === 'dex') return <DexOverlay dex={data.dex} candy={data.candy} onClose={start === 'dex' ? onClose : () => setPanel('main')} />;

  const back = <button type="button" className="wide" onClick={() => setPanel('main')}>뒤로</button>;
  let body;
  if (panel === 'team') {
    body = <TeamPanel data={data} onData={onData} back={back} />;
  } else if (panel === 'bag') {
    body = (
      <>
        <h2>가방</h2>
        <ul className="gm-bag">
          <li><span>코인</span><b>{data.coins}</b></li>
          <li><span>로프</span><b>{data.ropes.basic}</b></li>
          <li><span>튼튼한 로프</span><b>{data.ropes.sturdy}</b></li>
          <li><span>회복약</span><b>{data.potions}</b></li>
          <li><span>{RARE_CANDY_NAME} (어느 종에나)</span><b>{data.rareCandy ?? 0}</b></li>
          {data.flags.includes(ROD_FLAG) && <li><span>낚싯대</span><b>✓</b></li>}
          {data.daily && <li><span>매일 보상 연속</span><b>{data.daily.streak}일</b></li>}
        </ul>
        <p className="gm-where"><b>로프 얻는 곳</b> 상점(각 마을) · 숨은 반짝이 · 도감 5종 보상 · 퀘스트 보상 · 오디 센터(로프가 하나도 없을 때 3개 무료)</p>
        {back}
      </>
    );
  } else if (panel === 'quest') {
    const list = data.quests?.list ?? [];
    body = (
      <>
        <h2>퀘스트</h2>
        {list.length === 0 && <p className="note">첫 오디를 받으면 퀘스트가 생겨요.</p>}
        <ul className="gm-quests">
          {list.map((q) => (
            <li key={q.id}>
              <b>{questText(q)}</b>
              <span className="gm-qbar" aria-label={`${q.progress} / ${q.goal}`}><i style={{ width: `${(q.progress / q.goal) * 100}%` }} /></span>
              <span className="gm-qrow"><span>{q.progress} / {q.goal}</span><span>{rewardText(q.reward)}</span></span>
            </li>
          ))}
        </ul>
        <p className="note">끝내면 보상을 받고 새 퀘스트가 생겨요{data.quests?.done ? ` · 지금까지 ${data.quests.done}개 완료` : ''}</p>
        {back}
      </>
    );
  } else if (panel === 'badges') {
    body = (
      <>
        <h2>배지 {BADGE_ORDER.filter((b) => data.badges.includes(b)).length} / 4</h2>
        <div className="gm-badges" aria-label={`배지 ${data.badges.length}개`}>
          {BADGE_ORDER.map((b) => (
            <span key={b} className={`gm-badge${data.badges.includes(b) ? '' : ' off'}`} style={{ background: BADGE_COLORS[b] }} title={BADGE_NAMES[b]}>
              {BADGE_NAMES[b].slice(0, 2)}
            </span>
          ))}
        </div>
        {back}
      </>
    );
  } else if (panel === 'account') {
    body = (
      <>
        <h2>계정</h2>
        {actions.accountName
          ? <p className="note">아이디: <b>{actions.accountName}</b> · 저장은 계정에 올라가요</p>
          : <p className="note">게스트 · 저장이 이 기기에만 있어요</p>}
        {actions.accountName
          ? <button type="button" className="wide" onClick={actions.onLogout}>로그아웃</button>
          : <button type="button" className="wide" onClick={actions.onLogin}>로그인 / 가입</button>}
        <p className="gm-credit">「Catch an Oddie」의 캐릭터로 만든 학교 활동 게임입니다.</p>
        {back}
      </>
    );
  } else if (panel === 'restart') {
    body = (
      <>
        <h2>처음부터 할까요?</h2>
        <p className="note">지금까지의 오디 {data.team.length + data.box.length}마리, 코인 {data.coins}, 도감, 배지가 <b>모두 사라지고 되돌릴 수 없어요.</b></p>
        <button type="button" className="wide" onClick={() => setPanel('main')}>아니요, 계속할래요</button>
        <button type="button" className="wide gm-danger" onClick={() => { onClose(); actions.onRestart(); }}>네, 모두 지우고 처음부터</button>
      </>
    );
  } else {
    body = (
      <div className="gm-grid">
        {ITEMS.map((it, i) => (
          <button
            key={it.id} type="button" className="gm-item" style={{ '--i': i } as React.CSSProperties}
            onClick={() => { if (it.id === 'online') actions.onOnline(); else setPanel(it.id); }}
          >
            <span className="gm-icon" style={{ background: it.color }} aria-hidden>{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div ref={boxRef} className="gm" role="dialog" aria-label="메뉴" onPointerDown={(e) => e.stopPropagation()}>
      <SoundToggle className="corner" />
      <div key={panel} className="gm-body">{body}</div>
      <button type="button" className="gm-close" aria-label="닫기" data-nosfx onClick={onClose}>✕</button>
    </div>
  );
}

const BLOCK_TEXT = { max: '최대 레벨이에요', cap: '배지를 더 모으면 더 올릴 수 있어요', candy: '사탕이 모자라요', coins: '코인이 모자라요' } as const;

/** 팀·박스: 오디를 누르면 상세(사탕·강화·순서·박스·박사에게 보내기) */
function TeamPanel({ data, onData, back }: { data: SaveData; onData(next: SaveData): void; back: React.ReactNode }) {
  const [tab, setTab] = useState<Where>('team');
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [spark, setSpark] = useState(0);
  const [confirm, setConfirm] = useState(false);
  /** 팀이 꽉 찼을 때 박스 오디와 바꿀 팀 오디를 고르는 중 */
  const [swapping, setSwapping] = useState(false);
  const list = tab === 'team' ? data.team : data.box;
  const o: OwnedOddie | undefined = sel === null ? undefined : list[sel];
  const pick = (w: Where, i: number | null) => { setTab(w); setSel(i); setMsg(''); setConfirm(false); setSwapping(false); };
  const apply = (next: SaveData | null, text: string, keep: number | null = null) => {
    if (!next) return;
    onData(next);
    setSel(keep);
    setMsg(text);
    setConfirm(false);
    setSwapping(false);
  };

  const card = (m: OwnedOddie, i: number, w: Where) => {
    const sp = speciesById(m.speciesId);
    const on = tab === w && sel === i;
    const exp = m.level >= MAX_LEVEL ? 1 : Math.min(1, m.exp / expToNext(m.level));
    return (
      <button
        key={i} type="button" className={`gm-mon${on ? ' on' : ''}`} aria-pressed={on}
        style={{ background: `linear-gradient(160deg, ${typeColor(sp.types[0])}, ${typeColor(sp.types[1] ?? sp.types[0])})` }}
        onClick={() => {
          if (swapping && w === 'team' && sel !== null) {
            const name = speciesById(data.box[sel].speciesId).name;
            return apply(withdraw(data, sel, i), `${name}을(를) 팀에 넣고 ${sp.name}은(는) 박스로 보냈어요`);
          }
          pick(w, on ? null : i);
        }}
      >
        {w === 'team' && i === 0 && <em className="gm-lead">선두</em>}
        {m.shiny && <em className="gm-shiny" aria-label="반짝이">✨</em>}
        <OddieArt speciesId={m.speciesId} name={sp.name} types={sp.types} size={w === 'box' ? 44 : 56} />
        <b>{sp.name}</b><span>Lv.{m.level}</span>
        {w === 'team' && <span className="gm-exp" aria-label={`경험치 ${Math.round(exp * 100)}%`}><i style={{ width: `${exp * 100}%` }} /></span>}
      </button>
    );
  };

  let detail = null;
  if (o && sel !== null) {
    const sp = speciesById(o.speciesId);
    const cost = powerUpCost(o.level);
    const block = powerUpBlock(data, o);
    const cap = Math.min(MAX_LEVEL, levelCap(data.badges.length));
    const rare = data.rareCandy ?? 0;
    detail = (
      <div className="gm-detail">
        {spark > 0 && <div key={spark} className="gm-spark" aria-hidden>{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ '--i': k } as React.CSSProperties} />)}</div>}
        <div className="gm-detail-head">
          <span key={`s${spark}`} className={spark ? 'gm-lvup' : ''}><OddieArt speciesId={o.speciesId} name={sp.name} types={sp.types} size={64} /></span>
          <div>
            <b>{o.shiny && '✨'}{sp.name} Lv.{o.level}</b>
            <span className="note" style={{ padding: 0, background: 'none', textAlign: 'left' }}>강화 상한 Lv.{cap} (배지 {data.badges.length}개)</span>
            <span className="gm-candy" style={{ '--c1': typeColor(sp.types[0]), '--c2': typeColor(sp.types[1] ?? sp.types[0]) } as React.CSSProperties}>
              {sp.name} 사탕 <b>{candyOf(data, o.speciesId)}</b>{rare > 0 && <> · {RARE_CANDY_NAME} {rare}</>}
            </span>
          </div>
        </div>
        <div className="gm-actions">
          <button
            type="button" className="gm-power" disabled={!!block}
            onClick={() => {
              const up = powerUp(data, tab, sel);
              if (!up) return;
              const q = questsAfter(up, { kind: 'powerUp' });
              sfx('levelup');
              setSpark((k) => k + 1);
              apply(q.save, [`${sp.name}이(가) Lv.${o.level + 1}이(가) 되었다!`, ...q.lines].join(' '), sel);
            }}
          >강화 ▲ 사탕 {cost.candy} · 코인 {cost.coins}</button>
          {tab === 'team' && sel > 0 && (
            <button type="button" onClick={() => apply({ ...data, team: [data.team[sel], ...data.team.filter((_, i) => i !== sel)] }, `${sp.name}이(가) 선두가 되었어요`, 0)}>맨 앞으로</button>
          )}
          {tab === 'team' && data.team.length > 1 && (
            <button type="button" onClick={() => apply(deposit(data, sel), `${sp.name}을(를) 박스로 보냈어요`)}>박스로</button>
          )}
          {tab === 'box' && data.team.length < MAX_TEAM && (
            <button type="button" onClick={() => apply(withdraw(data, sel), `${sp.name}이(가) 팀에 들어왔어요`)}>팀에 넣기</button>
          )}
          {tab === 'box' && data.team.length >= MAX_TEAM && (
            <button type="button" className={swapping ? 'on' : ''} onClick={() => { setSwapping(!swapping); setMsg(swapping ? '' : '위 팀에서 바꿀 오디를 누르세요'); }}>팀과 바꾸기</button>
          )}
          {canTransfer(data, tab, sel) && (
            <button
              type="button" className={confirm ? 'gm-danger' : ''}
              onClick={() => {
                if (!confirm) { setConfirm(true); setMsg(`정말 ${sp.name}을(를) 박사님께 보낼까요? 사탕 1개를 받아요. 한 번 더 누르면 보내요.`); return; }
                apply(transfer(data, tab, sel), `${sp.name}을(를) 박사님께 보냈어요. ${sp.name} 사탕 +1`);
              }}
            >{confirm ? '정말 보내기' : '박사에게 보내기'}</button>
          )}
        </div>
        {block && <p className="gm-msg">{BLOCK_TEXT[block]}</p>}
      </div>
    );
  }

  return (
    <>
      <h2>팀</h2>
      <div className="gm-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'on' : ''} onClick={() => pick('team', null)}>팀 {data.team.length}/{MAX_TEAM}</button>
        <button type="button" role="tab" aria-selected={tab === 'box'} className={tab === 'box' ? 'on' : ''} onClick={() => pick('box', null)}>박스 {data.box.length}</button>
      </div>
      {(tab === 'team' || swapping) && <div className="gm-team">{data.team.map((m, i) => card(m, i, 'team'))}</div>}
      {tab === 'box' && !swapping && (
        data.box.length ? <div className="gm-team gm-box">{data.box.map((m, i) => card(m, i, 'box'))}</div> : <p className="note">박스가 비었어요. 팀이 꽉 차면 잡은 오디가 여기로 와요.</p>
      )}
      {detail}
      {msg && <p className="gm-msg" role="status">{msg}</p>}
      {!o && <p className="note">오디를 누르면 강화·순서 바꾸기·박사에게 보내기를 할 수 있어요. 사탕은 잡거나(3개) 같은 종을 박사에게 보내면(1개) 받아요.</p>}
      {back}
    </>
  );
}
