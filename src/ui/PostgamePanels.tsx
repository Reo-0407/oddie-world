import { useState } from 'react';
import { speciesById } from '../data/index.ts';
import { claimDaily, dailyDue, dailyText, DAILY_REWARDS, localDay } from '../game/daily.ts';
import { RAID_HP, RAID_TEAM } from '../game/postgame.ts';
import type { SaveData } from '../game/save.ts';
import { jingle } from '../audio/audio.ts';
import { OddieArt, typeColor } from './OddieArt.tsx';

const stop = (e: React.PointerEvent) => e.stopPropagation();

/** 매일 보상: 7일 달력. 오늘 칸을 누르거나 「받기」 */
export function DailyPanel({ data, onClaim, onClose }: { data: SaveData; onClaim(next: SaveData): void; onClose(): void }) {
  const [today] = useState(localDay);
  const [got, setGot] = useState<number | null>(null);
  const due = dailyDue(data.daily, today);
  const day = got ?? due ?? data.daily?.streak ?? 1;
  const claim = () => {
    const r = claimDaily(data, today);
    if (!r) return;
    jingle('catch');
    setGot(r.day);
    onClaim(r.save);
  };
  return (
    <div className="gm" role="dialog" aria-label="매일 보상" onPointerDown={stop}>
      <div className="gm-body">
        <h2>매일 보상</h2>
        <p className="note">{got ? `${got}일째 보상을 받았어요! 내일 또 와요.` : due === 1 && data.daily ? '연속이 끊겼어요… 1일째부터 다시!' : `연속 ${day}일째 접속!`}</p>
        <ol className="daily-cal">
          {DAILY_REWARDS.map((r, i) => {
            const n = i + 1;
            const done = n < day || (got !== null && n === got);
            const now = n === day && got === null;
            return (
              <li key={n} className={`${done ? 'done' : ''}${now ? ' now' : ''}${r.shiny ? ' big' : ''}`}>
                <b>{n}일</b>
                <span>{dailyText(r)}</span>
                {done && <i aria-label="받음">✓</i>}
              </li>
            );
          })}
        </ol>
        {got === null && due !== null
          ? <button type="button" className="wide daily-claim" onClick={claim}>받기!</button>
          : <button type="button" className="wide" onClick={onClose}>닫기</button>}
        <p className="gm-credit">하루라도 거르면 1일째부터 다시 시작해요. 7일째엔 그날 하루 반짝이 오디가 세 배!</p>
      </div>
    </div>
  );
}

/** 레이드에 데려갈 오디 고르기(최대 3) */
export function RaidPanel({ data, boss, onStart, onCancel }: {
  data: SaveData; boss: { speciesId: number; level: number };
  onStart(picks: number[], boss: { speciesId: number; level: number }): void; onCancel(): void;
}) {
  // 처음엔 레벨이 높은 셋
  const [picks, setPicks] = useState<number[]>(() =>
    data.team.map((o, i) => ({ i, l: o.level })).sort((a, b) => b.l - a.l).slice(0, RAID_TEAM).map((x) => x.i));
  const sp = speciesById(boss.speciesId);
  const toggle = (i: number) => setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < RAID_TEAM ? [...p, i] : p));
  return (
    <div className="gm" role="dialog" aria-label="레이드" onPointerDown={stop}>
      <div className="gm-body">
        <h2>레이드 보스</h2>
        <div className="raid-boss" style={{ '--tc': typeColor(sp.types[0]) } as React.CSSProperties}>
          <OddieArt speciesId={sp.id} name={sp.name} types={sp.types} size={120} />
          <b>{sp.name} Lv.{boss.level}</b>
          <span>체력 ×{RAID_HP} · 3분 · 자유 교체</span>
        </div>
        <p className="note">함께 싸울 오디를 {RAID_TEAM}마리까지 골라요 ({picks.length}/{RAID_TEAM})</p>
        <div className="gm-team">
          {data.team.map((o, i) => {
            const s = speciesById(o.speciesId);
            const on = picks.includes(i);
            return (
              <button
                key={i} type="button" className={`gm-mon${on ? ' on' : ''}`} aria-pressed={on}
                style={{ background: `linear-gradient(160deg, ${typeColor(s.types[0])}, ${typeColor(s.types[1] ?? s.types[0])})` }}
                onClick={() => toggle(i)}
              >
                {on && <em className="gm-lead">{picks.indexOf(i) + 1}</em>}
                <OddieArt speciesId={o.speciesId} name={s.name} types={s.types} size={48} />
                <b>{s.name}</b><span>Lv.{o.level}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="wide daily-claim" disabled={picks.length === 0} onClick={() => onStart(picks, boss)}>도전 시작!</button>
        <button type="button" className="wide" onClick={onCancel}>다음에</button>
      </div>
    </div>
  );
}
