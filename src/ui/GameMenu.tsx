import { useState } from 'react';
import { speciesById } from '../data/index.ts';
import type { SaveData } from '../game/save.ts';
import { DexOverlay } from './DexOverlay.tsx';
import { OddieArt } from './OddieArt.tsx';

export interface MenuActions {
  /** 로그인한 아이디. 게스트면 null */
  accountName: string | null;
  onOnline(): void;
  onLogout(): void;
  /** 게스트가 로그인/가입 화면을 연다 */
  onLogin(): void;
  onRestart(): void;
}

type Panel = 'main' | 'dex' | 'team' | 'bag' | 'account' | 'restart';

const ITEMS: { id: Exclude<Panel, 'main'> | 'online'; label: string; icon: string; color: string }[] = [
  { id: 'dex', label: '도감', icon: '▤', color: '#e0523f' },
  { id: 'team', label: '팀', icon: '●', color: '#3f78d8' },
  { id: 'bag', label: '가방', icon: '◆', color: '#e0892f' },
  { id: 'online', label: '친구 대전', icon: '⚔', color: '#8a5ac8' },
  { id: 'account', label: '계정', icon: '☺', color: '#3a9a4a' },
  { id: 'restart', label: '처음부터', icon: '↺', color: '#6b6f78' },
];

/** 포켓몬 고처럼 둥근 버튼으로 된 메뉴 */
export function GameMenu({ data, actions, onClose }: { data: SaveData; actions: MenuActions; onClose(): void }) {
  const [panel, setPanel] = useState<Panel>('main');
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
            return (
              <div key={i} className="gm-mon">
                <OddieArt speciesId={o.speciesId} name={sp.name} types={sp.types} size={56} />
                <b>{sp.name}</b><span>Lv.{o.level}</span>
              </div>
            );
          })}
        </div>
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
        {ITEMS.map((it) => (
          <button
            key={it.id} type="button" className="gm-item"
            onClick={() => (it.id === 'online' ? actions.onOnline() : setPanel(it.id))}
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
      <div className="gm-body">{body}</div>
      <button type="button" className="gm-close" aria-label="닫기" onClick={onClose}>✕</button>
    </div>
  );
}
