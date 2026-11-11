import { useEffect, useRef, useState } from 'react';
import {
  MAX_ENERGY, activeOf, aliveMine, createRealtime, energyCost, powerOf, tick,
  type Fighter, type RtInput, type RtResult, type RtState,
} from '../battle/realtime.ts';
import { createRng } from '../engine/rng.ts';
import type { Status, TypeName } from '../engine/types.ts';
import { REGIONS, type RegionId } from '../overworld/regions.ts';
import { OddieArt, typeColor } from './OddieArt.tsx';
import { jingle, sfx } from '../audio/audio.ts';
import './battle.css';

interface Props {
  kind: 'wild' | 'trainer';
  region: RegionId;
  team: { speciesId: number; level: number }[];
  foes: { speciesId: number; level: number }[];
  trainerName?: string;
  /** 끝나면: 결과, 서 있는 내 오디, 마지막 상대 오디의 상태이상(잡기 확률용) */
  onEnd(result: RtResult, alive: boolean[], foeStatus: Status | null): void;
}

type Pop = { id: number; side: 'me' | 'foe'; text: string; cls: string };
const STATUS_NAMES: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '잠듦' };
const SWIPE_PX = 40;

/** 포켓몬 고식 실시간 전투 화면. 탭=기본 공격, 좌우로 쓸기=피하기, 필살기 버튼 */
export function BattleScreen({ kind, region, team, foes, trainerName, onEnd }: Props) {
  const [state, setState] = useState<RtState>(() => createRealtime(kind, team, foes));
  const [pops, setPops] = useState<Pop[]>([]);
  const [fx, setFx] = useState({ foeHit: 0, meHit: 0, flash: 0, wave: 0, waveColor: '#fff', dodge: 0 });
  const [banner, setBanner] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const input = useRef<RtInput>({});
  const held = useRef(false);
  const paused = useRef(true);
  const pickingRef = useRef(false);
  pickingRef.current = picking;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const gesture = useRef<{ x: number; y: number; dodged: boolean } | null>(null);

  // 시작 문구 1.2초 동안은 멈춰 있다
  useEffect(() => {
    const name = state.foe[0].mon.name;
    setBanner(kind === 'wild' ? `야생 ${name}이(가) 나타났다!` : `${trainerName ?? '트레이너'}이(가) 승부를 걸어왔다!`);
    const t = setTimeout(() => { paused.current = false; setBanner(null); }, 1200);
    return () => clearTimeout(t);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const rng = createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    let raf = 0;
    let last = performance.now();
    let popId = 0;
    let cur = state;
    let ended = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(50, now - last);
      last = now;
      if (paused.current || pickingRef.current || ended) return;
      const inp = { ...input.current, fast: input.current.fast || held.current };
      input.current = {};
      cur = tick(cur, dt, inp, rng);
      if (cur.events.length) {
        const add: Pop[] = [];
        for (const e of cur.events) {
          if (e.t === 'hit') {
            const extra = e.critical ? ' 급소!' : e.effectiveness > 1 ? ' 효과 굉장!' : e.effectiveness > 0 && e.effectiveness < 1 ? ' 별로…' : e.effectiveness === 0 ? ' 효과 없음' : '';
            add.push({ id: popId += 1, side: e.side, text: `-${e.amount}${extra}`, cls: e.dodged ? 'dodged' : e.charged ? 'big' : '' });
            setFx((f) => (e.side === 'foe' ? { ...f, foeHit: f.foeHit + 1 } : { ...f, meHit: f.meHit + 1 }));
            sfx(e.effectiveness > 1 && !e.dodged ? 'super' : 'hit');
          } else if (e.t === 'charged') {
            setFx((f) => ({ ...f, flash: f.flash + 1, wave: f.wave + 1, waveColor: typeColor(e.type as TypeName) }));
            sfx('charge');
            add.push({ id: popId += 1, side: e.side === 'me' ? 'foe' : 'me', text: e.move, cls: 'move' });
          } else if (e.t === 'faint') {
            sfx('faint');
          } else if (e.t === 'dodge') {
            setFx((f) => ({ ...f, dodge: f.dodge + 1 }));
          } else if (e.t === 'status') {
            add.push({ id: popId += 1, side: e.side, text: STATUS_NAMES[e.status], cls: 'move' });
          } else if (e.t === 'stage') {
            add.push({ id: popId += 1, side: e.side, text: e.delta > 0 ? '능력 ↑' : '능력 ↓', cls: 'move' });
          } else if (e.t === 'dot') {
            add.push({ id: popId += 1, side: e.side, text: `-${e.amount}`, cls: 'dot' });
          } else if (e.t === 'heal') {
            add.push({ id: popId += 1, side: e.side, text: `+${e.amount}`, cls: 'heal' });
          } else if (e.t === 'send') {
            setBanner(e.side === 'foe' ? `상대는 ${e.name}을(를) 내보냈다!` : `가랏, ${e.name}!`);
            setTimeout(() => setBanner(null), 1100);
          } else if (e.t === 'end') {
            ended = true;
            const r = e.result;
            if (r === 'won') jingle('victory');
            else if (r === 'fled') sfx('flee');
            setBanner(r === 'won' ? '이겼다!' : r === 'lost' ? '졌다…' : '무사히 도망쳤다!');
            const final = cur;
            setTimeout(() => endRef.current(r, aliveMine(final), activeOf(final, 'foe').mon.status), 1300);
          }
        }
        if (add.length) {
          setPops((p) => [...p, ...add]);
          const ids = new Set(add.map((a) => a.id));
          setTimeout(() => setPops((p) => p.filter((x) => !ids.has(x.id))), 900);
        }
      }
      setState(cur);
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space' || e.code === 'KeyZ') { e.preventDefault(); held.current = true; }
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') { e.preventDefault(); if (!e.repeat) input.current.dodge = true; }
      else if (e.code === 'Digit1' || e.code === 'Digit2') { e.preventDefault(); input.current.charged = e.code === 'Digit1' ? 0 : 1; }
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'KeyZ') held.current = false; };
    const onBlur = () => { held.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
    // 루프는 한 번만 만든다(상태는 루프 안의 cur가 주인)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = activeOf(state, 'me');
  const foe = activeOf(state, 'foe');
  const sky = REGIONS[region];
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const plate = (f: Fighter, mine: boolean) => {
    const ratio = f.mon.hp / f.mon.stats.hp;
    return (
      <div className={`rt-plate ${mine ? 'mine' : 'theirs'}`}>
        <div className="rt-plate-name">
          <b>{f.mon.name}</b> <span>Lv.{f.mon.level}</span>
          {f.mon.status && <span className="rt-status">{STATUS_NAMES[f.mon.status]}</span>}
        </div>
        <div className="rt-hp"><div className={ratio < 0.25 ? 'low' : ''} style={{ width: `${ratio * 100}%` }} /></div>
        <div className="rt-cp">전투력 {powerOf(f.mon)} · {f.mon.hp}/{f.mon.stats.hp}</div>
      </div>
    );
  };

  return (
    <div
      className={`rt${state.telegraph ? ' warn' : ''}`}
      style={{ background: `linear-gradient(${sky.sky} 0%, ${sky.sky} 45%, ${sky.ground} 62%, ${sky.ground} 100%)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        gesture.current = { x: e.clientX, y: e.clientY, dodged: false };
        held.current = true;
      }}
      onPointerMove={(e) => {
        const g = gesture.current;
        if (!g || g.dodged) return;
        const dx = e.clientX - g.x;
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - g.y)) {
          g.dodged = true;
          held.current = false;
          input.current.dodge = true;
        }
      }}
      onPointerUp={() => { gesture.current = null; held.current = false; }}
      onPointerCancel={() => { gesture.current = null; held.current = false; }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="rt-top">
        {plate(me, true)}
        {plate(foe, false)}
      </div>
      <div className="rt-tools" onPointerDown={stop}>
        <button type="button" onClick={() => setPicking(true)} disabled={state.switchCd > 0 || state.me.length < 2}>
          교체{state.switchCd > 0 ? ` ${Math.ceil(state.switchCd / 1000)}` : ''}
        </button>
        {kind === 'wild' && <button type="button" onClick={() => { input.current.run = true; }}>도망</button>}
        {kind === 'trainer' && (
          <span className="rt-left" aria-label="상대 남은 오디">
            {state.foe.map((f, i) => <i key={i} className={f.mon.hp > 0 ? 'on' : ''} />)}
          </span>
        )}
      </div>

      <div className="rt-foe">
        <div className="rt-shadow" />
        {state.telegraph && <div className="rt-bang">!</div>}
        <div key={`fe${state.foeActive}`} className="rt-enter-foe">
          <div key={`f${fx.foeHit}`} className={`rt-sprite${fx.foeHit ? ' hit' : ''}`}>
            <div className={`rt-bob${foe.mon.hp <= 0 ? ' down' : ''}`}>
              <OddieArt key={foe.mon.speciesId + state.foeActive * 1000} speciesId={foe.mon.speciesId} name={foe.mon.name} types={foe.mon.types} size={220} />
            </div>
          </div>
        </div>
        {pops.filter((p) => p.side === 'foe').map((p) => <span key={p.id} className={`rt-pop ${p.cls}`}>{p.text}</span>)}
      </div>

      <div className="rt-me">
        <div className="rt-shadow small" />
        <div key={`me${state.myActive}`} className="rt-enter-me">
          <div key={`d${fx.dodge}`} className={fx.dodge ? 'rt-dodge' : ''}>
            <div key={`m${fx.meHit}`} className={`rt-sprite${fx.meHit ? ' hit' : ''}`}>
              <div className="rt-mirror">
                <OddieArt key={me.mon.speciesId + state.myActive * 1000} speciesId={me.mon.speciesId} name={me.mon.name} types={me.mon.types} size={140} />
              </div>
            </div>
          </div>
        </div>
        {pops.filter((p) => p.side === 'me').map((p) => <span key={p.id} className={`rt-pop ${p.cls}`}>{p.text}</span>)}
      </div>

      {fx.flash > 0 && <div key={`fl${fx.flash}`} className="rt-flash" />}
      {fx.wave > 0 && <div key={`w${fx.wave}`} className="rt-wave" style={{ borderColor: fx.waveColor, boxShadow: `0 0 40px ${fx.waveColor}` }} />}
      {banner && <div key={banner} className="rt-banner">{banner}</div>}

      <div className="rt-bottom" onPointerDown={stop}>
        <div className="rt-charged">
          {me.charged.map((m, i) => {
            const cost = energyCost(m);
            const ready = me.energy >= cost;
            const color = typeColor(m.type);
            return (
              <button
                key={m.id + '-' + i} type="button" className={`rt-chg${ready ? ' ready' : ''}`}
                style={{ '--c': color, '--fill': `${Math.min(1, me.energy / cost) * 100}%` } as React.CSSProperties}
                onClick={() => { input.current.charged = i; }}
                aria-label={`필살기 ${i + 1}: ${m.name}`}
              >
                <span className="rt-chg-name">{m.name}</span>
                <span className="rt-chg-key">{i + 1}</span>
              </button>
            );
          })}
        </div>
        <div className="rt-energy"><div style={{ width: `${(me.energy / MAX_ENERGY) * 100}%` }} /></div>
        <div className="rt-hint">탭: 기본 공격 · 좌우로 쓸기: 피하기 · 키보드 Space / ← → / 1 2</div>
      </div>

      {picking && (
        <div className="rt-pick" onPointerDown={stop}>
          <p>누구로 바꿀까?</p>
          {state.me.map((f, i) => (
            <button
              key={i} type="button" disabled={i === state.myActive || f.mon.hp <= 0}
              onClick={() => { input.current.switchTo = i; setPicking(false); }}
            >
              <OddieArt speciesId={f.mon.speciesId} name={f.mon.name} types={f.mon.types} size={40} />
              {f.mon.name} Lv.{f.mon.level} ({f.mon.hp}/{f.mon.stats.hp})
            </button>
          ))}
          <button type="button" onClick={() => setPicking(false)}>취소</button>
        </div>
      )}
    </div>
  );
}
