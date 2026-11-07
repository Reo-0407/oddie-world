import { describe, expect, test } from 'vitest';
import type { Stats } from '../src/engine/types.ts';
import {
  buildLearnset, buildStats, captureRateOf, commonMove, commonMoveId, isSpecialAttacker, parseDesign,
  signatureMove, SHAKE_ID, TACKLE_ID, totalOf,
} from './oddie-design.ts';

const entry = (line: string) => parseDesign(line)[0];

describe('parseDesign', () => {
  test('주석과 빈 줄을 건너뛰고 열을 해석한다', () => {
    const [mooli, dune] = parseDesign('# 주석\n\n002|Mooli|gra|-|wal|이끼 정원|drn+dn_spe\n023|Dunecrown|gro|nor|bru|혹 속 물대포|dn_def|wat');
    expect(mooli).toEqual({
      num: 2, name: 'Mooli', types: ['grass'], role: 'wal', sig: '이끼 정원',
      status: false, traits: ['drn', 'dn_spe'], sigType: undefined,
    });
    expect(dune.types).toEqual(['ground', 'normal']);
    expect(dune.sigType).toBe('water');
  });

  test('!는 변화 기술이다', () => {
    expect(entry('004|Fluffo|nor|gra|sup|솜 베개|!slp')).toMatchObject({ status: true, traits: ['slp'] });
  });

  test('알 수 없는 코드는 오류', () => {
    expect(() => parseDesign('001|A|xxx|-|bal|가|n')).toThrow();
    expect(() => parseDesign('001|A|gra|-|zzz|가|n')).toThrow();
  });
});

describe('능력치', () => {
  test('총합과 역할 모양', () => {
    expect(buildStats('bal', 312)).toEqual({ hp: 52, atk: 52, def: 52, spa: 52, spd: 52, spe: 52 });
    expect(buildStats('wal', 310)).toEqual({ hp: 67, atk: 31, def: 52, spa: 47, spd: 78, spe: 36 });
    const sum = (s: Stats) => Object.values(s).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum(buildStats('can', 640)) - 640)).toBeLessThanOrEqual(3);
  });

  test('등급별 총합과 예외', () => {
    expect(totalOf(1, 'Common')).toBe(310);
    expect(totalOf(11, 'Secret')).toBe(600);
    expect(totalOf(160, 'Epic')).toBe(540);
    expect(totalOf(165, 'Epic')).toBe(600);
  });

  test('물리와 특수', () => {
    expect(isSpecialAttacker('can', 'grass')).toBe(true);
    expect(isSpecialAttacker('bru', 'fire')).toBe(false);
    expect(isSpecialAttacker('bal', 'fire')).toBe(true);
    expect(isSpecialAttacker('bal', 'grass')).toBe(false);
  });

  test('포획률', () => {
    expect(captureRateOf('Common')).toBe(190);
    expect(captureRateOf('???')).toBe(3);
  });
});

describe('공용 기술', () => {
  test('단계별 위력과 명중', () => {
    expect(commonMove('water', 1, false)).toMatchObject({ name: '물방울', power: 40, accuracy: 100, category: 'physical' });
    expect(commonMove('water', 4, true)).toMatchObject({ name: '해일', power: 105, accuracy: 90, category: 'special' });
  });

  test('1단계의 부가 효과와 기습의 선공', () => {
    expect(commonMove('fire', 1, true).effects).toEqual([{ kind: 'status', status: 'burn', chance: 10 }]);
    expect(commonMove('electric', 1, true).effects).toEqual([{ kind: 'status', status: 'paralysis', chance: 10 }]);
    expect(commonMove('poison', 1, true).effects).toEqual([{ kind: 'status', status: 'poison', chance: 30 }]);
    expect(commonMove('dark', 2, false)).toMatchObject({ name: '기습', priority: 1 });
  });

  test('id는 겹치지 않는다', () => {
    const ids = new Set<number>();
    for (const type of ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const) {
      for (const tier of [1, 2, 3, 4]) for (const special of [false, true]) ids.add(commonMoveId(type, tier, special));
    }
    expect(ids.size).toBe(18 * 4 * 2);
    expect(ids.has(TACKLE_ID)).toBe(true);
  });
});

describe('고유 기술', () => {
  test('흡수와 단계 하락, 위력 보정', () => {
    const move = signatureMove(entry('002|Mooli|gra|-|wal|이끼 정원|drn+dn_spe'), 'Common');
    expect(move).toMatchObject({ id: 1002, name: '이끼 정원', type: 'grass', category: 'special', power: 55, accuracy: 100 });
    expect(move.effects).toEqual([
      { kind: 'drain', ratio: 0.5 },
      { kind: 'stage', target: 'foe', stat: 'spe', delta: -1, chance: 50 },
    ]);
  });

  test('선공, 연타, 충전, 도박', () => {
    expect(signatureMove(entry('005|Spriggy|gra|-|spd|새싹 도약|pri'), 'Rare')).toMatchObject({ priority: 1, power: 55, category: 'physical' });
    const triple = signatureMove(entry('016|Tumblee|gro|nor|spd|회전초 구르기|hit3'), 'Common');
    expect(triple).toMatchObject({ power: 20 }); // 0.33 보정
    expect(triple.effects).toEqual([{ kind: 'multiHit', hits: 3 }]);
    const charge = signatureMove(entry('010|Sunhorn|gra|fir|can|태양 뿔 광선|cha+brn'), 'Legendary');
    expect(charge.power).toBe(210); // 보정 2.0
    expect(charge.accuracy).toBe(90);
    expect(charge.effects).toEqual([{ kind: 'charge' }, { kind: 'status', status: 'burn', chance: 30 }]);
    const gamble = signatureMove(entry('095|404DDIE|ele|ste|bal|페이지 없음|gam'), 'Epic');
    expect(gamble.power).toBe(90);
    expect(gamble.effects).toEqual([{ kind: 'gamble', min: 0.4, max: 1.6 }]);
  });

  test('변화 기술', () => {
    const sleep = signatureMove(entry('004|Fluffo|nor|gra|sup|솜 베개|!slp'), 'Common');
    expect(sleep).toMatchObject({ category: 'status', power: 0, accuracy: 75 });
    expect(sleep.effects).toEqual([{ kind: 'status', status: 'sleep', chance: 100 }]);
    expect(signatureMove(entry('006|Moomoo|nor|gra|tnk|종소리 되새김|!heal'), 'Rare')).toMatchObject({ accuracy: 0, effects: [{ kind: 'heal', ratio: 0.5 }] });
    expect(signatureMove(entry('014|Cacto|gra|gro|tnk|가시 껴안기|!shield'), 'Common').effects).toEqual([{ kind: 'shield' }]);
    expect(signatureMove(entry('069|THE OVERGROWTH|gra|gro|tnk|모든 것을 덮는 성장|!up2_def'), 'Secret').effects)
      .toEqual([
        { kind: 'stage', target: 'self', stat: 'def', delta: 2, chance: 100 },
        { kind: 'stage', target: 'self', stat: 'spd', delta: 1, chance: 100 },
      ]);
    expect(signatureMove(entry('027|Chillo|ice|wat|wal|서리 잔 쏟기|!dn2_atk'), 'Common').effects)
      .toEqual([{ kind: 'stage', target: 'foe', stat: 'atk', delta: -2, chance: 100 }]);
  });

  test('무리는 카테고리에 맞는 능력을 깎는다', () => {
    const special = signatureMove(entry('046|Lavump|fir|-|can|용암 국자 퍼붓기|ovr'), 'Rare');
    expect(special.effects).toEqual([{ kind: 'stage', target: 'self', stat: 'spa', delta: -1, chance: 100 }]);
    const physical = signatureMove(entry('079|Gumzilla|fai|ste|bru|껌 탱크 포격|ovr'), 'Epic');
    expect(physical.effects).toEqual([{ kind: 'stage', target: 'self', stat: 'atk', delta: -1, chance: 100 }]);
  });

  test('비례 피해', () => {
    const move = signatureMove(entry('094|Nullhorn|dar|psy|can|빈 뿔 광선|pct'), 'Rare');
    expect(move.effects).toEqual([{ kind: 'percent', ratio: 0.4 }]);
    expect(move.accuracy).toBe(90);
  });
});

describe('기술 번호 고정', () => {
  test('타입 순서가 바뀌어도 번호가 변하지 않는다', () => {
    expect(commonMoveId('normal', 1, false)).toBe(101);
    expect(commonMoveId('fire', 1, false)).toBe(111);
    expect(commonMoveId('fairy', 4, true)).toBe(278);
  });
});

describe('습득 목록 중복 박치기', () => {
  const names = (line: string, rarity: 'Common' | 'Epic' = 'Common') => {
    const list = buildLearnset(entry(line), rarity);
    return list.map((e) => e.moveId);
  };

  test('둘째 타입이 일반인 특수형도 박치기가 하나뿐이다', () => {
    const ids = names('074|Marshmello|fai|nor|sup|솜사탕 폭탄|!slp');
    expect(ids.filter((id) => id === commonMoveId('normal', 1, false) || id === commonMoveId('normal', 1, true))).toHaveLength(1);
    expect(ids).toContain(commonMoveId('normal', 2, true));
  });

  test('물리형이 둘째 타입 일반이어도 박치기는 하나', () => {
    const ids = names('023|Dunecrown|gro|nor|bru|혹 속 물대포|dn_def');
    expect(ids.filter((id) => id === TACKLE_ID)).toHaveLength(1);
  });
});

describe('습득 목록', () => {
  const pippo = buildLearnset(entry('001|Pippo|gra|-|bal|솜털 터뜨리기|dn_spe'), 'Common');

  test('레벨 5에는 기술이 2개 이상이다', () => {
    expect(pippo.filter((e) => e.level <= 5)).toHaveLength(2);
  });

  test('박치기, 첫 타입 1단계, 고유 기술 순으로 늘어난다', () => {
    expect(pippo.map((e) => e.level)).toEqual([1, 1, 6, 12, 26, 42]);
    expect(pippo[0].moveId).toBe(TACKLE_ID);
    expect(pippo[1].moveId).toBe(commonMoveId('grass', 1, false));
    expect(pippo.find((e) => e.level === 6)?.moveId).toBe(1001);
  });

  test('일반 타입은 마구 흔들기를 대신 배운다', () => {
    const list = buildLearnset(entry('004|Fluffo|nor|gra|sup|솜 베개|!slp'), 'Common');
    expect(list.filter((e) => e.level === 1).map((e) => e.moveId).sort()).toEqual([SHAKE_ID, TACKLE_ID].sort());
  });

  test('둘째 타입은 8, 20, 34레벨에 1~3단계를 배운다', () => {
    const list = buildLearnset(entry('003|Bumbo|gra|gro|tnk|그루터기 박치기|flin'), 'Common');
    expect(list.filter((e) => [8, 20, 34].includes(e.level)).map((e) => e.moveId)).toEqual([
      commonMoveId('ground', 1, false), commonMoveId('ground', 2, false), commonMoveId('ground', 3, false),
    ]);
  });

  test('겹치는 기술은 한 번만, 레벨순이다', () => {
    const list = buildLearnset(entry('150|Peanutty|nor|-|bal|포장 땅콩 튕기기|hit3'), 'Epic');
    const ids = list.map((e) => e.moveId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(list.map((e) => e.level)).toEqual([...list.map((e) => e.level)].sort((a, b) => a - b));
  });
});

describe('설계표 형식 검사', () => {
  test('열이 빠진 줄은 어느 줄인지 알려 주는 오류를 낸다', () => {
    expect(() => parseDesign('001|Pippo|gra|-|bal')).toThrow(/열이 모자람.*001\|Pippo/);
  });
});
