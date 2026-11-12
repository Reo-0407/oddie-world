import { useEffect, useRef, useState, type RefObject } from 'react';
import { jingle, sfx } from '../audio/audio.ts';
import { BADGE_NAMES, BADGE_ORDER } from '../overworld/encounters.ts';
import { BADGE_COLORS } from './GameMenu.tsx';

export interface DialogControl {
  /** A 버튼: 글자가 나오는 중이면 한 번에 보이고, 다 나왔으면 다음 쪽/선택 확정 */
  press(): void;
  move(dir: 'up' | 'down'): void;
}

interface Props {
  speaker?: string;
  pages: string[];
  /** 마지막 쪽 뒤에 고르게 할 선택지 */
  choices?: string[];
  onDone(choice?: number): void;
  control: RefObject<DialogControl | null>;
}

const CHAR_MS = 22;

/** 화면 아래 대화 상자: 한 글자씩 나오고, A로 넘기고, 마지막에 선택지를 보여 준다 */
export function Dialog({ speaker, pages, choices, onDone, control }: Props) {
  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(0);
  const [pick, setPick] = useState(0);
  const text = pages[page] ?? '';
  const typing = shown < text.length;
  const last = page >= pages.length - 1;
  const showChoices = !typing && last && !!choices?.length;

  // 레벨 업·배지 문구가 나오면 축하 연출
  const badge = BADGE_ORDER.find((b) => text.startsWith(`${BADGE_NAMES[b]}를 받았다`));
  const levelUp = !badge && /레벨이 \d+\(으\)로 올랐다/.test(text);
  const quest = text.startsWith('퀘스트 완료!');
  useEffect(() => {
    if (badge) sfx('badge');
    else if (quest) jingle('quest');
    else if (levelUp) sfx('levelup');
  }, [page, badge, levelUp, quest]);

  useEffect(() => {
    if (!typing) return;
    if (shown % 2 === 0 && text[shown] !== ' ') sfx('blip');
    const id = window.setTimeout(() => setShown((n) => n + 1), CHAR_MS);
    return () => window.clearTimeout(id);
  }, [typing, shown]);

  const live = useRef({ typing, last, showChoices, pick, page, len: text.length });
  live.current = { typing, last, showChoices, pick, page, len: text.length };

  useEffect(() => {
    control.current = {
      press() {
        const s = live.current;
        if (s.typing) setShown(s.len);
        else if (!s.last) { setPage(s.page + 1); setShown(0); }
        else onDone(s.showChoices ? s.pick : undefined);
      },
      move(dir) {
        const n = choices?.length ?? 0;
        if (live.current.showChoices && n > 0) setPick((p) => (p + (dir === 'down' ? 1 : n - 1)) % n);
      },
    };
    return () => { control.current = null; };
  });

  return (
    <div className="dialog" role="dialog" aria-live="polite" onPointerDown={(e) => { e.stopPropagation(); control.current?.press(); }}>
      {quest && <div key={`q${page}`} className="fx-quest" aria-hidden><span>QUEST CLEAR!</span></div>}
      {levelUp && <div key={`lv${page}`} className="fx-levelup" aria-hidden><span>LEVEL UP!</span></div>}
      {badge && (
        <div key={`bd${page}`} className="fx-badge" aria-hidden>
          <span className="fx-badge-icon" style={{ background: BADGE_COLORS[badge] }}>{BADGE_NAMES[badge].slice(0, 2)}</span>
          <b>{BADGE_NAMES[badge]} 획득!</b>
        </div>
      )}
      {speaker && <div className="dialog-name">{speaker}</div>}
      <p className="dialog-text">{text.slice(0, shown)}</p>
      {!typing && !showChoices && <span className="dialog-next">▼</span>}
      {showChoices && (
        <ul className="dialog-choices" onPointerDown={(e) => e.stopPropagation()}>
          {choices!.map((c, i) => (
            <li key={c} className={i === pick ? 'on' : ''} onPointerDown={() => { setPick(i); onDone(i); }}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
