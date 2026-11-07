import { expect, test } from 'vitest';
import { chooseAiAction, chooseAiSwitch } from './ai.ts';
import { battle, mon, tackle } from './testkit.ts';
import { resolveTurn } from './turn.ts';

test('상성과 위력이 가장 좋은 기술을 고른다', () => {
  const ember = tackle({ name: '불꽃', type: 'fire', power: 40 });
  const bubble = tackle({ name: '물대포', type: 'water', power: 40 });
  const state = battle([mon({ types: ['fire'] })], [mon({ types: ['ground'], moves: [ember, bubble] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('무효 기술은 고르지 않는다', () => {
  const zap = tackle({ type: 'electric', power: 120 });
  const pound = tackle({ type: 'rock', power: 20 });
  const state = battle([mon({ types: ['ground'] })], [mon({ moves: [zap, pound] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('상대에게 상태이상이 없으면 상태 기술을 첫 수로 쓸 수 있다', () => {
  const spore = tackle({ category: 'status', power: 0, effects: [{ kind: 'status', status: 'sleep', chance: 100 }] });
  const pound = tackle({ type: 'rock', power: 20 });
  const state = battle([mon()], [mon({ moves: [pound, spore] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('이미 상태이상이면 상태 기술을 쓰지 않는다', () => {
  const spore = tackle({ category: 'status', power: 0, effects: [{ kind: 'status', status: 'sleep', chance: 100 }] });
  const pound = tackle({ type: 'rock', power: 20 });
  const state = battle([mon({ status: 'burn' })], [mon({ moves: [pound, spore] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('강제 교체는 살아 있는 첫 오디를 고른다', () => {
  const state = battle([mon()], [mon({ hp: 0 }), mon({ hp: 0 }), mon()]);
  expect(chooseAiSwitch(state, 1)).toBe(2);
});

test('독 타입 상대에게는 독 상태 기술을 쓰지 않는다', () => {
  const powder = tackle({ category: 'status', power: 0, type: 'poison', effects: [{ kind: 'status', status: 'poison', chance: 100 }] });
  const weak = tackle({ type: 'rock', power: 10 });
  const state = battle([mon({ types: ['poison'] })], [mon({ moves: [powder, weak] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('풀/독 둘이 독가루 기술을 가져도 AI 대결이 200턴 안에 끝난다', () => {
  const powder = tackle({ name: '독가루', category: 'status', power: 0, type: 'poison', accuracy: 75, effects: [{ kind: 'status', status: 'poison', chance: 100 }] });
  const vine = tackle({ name: '덩굴채찍', type: 'grass', power: 35 });
  const make = () => mon({ types: ['grass', 'poison'], moves: [powder, vine] });
  let state = battle([make()], [make()], 7);
  for (let i = 0; i < 200 && state.winner === null; i++) {
    state = resolveTurn(state, [chooseAiAction(state, 0), chooseAiAction(state, 1)]).state;
  }
  expect(state.winner).not.toBeNull();
});

test('연타 기술은 타수만큼 센 것으로 본다', () => {
  const single = tackle({ power: 50, type: 'rock' });
  const triple = tackle({ power: 20, type: 'rock', effects: [{ kind: 'multiHit', hits: 3 }] });
  const state = battle([mon()], [mon({ moves: [single, triple] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('연속으로 방어하려 하지 않는다', () => {
  const shield = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'shield' }] });
  const pound = tackle({ type: 'rock', power: 20 });
  const user = mon({ moves: [pound, shield] });
  user.shieldStreak = 1;
  expect(chooseAiAction(battle([mon()], [user]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('능력을 2단계 올리는 기술은 아직 안 올렸을 때만 쓴다', () => {
  const buff = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'stage', target: 'self', stat: 'atk', delta: 2, chance: 100 }] });
  const pound = tackle({ type: 'rock', power: 120 });
  const fresh = mon({ moves: [pound, buff] });
  expect(chooseAiAction(battle([mon()], [fresh]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
  const boosted = mon({ moves: [pound, buff] });
  boosted.stages.atk = 2;
  expect(chooseAiAction(battle([mon()], [boosted]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('충전 중이면 충전한 기술을 고른다', () => {
  const charge = tackle({ power: 100, effects: [{ kind: 'charge' }] });
  const user = mon({ moves: [tackle({ power: 10 }), charge] });
  user.charging = 1;
  expect(chooseAiAction(battle([mon()], [user]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

const rock = (overrides = {}) => tackle({ type: 'rock', ...overrides });

test('선공은 상대 체력이 낮으면 마무리로 높게 친다', () => {
  const quick = rock({ name: '선공', power: 40, priority: 1 });
  const big = rock({ name: '강타', power: 60 });
  expect(chooseAiAction(battle([mon()], [mon({ moves: [quick, big] })]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
  expect(chooseAiAction(battle([mon({ hp: 20 })], [mon({ moves: [quick, big] })]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('급소가 잘 나는 기술을 조금 더 쳐 준다', () => {
  const crit = rock({ power: 50, effects: [{ kind: 'crit' }] });
  const plain = rock({ power: 60 });
  expect(chooseAiAction(battle([mon()], [mon({ moves: [plain, crit] })]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('보복은 내가 느릴 때만 쓴다', () => {
  const revenge = rock({ power: 50, effects: [{ kind: 'revenge' }] });
  const plain = rock({ power: 70 });
  const slow = mon({ moves: [plain, revenge], stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 50 } });
  const fast = mon({ moves: [plain, revenge], stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 150 } });
  expect(chooseAiAction(battle([mon()], [slow]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
  expect(chooseAiAction(battle([mon()], [fast]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('역전은 내 체력이 낮을 때 쓴다', () => {
  const reversal = rock({ power: 60, effects: [{ kind: 'lowHp' }] });
  const plain = rock({ power: 80 });
  expect(chooseAiAction(battle([mon()], [mon({ moves: [plain, reversal] })]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
  expect(chooseAiAction(battle([mon()], [mon({ hp: 20, moves: [plain, reversal] })]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('회복은 체력이 낮을 때만, 방어 태세는 충전하는 상대에게 쓴다', () => {
  const heal = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'heal', ratio: 0.5 }] });
  const shield = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'shield' }] });
  const pound = rock({ power: 80 });
  expect(chooseAiAction(battle([mon()], [mon({ moves: [pound, heal] })]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
  expect(chooseAiAction(battle([mon()], [mon({ hp: 30, moves: [pound, heal] })]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
  const charging = mon({ charging: 0 });
  expect(chooseAiAction(battle([charging], [mon({ moves: [pound, shield] })]), 1)).toEqual({ kind: 'move', moveIndex: 1 });
  expect(chooseAiAction(battle([mon()], [mon({ moves: [pound, shield] })]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('상대에게 타입이 무효인 변화 기술은 고르지 않는다', () => {
  const sleep = tackle({ category: 'status', power: 0, type: 'ghost', effects: [{ kind: 'status', status: 'sleep', chance: 100 }] });
  const pound = rock({ power: 10 });
  expect(chooseAiAction(battle([mon({ types: ['normal'] })], [mon({ moves: [pound, sleep] })]), 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('방어 태세는 상대의 변화 기술도 막는다', () => {
  const shield = tackle({ category: 'status', power: 0, accuracy: 0, priority: 4, effects: [{ kind: 'shield' }] });
  const spore = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'status', status: 'sleep', chance: 100 }] });
  const result = resolveTurn(battle([mon({ moves: [shield] })], [mon({ moves: [spore] })]), [{ kind: 'move', moveIndex: 0 }, { kind: 'move', moveIndex: 0 }]);
  expect(result.events.some((e) => e.t === 'shieldBlock')).toBe(true);
  expect(result.state.sides[0].team[0].status).toBeNull();
});

test('상성 0인 변화 기술은 상태이상을 걸지 못하고 효과 없음이 나온다', () => {
  const spore = tackle({ category: 'status', power: 0, accuracy: 0, type: 'ghost', effects: [{ kind: 'status', status: 'sleep', chance: 100 }] });
  const result = resolveTurn(battle([mon({ types: ['normal'] })], [mon({ moves: [spore] })]), [{ kind: 'pass' }, { kind: 'move', moveIndex: 0 }]);
  expect(result.events.some((e) => e.t === 'noEffect')).toBe(true);
  expect(result.state.sides[0].team[0].status).toBeNull();
});
