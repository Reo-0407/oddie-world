import { expect, test } from 'vitest';
import { typeColor } from './OddieArt.tsx';

test('모든 타입에 색이 있다', () => {
  for (const type of ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const) {
    expect(typeColor(type)).toMatch(/^#[0-9a-f]{6}$/);
  }
});
