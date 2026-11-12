import { useState } from 'react';
import { speciesById } from '../data/index.ts';
import type { SaveData } from '../game/save.ts';
import { DexOverlay } from './DexOverlay.tsx';
import { OddieArt, typeColor } from './OddieArt.tsx';
import { SoundToggle } from './SoundToggle.tsx';
import { expToNext, MAX_LEVEL } from '../game/growth.ts';
import { BADGE_NAMES, BADGE_ORDER } from '../overworld/encounters.ts';
import { questText, rewardText } from '../game/quests.ts';

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
  start?: 'quest';
}) {
  const [panel, setPanel] = useState<Panel>(start ?? 'main');
  const [picked, setPicked] = useState<number | null>(null);
  if (panel === 'dex') return <DexOverlay dex={data.dex} onClose={() => setPanel('main')} />;

  const back = <button type="button" className="wide" onClick={() => setPanel('main')}>뒤로</button>;
  let body;
  if (panel === 'team') {
    body = (
      <>
        <h2>팀</h2>
        <div className="gm-team">
          {data.team.map((o, i) => {
            const sp = speciesById(o.speciesId);
            const a = typeColor(sp.types[0]);
            const b = typeColor(sp.types[1] ?? sp.types[0]);
            const exp = o.level >= MAX_LEVEL ? 1 : Math.min(1, o.exp / expToNext(o.level));
            return (
              <button
                key={i} type="button" className={`gm-mon${picked === i ? ' on' : ''}`} aria-pressed={picked === i}
                style={{ background: `linear-gradient(160deg, ${a}, ${b})` }} onClick={() => setPicked(picked === i ? null : i)}
              >
                {i === 0 && <em className="gm-lead">선두</em>}
                {o.shiny && <em className="gm-shiny" aria-label="반짝이">✨</em>}
                <OddieArt speciesId={o.speciesId} name={sp.name} types={sp.types} size={56} />
                <b>{sp.name}</b><span>Lv.{o.level}</span>
                <span className="gm-exp" aria-label={`경험치 ${Math.round(exp * 100)}%`}><i style={{ width: `${exp * 100}%` }} /></span>
              </button>
            );
          })}
        </div>
        {picked !== null && picked > 0 && picked < data.team.length && (
          <button type="button" className="wide" onClick={() => {
            const team = [data.team[picked], ...data.team.filter((_, i) => i !== picked)];
            onData({ ...data, team });
            setPicked(0);
          }}>맨 앞으로</button>
        )}
        {data.team.length > 1 && picked === null && <p className="note">오디를 누르고 「맨 앞으로」를 누르면 먼저 싸워요</p>}
        {data.box.length > 0 && <p className="note">박스에 {data.box.length}마리</p>}
        {back}
      </>
    );
  } else if (panel === 'bag') {
    body = (
      <>
        <h2>가방</h2>
        <ul className="gm-bag">
          <li><span>코인</span><b>{data.coins}</b></li>
          <li><span>로프</span><b>{data.ropes.basic}</b></li>
          <li><span>튼튼한 로프</span><b>{data.ropes.sturdy}</b></li>
          <li><span>회복약</span><b>{data.potions}</b></li>
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
        <p className="note">지금까지의 오디, 코인, 도감이 모두 사라지고 되돌릴 수 없어요.</p>
        <button type="button" className="wide gm-danger" onClick={() => { onClose(); actions.onRestart(); }}>네, 처음부터</button>
        {back}
      </>
    );
  } else {
    body = (
      <div className="gm-grid">
        {ITEMS.map((it, i) => (
          <button
            key={it.id} type="button" className="gm-item" style={{ '--i': i } as React.CSSProperties}
            onClick={() => { setPicked(null); if (it.id === 'online') actions.onOnline(); else setPanel(it.id); }}
          >
            <span className="gm-icon" style={{ background: it.color }} aria-hidden>{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="gm" role="dialog" aria-label="메뉴" onPointerDown={(e) => e.stopPropagation()}>
      <SoundToggle className="corner" />
      <div key={panel} className="gm-body">{body}</div>
      <button type="button" className="gm-close" aria-label="닫기" data-nosfx onClick={onClose}>✕</button>
    </div>
  );
}
