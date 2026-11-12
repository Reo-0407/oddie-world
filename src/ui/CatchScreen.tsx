import { useEffect, useRef, useState } from 'react';
import {
  GRADE_LABEL, aimFromHold, aimFromSwipe, resolveThrow, ringColor, ringScale, type Aim, type ThrowOutcome,
} from '../battle/throw.ts';
import { speciesById } from '../data/index.ts';
import type { Status } from '../engine/types.ts';
import { ROPE_NAMES, type RopeKind } from '../game/capture.ts';
import type { Ropes } from '../game/save.ts';
import { REGIONS, type RegionId } from '../overworld/regions.ts';
import { OddieArt } from './OddieArt.tsx';
import { jingle, sfx } from '../audio/audio.ts';
import './battle.css';

interface Props {
  speciesId: number;
  level: number;
  region: RegionId;
  status: Status | null;
  ropes: Ropes;
  /** caught=잡았나, ropes=남은 로프, excellent=Excellent 던지기 수(퀘스트) */
  onEnd(caught: boolean, ropes: Ropes, excellent: number): void;
  shiny?: boolean;
  /** 도감에 아직 없는 종 */
  isNew?: boolean;
  /** 잡으면 몇 연속인가(2부터 보여 준다) */
  combo?: number;
  /** 지금 팀(잡으면 깡충 뛰어 들어가는 모습) */
  team?: { speciesId: number; shiny?: boolean }[];
}

type Phase = 'aim' | 'fly' | 'shake' | 'done';
const SIZE = 220;
const FLY_MS = 650;
const SHAKE_MS = 650;

/** 포켓몬 고식 잡기: 줄어들었다 커지는 원, 아래 로프를 위로 휙 쓸어 던진다(키보드: 스페이스 누르고 떼기) */
export function CatchScreen({ speciesId, level, region, status, ropes: startRopes, onEnd, shiny = false, isNew = false, combo = 1, team = [] }: Props) {
  const species = speciesById(speciesId);
  const [ropes, setRopes] = useState(startRopes);
  const [kind, setKind] = useState<RopeKind>(startRopes.basic > 0 ? 'basic' : 'sturdy');
  const [phase, setPhase] = useState<Phase>('aim');
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [hold, setHold] = useState(0);
  const ringRef = useRef<HTMLDivElement>(null);
  const ropeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const st = useRef({ phase, ropes, kind });
  st.current = { phase, ropes, kind };
  const excellent = useRef(0);
  const [caughtFx, setCaughtFx] = useState(false);
  const endRef = useRef((caught: boolean, left: Ropes) => onEnd(caught, left, excellent.current));
  endRef.current = (caught: boolean, left: Ropes) => onEnd(caught, left, excellent.current);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 원은 requestAnimationFrame으로 직접 크기만 바꾼다(리렌더 없이)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (st.current.phase === 'aim') timeRef.current += Math.max(0, Math.min(50, now - last));
      last = now;
      if (ringRef.current) ringRef.current.style.transform = `translate(-50%, -50%) scale(${ringScale(timeRef.current)})`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const finish = (caught: boolean, left: Ropes, text: string) => {
    setPhase('done');
    setMsg(text);
    if (caught) setCaughtFx(true);
    later(() => endRef.current(caught, left), caught ? 2600 : 1500);
  };

  const throwRope = (aim: Aim) => {
    const s = st.current;
    if (s.phase !== 'aim' || s.ropes[s.kind] <= 0) return;
    const ring = ringScale(timeRef.current);
    const left = { ...s.ropes, [s.kind]: s.ropes[s.kind] - 1 };
    setRopes(left);
    const out: ThrowOutcome = resolveThrow(species.rarity, status, s.kind, aim, ring);
    setPhase('fly');
    setMsg(null);
    sfx('whoosh');

    // 로프가 아래에서 위로 포물선을 그리며 날아간다
    const stage = stageRef.current;
    const rope = ropeRef.current;
    if (rope && stage) {
      const h = stage.clientHeight;
      const rise = h * 0.62 * Math.min(1.6, aim.power);
      const side = Math.max(-1.5, Math.min(1.5, aim.lateral)) * h * 0.62;
      rope.animate([
        { transform: 'translate(-50%, 0) scale(1) rotate(0deg)' },
        { transform: `translate(calc(-50% + ${side * 0.5}px), ${-rise * 1.15}px) scale(0.75) rotate(360deg)`, offset: 0.55 },
        { transform: `translate(calc(-50% + ${side}px), ${-rise}px) scale(0.5) rotate(720deg)` },
      ], { duration: FLY_MS, easing: 'ease-out', fill: 'forwards' });
    }

    const nextOrEnd = (left2: Ropes, text: string) => {
      if (left2.basic + left2.sturdy <= 0) return finish(false, left2, `${text} 로프가 다 떨어졌다…`);
      if (left2[st.current.kind] <= 0) setKind(st.current.kind === 'basic' ? 'sturdy' : 'basic');
      setMsg(text);
      rope?.getAnimations().forEach((a) => a.cancel());
      setPhase('aim');
    };

    later(() => {
      if (out.grade === 'miss') return nextOrEnd(left, '빗나갔다! 로프를 잃었다.');
      if (out.grade === 'excellent') excellent.current += 1;
      sfx('shake');
      setMsg(GRADE_LABEL[out.grade] || null);
      setPhase('shake');
      for (let i = 1; i <= out.shakes; i += 1) later(() => { setShake(i); sfx('shake'); }, SHAKE_MS * (i - 1) + 200);
      later(() => {
        setShake(0);
        if (out.caught) { sfx('ding'); jingle('catch'); return finish(true, left, `잡았다! ${shiny ? '✨' : ''}${species.name}이(가) 동료가 되었다!`); }
        if (out.fled) { sfx('flee'); return finish(false, left, `${species.name}이(가) 도망쳤다…`); }
        nextOrEnd(left, `${species.name}이(가) 로프에서 빠져나왔다!`);
      }, SHAKE_MS * out.shakes + 400);
    }, FLY_MS);
  };

  // 쓸어 던지기: 마지막 약 90ms의 속도를 쓴다
  const trail = useRef<{ x: number; y: number; t: number }[]>([]);
  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    trail.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
  };
  const onMove = (e: React.PointerEvent) => {
    if (!trail.current.length) return;
    trail.current.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (trail.current.length > 20) trail.current.shift();
  };
  const onUp = (e: React.PointerEvent) => {
    const pts = [...trail.current, { x: e.clientX, y: e.clientY, t: e.timeStamp }];
    trail.current = [];
    const end = pts[pts.length - 1];
    const start = pts.find((p) => end.t - p.t <= 90) ?? pts[0];
    const dt = Math.max(1, end.t - start.t);
    const aim = aimFromSwipe((end.x - start.x) / dt, (end.y - start.y) / dt);
    if (aim) throwRope(aim);
  };

  // 키보드: 스페이스를 누르고 있는 시간이 힘
  useEffect(() => {
    let downAt = 0;
    let raf = 0;
    const meter = () => { setHold(performance.now() - downAt); raf = requestAnimationFrame(meter); };
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        if (e.repeat || downAt || st.current.phase !== 'aim') return;
        downAt = performance.now();
        raf = requestAnimationFrame(meter);
      } else if (e.code === 'Escape' && st.current.phase === 'aim') {
        endRef.current(false, st.current.ropes);
      }
    };
    const ku = (e: KeyboardEvent) => {
      if ((e.code !== 'Space' && e.code !== 'KeyZ') || !downAt) return;
      cancelAnimationFrame(raf);
      const ms = performance.now() - downAt;
      downAt = 0;
      setHold(0);
      throwRope(aimFromHold(ms));
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    // throwRope는 st 참조로 최신 값을 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sky = REGIONS[region];
  const wrapped = phase === 'shake' || (phase === 'done' && msg?.startsWith('잡았다'));
  return (
    <div className="rt catch" style={{ background: `linear-gradient(${sky.sky} 0%, ${sky.sky} 45%, ${sky.ground} 62%, ${sky.ground} 100%)` }}>
      <div className="rt-tools">
        <span className="catch-title">{shiny && '✨'}{species.name} Lv.{level}{combo >= 2 && <em className="catch-combo">연속 {combo}!</em>}</span>
        <button type="button" disabled={phase !== 'aim'} onClick={() => endRef.current(false, ropes)}>그만두기</button>
      </div>
      <div className="catch-stage" ref={stageRef}>
        <div className="catch-target">
          <div className="rt-shadow" />
          {!wrapped && (
            <div className={`rt-bob${shiny ? ' shiny' : ''}`}>
              <OddieArt speciesId={speciesId} name={species.name} types={species.types} size={SIZE} />
            </div>
          )}
          {phase === 'aim' && <div className="catch-ring-outer" />}
          {phase === 'aim' && <div ref={ringRef} className="catch-ring" style={{ borderColor: ringColor(species.rarity) }} />}
          {wrapped && <div key={shake} className={`catch-wrapped${shake ? ' shake' : ''}`} />}
        </div>
        {msg && <div className="rt-banner">{msg}</div>}
        {!msg && phase === 'aim' && <div className="catch-note">이겨서 경험치를 받았어요 — 이제 로프로 잡아 봐!</div>}
        {caughtFx && isNew && <div className="catch-new" aria-hidden>새로 등록!</div>}
        {caughtFx && (
          <div className="catch-team" aria-label="팀">
            {team.slice(0, 6).map((o, i) => (
              <span key={i} className={o.shiny ? 'shiny' : ''}><OddieArt speciesId={o.speciesId} name="" types={speciesById(o.speciesId).types} size={36} /></span>
            ))}
            {team.length < 6
              ? <span className={`hop${shiny ? ' shiny' : ''}`}><OddieArt speciesId={speciesId} name={species.name} types={species.types} size={36} /></span>
              : <span className="hop box">박스로</span>}
          </div>
        )}
        <div
          className="catch-pad" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerCancel={() => { trail.current = []; }} onContextMenu={(e) => e.preventDefault()}
        >
          <div ref={ropeRef} className={`catch-rope ${kind}`} style={{ visibility: phase === 'aim' || phase === 'fly' ? 'visible' : 'hidden' }} />
          {hold > 0 && <div className="catch-power"><div style={{ width: `${Math.min(100, (hold / 1400) * 100)}%` }} /></div>}
          <p className="rt-hint">로프를 위로 휙! (키보드: Space 누르고 떼기)</p>
        </div>
      </div>
      <div className="catch-ropes">
        {(['basic', 'sturdy'] as const).map((k) => (
          <button
            key={k} type="button" className={kind === k ? 'on' : ''} disabled={ropes[k] <= 0 || phase !== 'aim'}
            onClick={() => setKind(k)}
          >{ROPE_NAMES[k]} ×{ropes[k]}</button>
        ))}
      </div>
    </div>
  );
}
