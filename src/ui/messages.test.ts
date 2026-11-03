import { expect, test } from 'vitest';
import { eventMessage } from './messages.ts';

test('받침에 맞춰 조사를 고른다', () => {
  expect(eventMessage({ t: 'faint', side: 0, name: '피카츄' })).toBe('피카츄는 쓰러졌다!');
  expect(eventMessage({ t: 'faint', side: 0, name: '꼬부기' })).toBe('꼬부기는 쓰러졌다!');
  expect(eventMessage({ t: 'faint', side: 0, name: '파이리' })).toBe('파이리는 쓰러졌다!');
  expect(eventMessage({ t: 'faint', side: 0, name: '이상해꽃' })).toBe('이상해꽃은 쓰러졌다!');
});

test('기술과 효과 문구', () => {
  expect(eventMessage({ t: 'move', side: 0, name: '피카츄', moveName: '전기쇼크' })).toBe('피카츄의 전기쇼크!');
  expect(eventMessage({ t: 'damage', side: 1, amount: 10, hp: 5, effectiveness: 2, critical: false })).toBe('효과가 굉장했다!');
  expect(eventMessage({ t: 'damage', side: 1, amount: 10, hp: 5, effectiveness: 0.5, critical: true })).toBe('급소에 맞았다! 효과가 별로인 듯하다...');
  expect(eventMessage({ t: 'damage', side: 1, amount: 10, hp: 5, effectiveness: 1, critical: false })).toBeNull();
});

test('승패 문구는 플레이어 기준이다', () => {
  expect(eventMessage({ t: 'win', side: 0 })).toBe('승리했다!');
  expect(eventMessage({ t: 'win', side: 1 })).toBe('패배했다...');
});

test('상대 오디는 상대라고 표시한다', () => {
  expect(eventMessage({ t: 'faint', side: 1, name: '피카츄' })).toBe('상대 피카츄는 쓰러졌다!');
  expect(eventMessage({ t: 'move', side: 1, name: '구구', moveName: '돌풍' })).toBe('상대 구구의 돌풍!');
  expect(eventMessage({ t: 'switch', side: 1, teamIndex: 1, name: '구구', hp: 10 })).toBe('상대 구구 등장!');
  expect(eventMessage({ t: 'switch', side: 0, teamIndex: 1, name: '구구', hp: 10 })).toBe('가랏, 구구!');
});

test('새 이벤트 문구', () => {
  expect(eventMessage({ t: 'stage', side: 0, name: '피포', stat: 'atk', delta: 2 })).toBe('피포의 공격 능력이 크게 올랐다!');
  expect(eventMessage({ t: 'stage', side: 1, name: '피포', stat: 'spe', delta: -1 })).toBe('상대 피포의 속도 능력이 내려갔다!');
  expect(eventMessage({ t: 'charge', side: 0, name: '피포' })).toBe('피포의 기운이 모이고 있다!');
  expect(eventMessage({ t: 'hits', count: 3 })).toBe('3번 맞았다!');
  expect(eventMessage({ t: 'shieldBlock', side: 1, name: '피포' })).toBe('상대 피포의 방어 태세가 공격을 막았다!');
  expect(eventMessage({ t: 'confusionHit', side: 0, name: '피포', amount: 3, hp: 5 })).toBe('피포의 혼란! 스스로를 때렸다!');
  expect(eventMessage({ t: 'cantMove', side: 0, name: '피포', reason: 'flinch' })).toBe('피포는 움찔해서 움직일 수 없다!');
  expect(eventMessage({ t: 'delayedHit', side: 1, name: '피포', moveName: '지연 잔상', amount: 9, hp: 1 })).toBe('상대 피포에게 지연 잔상 공격이 닿았다!');
});
