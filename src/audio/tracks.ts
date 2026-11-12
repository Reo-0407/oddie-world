import type { Track } from './music.ts';

/** 모든 반복곡은 4마디(32칸) 한 바퀴. 멜로디=사각파, 베이스=삼각파, 드럼=노이즈 */
const hat = (bar: string) => `${bar} ${bar} ${bar} ${bar}`;

export const TRACKS = {
  title: {
    bpm: 120, loop: true, channels: [
      { wave: 'square', vol: 0.5, notes: 'E5 G5 C6*2 B5 G5 E5*2 | F5 A5 C6*2 B5 A5 G5*2 | E5 G5 C6 E6 D6*2 C6 B5 | A5*2 B5*2 C6*4' },
      { wave: 'triangle', vol: 0.9, notes: 'C3*2 G3*2 C3*2 G3*2 F3*2 C4*2 F3*2 C4*2 A2*2 E3*2 A2*2 E3*2 G2*2 D3*2 G2*2 B2*2' },
      { wave: 'noise', vol: 0.25, notes: hat('x - - - x - - -') },
    ],
  },
  // 초원: 밝고 통통 튀게
  meadow: {
    bpm: 132, loop: true, channels: [
      { wave: 'square', vol: 0.45, notes: 'G4 B4 D5 G5*2 D5 B4 D5 | C5 E5 G5*2 E5 C5 E5*2 | D5 F#5 A5*2 F#5 D5 A4 C5 | B4*2 G4*2 G4*4' },
      { wave: 'triangle', vol: 0.9, notes: 'G2*2 D3*2 G2*2 D3*2 C3*2 G3*2 C3*2 G3*2 D3*2 A3*2 D3*2 F#3*2 G2*2 D3*2 G2*4' },
      { wave: 'noise', vol: 0.2, notes: hat('x - x - x - x -') },
    ],
  },
  // 사막: 이국적인 음계(D 프리지안 도미넌트)
  desert: {
    bpm: 110, loop: true, channels: [
      { wave: 'square', vol: 0.42, notes: 'D5 Eb5 F#5*2 Eb5 D5 C5*2 | Bb4 C5 D5*2 C5 Bb4 A4*2 | D5 Eb5 F#5 G5 A5*2 G5 F#5 | Eb5*2 F#5 Eb5 D5*4' },
      { wave: 'triangle', vol: 0.9, notes: 'D3 - A2 - D3 D3 A2 - D3 - A2 - D3 D3 A2 - G2 - D3 - G2 G2 D3 - A2 - Eb3 - D3*4' },
      { wave: 'noise', vol: 0.22, notes: hat('x - - x - - x -') },
    ],
  },
  // 설원: 느리고 잔잔하게(드럼 없음)
  snow: {
    bpm: 84, loop: true, channels: [
      { wave: 'triangle', vol: 0.8, notes: 'E5*2 A5*2 G5 E5 D5*2 | C5*2 E5*2 D5*4 | E5*2 A5*2 B5 C6 B5*2 | A5*4 E5*4' },
      { wave: 'triangle', vol: 0.7, notes: 'A2*4 E3*4 F2*4 G2*4 A2*4 E3*4 F2*4 E2*4' },
      { wave: 'square', vol: 0.12, notes: 'A4 C5 E5 C5 A4 C5 E5 C5 F4 A4 C5 A4 G4 B4 D5 B4 A4 C5 E5 C5 A4 C5 E5 C5 F4 A4 C5 A4 E4 G#4 B4 G#4' },
    ],
  },
  // 화산: 빠르고 긴장되게
  volcano: {
    bpm: 150, loop: true, channels: [
      { wave: 'square', vol: 0.42, notes: 'E5 E5 G5 E5 F#5 E5 D5 B4 | E5 E5 G5 A5 B5*2 A5 G5 | F#5 F#5 A5 F#5 G5 F#5 E5 D5 | E5*2 B4*2 E5*2 -*2' },
      { wave: 'triangle', vol: 0.9, notes: 'E2 E3 E2 E3 E2 E3 E2 E3 E2 E3 E2 E3 E2 E3 E2 E3 D2 D3 D2 D3 D2 D3 D2 D3 E2 E3 E2 E3 B1 B2 B1 B2' },
      { wave: 'noise', vol: 0.25, notes: hat('x - x - x - x x') },
    ],
  },
  wild: {
    bpm: 168, loop: true, channels: [
      { wave: 'square', vol: 0.42, notes: 'A4 C5 E5 A5 G5 E5 C5 E5 | F4 A4 C5 F5 E5 C5 A4 C5 | G4 B4 D5 G5 F5 D5 B4 D5 | E5 E5 E5 E5 G#5*2 B5*2' },
      { wave: 'triangle', vol: 0.9, notes: 'A2 A3 A2 A3 A2 A3 A2 A3 F2 F3 F2 F3 F2 F3 F2 F3 G2 G3 G2 G3 G2 G3 G2 G3 E2 E3 E2 E3 E2 E3 E2 E3' },
      { wave: 'noise', vol: 0.28, notes: hat('x - x x x - x x') },
    ],
  },
  trainer: {
    bpm: 176, loop: true, channels: [
      { wave: 'square', vol: 0.42, notes: 'D5 - D5 F5 A5 - G5 F5 | E5 - E5 G5 Bb5 - A5 G5 | F5 - F5 A5 D6 - C6 Bb5 | A5*2 C#6*2 E6*2 A5*2' },
      { wave: 'triangle', vol: 0.9, notes: 'D2 D3 D2 D3 D2 D3 D2 D3 C2 C3 C2 C3 C2 C3 C2 C3 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 Bb1 Bb2 A1 A2 A1 A2 A1 A2 A1 A2' },
      { wave: 'noise', vol: 0.28, notes: hat('x - x - x x x -') },
    ],
  },
  champion: {
    bpm: 184, loop: true, channels: [
      { wave: 'square', vol: 0.42, notes: 'E5 B5 E6 B5 D6 B5 A5 B5 | C6 G5 C6 E6 D6*2 B5*2 | A5 E5 A5 C6 B5 G5 E5 G5 | F#5*2 A5*2 D#6*2 B5*2' },
      { wave: 'triangle', vol: 0.9, notes: 'E2 E3 B2 E3 E2 E3 B2 E3 C2 C3 G2 C3 G2 G3 D3 G3 A1 A2 E2 A2 E2 E3 B2 E3 B1 B2 F#2 B2 B1 B2 D#2 B2' },
      { wave: 'noise', vol: 0.3, notes: hat('x x x - x x x -') },
    ],
  },
  // 한 번만 울리는 짧은 곡
  victory: {
    bpm: 150, loop: false, channels: [
      { wave: 'square', vol: 0.5, notes: 'C5 E5 G5 C6*3 A5 B5 C6*6' },
      { wave: 'triangle', vol: 0.9, notes: 'C3*3 G3*3 F3 G3 C3*6' },
    ],
  },
  catch: {
    bpm: 160, loop: false, channels: [
      { wave: 'square', vol: 0.5, notes: 'E5 G5 C6 E6 D6 C6 G6*6' },
      { wave: 'triangle', vol: 0.9, notes: 'C3*3 G3*3 C4*6' },
    ],
  },
  quest: {
    bpm: 170, loop: false, channels: [
      { wave: 'square', vol: 0.5, notes: 'G5 C6 E6 G6*2 E6 G6*5' },
      { wave: 'triangle', vol: 0.9, notes: 'C4*2 E4*2 G3*2 C4*4' },
    ],
  },
  heal: {
    bpm: 140, loop: false, channels: [
      { wave: 'triangle', vol: 0.9, notes: 'C5*2 C5 C5 G4*2 E5*2 D5*2 C5*4' },
      { wave: 'square', vol: 0.2, notes: 'E4*4 G3*2 C4*2 B3*2 C4*4' },
    ],
  },
} satisfies Record<string, Track>;

export type TrackId = keyof typeof TRACKS;
