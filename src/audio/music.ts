/** 아주 작은 칩튠 악보: 순수 함수만(테스트 가능). 소리 내는 쪽은 audio.ts */

export type Wave = 'square' | 'triangle' | 'noise';

/**
 * 한 줄 악보. 공백으로 나눈 토큰 하나가 8분음표 한 칸.
 * `C5` 한 칸, `C5*3` 세 칸, `-` 쉼, `-*4` 네 칸 쉼, `x` 노이즈(드럼) 한 번.
 */
export interface Channel { wave: Wave; vol: number; notes: string }
export interface Track { bpm: number; loop: boolean; channels: Channel[] }

export interface NoteEvent { t: number; dur: number; freq: number }

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' → 440, 'C#5', 'Bb3'. 'x'(노이즈)는 0, 못 읽으면 null */
export function noteFreq(name: string): number | null {
  if (name === 'x') return 0;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  const semi = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semi;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 한 칸(8분음표) 길이, 초 */
export const stepSec = (bpm: number) => 60 / bpm / 2;

/** 악보 한 줄을 시간이 매겨진 음 목록으로. length = 한 바퀴 길이(초) */
export function sequence(notes: string, bpm: number): { events: NoteEvent[]; length: number } {
  const step = stepSec(bpm);
  const events: NoteEvent[] = [];
  let at = 0;
  for (const tok of notes.trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [name, mul] = tok.split('*');
    const steps = mul ? Number(mul) : 1;
    const freq = name === '-' ? null : noteFreq(name);
    if (freq !== null) events.push({ t: at * step, dur: steps * step, freq });
    at += steps;
  }
  return { events, length: at * step };
}

/** 트랙 한 바퀴 길이: 가장 긴 채널 */
export const trackLength = (tr: Track) => Math.max(...tr.channels.map((c) => sequence(c.notes, tr.bpm).length));
