import { sequence, trackLength, type NoteEvent, type Wave } from './music.ts';
import { TRACKS, type TrackId } from './tracks.ts';

/**
 * WebAudio로 만드는 칩튠 배경음악과 효과음(소리 파일 없음).
 * 브라우저 자동 재생 규칙 때문에 첫 터치/키 입력 때 AudioContext를 만든다.
 */

const KEY = 'oddie-sound';
const MASTER = 0.16;
const FADE = 0.6;
const AHEAD = 0.25;

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;
let muted = readMuted();
let wanted: TrackId | null = null;
const listeners = new Set<() => void>();

function readMuted() {
  try { return localStorage.getItem(KEY) === 'off'; } catch { return false; }
}

interface Playing {
  id: TrackId;
  gain: GainNode;
  chans: { wave: Wave; vol: number; events: NoteEvent[]; i: number }[];
  start: number;
  length: number;
  loop: boolean;
}
let current: Playing | null = null;

function unlock() {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  syncRunning();
  if (wanted) { const w = wanted; wanted = null; playMusic(w); }
  window.setInterval(pump, 60);
}

/** 꺼져 있거나 탭이 숨겨지면 멈춘다 */
function syncRunning() {
  if (!ctx) return;
  if (muted || document.hidden) void ctx.suspend();
  else void ctx.resume();
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });
  document.addEventListener('visibilitychange', syncRunning);
}

function voice(wave: Wave, freq: number, t: number, dur: number, vol: number, out: AudioNode, endFreq?: number) {
  const c = ctx!;
  const g = c.createGain();
  const peak = Math.max(0.0002, vol);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(peak * 0.6, t + Math.min(dur * 0.5, 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  let src: AudioScheduledSourceNode;
  if (wave === 'noise') {
    const n = c.createBufferSource();
    n.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq || 5000;
    n.connect(f).connect(g);
    src = n;
  } else {
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    o.connect(g);
    src = o;
  }
  src.start(t);
  src.stop(t + dur + 0.02);
  src.onended = () => g.disconnect();
}

/** 앞으로 AHEAD초 안에 울릴 음을 미리 예약한다 */
function pump() {
  const p = current;
  if (!ctx || !p || ctx.state !== 'running') return;
  const until = ctx.currentTime + AHEAD;
  for (const ch of p.chans) {
    for (;;) {
      if (ch.i >= ch.events.length) break;
      const e = ch.events[ch.i];
      const at = p.start + e.t;
      if (at > until) break;
      // 노이즈는 짧게 톡, 음은 칸 길이의 90%
      if (at >= ctx.currentTime - 0.05) voice(ch.wave, e.freq, Math.max(at, ctx.currentTime), ch.wave === 'noise' ? 0.04 : e.dur * 0.9, ch.vol * 0.35, p.gain);
      ch.i += 1;
    }
  }
  if (p.loop && p.chans.every((ch) => ch.i >= ch.events.length) && p.start + p.length < until + 0.01) {
    p.start += p.length;
    for (const ch of p.chans) ch.i = 0;
  }
}

function startTrack(id: TrackId, out: AudioNode, fadeIn: number): Playing {
  const c = ctx!;
  const tr = TRACKS[id];
  const gain = c.createGain();
  gain.gain.setValueAtTime(fadeIn ? 0.0001 : 1, c.currentTime);
  if (fadeIn) gain.gain.exponentialRampToValueAtTime(1, c.currentTime + fadeIn);
  gain.connect(out);
  return {
    id, gain, start: c.currentTime + 0.05, length: trackLength(tr), loop: tr.loop,
    chans: tr.channels.map((ch) => ({ wave: ch.wave, vol: ch.vol, events: sequence(ch.notes, tr.bpm).events, i: 0 })),
  };
}

function fadeOut(g: GainNode, sec: number) {
  const c = ctx!;
  g.gain.cancelScheduledValues(c.currentTime);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + sec);
  window.setTimeout(() => g.disconnect(), sec * 1000 + 600);
}

/** 반복 배경음악을 바꾼다(부드럽게 이어서). null이면 끈다 */
export function playMusic(id: TrackId | null) {
  if (!ctx) { wanted = id; return; }
  if (current?.id === id) return;
  if (current) fadeOut(current.gain, FADE);
  current = id ? startTrack(id, musicBus, FADE) : null;
  pump();
}

/** 한 번만 울리는 짧은 곡. 그동안 배경음악은 작아진다 */
export function jingle(id: TrackId) {
  if (!ctx || ctx.state !== 'running') return;
  const c = ctx;
  const len = trackLength(TRACKS[id]);
  const p = startTrack(id, master, 0);
  const t0 = c.currentTime;
  musicBus.gain.cancelScheduledValues(t0);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t0);
  musicBus.gain.linearRampToValueAtTime(0.05, t0 + 0.1);
  musicBus.gain.setValueAtTime(0.05, t0 + len);
  musicBus.gain.linearRampToValueAtTime(1, t0 + len + 0.8);
  for (const ch of p.chans) for (const e of ch.events) voice(ch.wave, e.freq, p.start + e.t, e.dur * 0.9, ch.vol * 0.4, p.gain);
  window.setTimeout(() => p.gain.disconnect(), (len + 1) * 1000);
}

export type SfxId =
  | 'bump' | 'menuOpen' | 'menuClose' | 'blip' | 'confirm' | 'hit' | 'charge' | 'super' | 'faint'
  | 'whoosh' | 'shake' | 'ding' | 'flee' | 'levelup' | 'badge' | 'shiny' | 'coin';

const lastAt: Partial<Record<SfxId, number>> = {};
const GAP: Partial<Record<SfxId, number>> = { bump: 0.28, blip: 0.045 };

/** 짧은 효과음 */
export function sfx(id: SfxId) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (t - (lastAt[id] ?? -1) < (GAP[id] ?? 0.03)) return;
  lastAt[id] = t;
  const v = (wave: Wave, f: number, at: number, dur: number, vol: number, f2?: number) => voice(wave, f, t + at, dur, vol, master, f2);
  const arp = (notes: number[], step: number, vol: number) => notes.forEach((f, i) => v('square', f, i * step, step * 1.6, vol));
  switch (id) {
    case 'bump': v('square', 110, 0, 0.08, 0.25, 60); break;
    case 'menuOpen': v('square', 660, 0, 0.07, 0.15, 1100); break;
    case 'menuClose': v('square', 1100, 0, 0.07, 0.15, 600); break;
    case 'blip': v('square', 920, 0, 0.025, 0.04); break;
    case 'confirm': v('square', 1320, 0, 0.05, 0.12); v('square', 1760, 0.05, 0.06, 0.12); break;
    case 'hit': v('noise', 1200, 0, 0.09, 0.35); v('square', 240, 0, 0.08, 0.2, 90); break;
    case 'charge': v('square', 200, 0, 0.35, 0.18, 1400); v('noise', 3000, 0.1, 0.25, 0.15); break;
    case 'super': v('noise', 600, 0, 0.22, 0.5); v('square', 520, 0, 0.18, 0.28, 70); v('square', 260, 0.08, 0.2, 0.2, 50); break;
    case 'faint': v('square', 700, 0, 0.6, 0.2, 70); break;
    case 'whoosh': v('noise', 400, 0, 0.3, 0.3); v('triangle', 300, 0, 0.3, 0.2, 900); break;
    case 'shake': v('noise', 6000, 0, 0.03, 0.4); v('square', 1800, 0, 0.025, 0.1); break;
    case 'ding': v('triangle', 1568, 0, 0.5, 0.4); v('triangle', 2093, 0.12, 0.6, 0.35); break;
    case 'flee': [0, 0.08, 0.16].forEach((at) => v('square', 300, at, 0.08, 0.14, 1200)); break;
    case 'levelup': arp([1047, 1319, 1568, 2093], 0.07, 0.16); break;
    case 'badge': arp([784, 1047, 1319, 1568, 2093], 0.09, 0.16); v('triangle', 2093, 0.45, 0.6, 0.3); break;
    // 반짝이: 높은 음이 반짝반짝 내려왔다 올라간다
    case 'shiny': [3136, 2637, 3520, 4186, 3136, 4699].forEach((f, i) => v('triangle', f, i * 0.06, 0.18, 0.22)); v('noise', 9000, 0, 0.4, 0.08); break;
    case 'coin': v('square', 1976, 0, 0.05, 0.1); v('square', 2637, 0.05, 0.12, 0.1); break;
  }
}

export const isMuted = () => muted;
export function setMuted(next: boolean) {
  muted = next;
  try { localStorage.setItem(KEY, next ? 'off' : 'on'); } catch { /* 저장 못 해도 이번 판은 된다 */ }
  syncRunning();
  listeners.forEach((l) => l());
}
export function subscribeMuted(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

