import { describe, expect, it } from 'vitest';
import { noteFreq, sequence, stepSec, trackLength } from './music.ts';
import { TRACKS } from './tracks.ts';

describe('noteFreq', () => {
  it('reads note names', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteFreq('C#5')).toBeCloseTo(554.37, 1);
    expect(noteFreq('Bb3')).toBeCloseTo(233.08, 1);
    expect(noteFreq('x')).toBe(0);
    expect(noteFreq('H2')).toBeNull();
  });
});

describe('sequence', () => {
  it('times notes, lengths and rests', () => {
    const s = stepSec(120); // 0.25s
    const { events, length } = sequence('C5 E5*2 - G5 | -*3', 120);
    expect(events.map((e) => e.t)).toEqual([0, s, 4 * s]);
    expect(events[1].dur).toBeCloseTo(2 * s);
    expect(length).toBeCloseTo(8 * s);
  });

  it('every track parses and loops line up', () => {
    for (const [id, tr] of Object.entries(TRACKS)) {
      for (const ch of tr.channels) {
        for (const tok of ch.notes.split(/\s+/)) {
          const name = tok.split('*')[0];
          if (name !== '-' && name !== '|') expect(noteFreq(name), `${id} ${tok}`).not.toBeNull();
        }
        if (tr.loop) expect(sequence(ch.notes, tr.bpm).length, id).toBeCloseTo(trackLength(tr));
      }
    }
  });
});
