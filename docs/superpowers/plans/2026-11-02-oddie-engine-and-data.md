# 오디 엔진 확장과 데이터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배틀 엔진에 오디 고유 기술의 특수 효과 38종을 넣고, 포켓몬 데이터를 오디 165종 데이터로 바꿔 앱이 오디로 전투를 끝까지 하게 만든다.

**Architecture:** `src/engine`은 순수 TypeScript로 유지하고, 새 상태(능력 단계, 혼란, 충전, 지연 공격 등)를 전투 상태 안에 넣어 JSON으로 직렬화해도 잃는 것이 없게 한다. 오디 데이터는 `design/oddies.psv`와 `design/oddies.meta.json`에서 `scripts/build-oddies.ts`가 만든 JSON이다.

**Tech Stack:** React, TypeScript, Vitest, tsx

**Spec:** `docs/superpowers/specs/2026-11-02-oddie-world-design.md`, `docs/superpowers/specs/2026-11-02-oddie-battle-design.md`

**이전 계획과의 관계:** `2026-11-02-phase2-growth.md`는 포켓몬 데이터 기준이라 사용하지 않는다. 그 안의 성장, 포획, 저장 규칙은 이 계획이 끝난 뒤 오디 기준으로 다시 쓴다.

## Global Constraints

- `src/engine`은 화면, 네트워크, JSON 데이터에 의존하지 않고, 내부 import에 `.ts`를 붙인다. `Math.random`과 `Date`를 쓰지 않는다.
- 같은 시드와 같은 행동이면 결과가 항상 같아야 한다. 전투 상태(`BattleState`)는 JSON으로 바꿨다가 되돌려도 같은 결과를 내야 한다.
- 게임 실행 중에는 외부 사이트를 호출하지 않는다.
- 화면 문구는 한글. 375px에서 가로 스크롤이 없어야 한다.
- 오디 효과 이름, 위력 보정, 확률은 `2026-11-02-oddie-battle-design.md`의 「특수 효과」 표와 같아야 한다.
- 포켓몬의 이름과 이미지, PokeAPI 데이터는 이 계획이 끝나면 저장소에 남지 않는다.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/engine/types.ts` | 전투 타입 (효과, 새 상태, 새 이벤트) |
| `src/engine/fighter.ts` | 전투 중 임시 상태의 기본값과 초기화 |
| `src/engine/stages.ts` | 능력 단계 계산 |
| `src/engine/damage.ts` | 데미지와 혼란 자해 계산 |
| `src/engine/turn.ts` | 턴 처리 |
| `src/engine/ai.ts` | NPC 행동 선택 |
| `scripts/oddie-design.ts` | 설계표를 해석해 능력치, 기술, 습득 목록을 만든다 |
| `scripts/build-oddies.ts` | 설계표에서 `species.json`, `moves.json`을 만든다 |
| `src/ui/OddieArt.tsx` | 3D 모델이 오기 전의 임시 그림 |

---

### Task 1: 엔진 모델 확장

기능은 바꾸지 않고 새 필드와 기술의 `effects` 배열만 도입한다. 이 작업이 끝나면 기존 테스트가 모두 통과해야 한다.

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/testkit.ts`, `src/engine/ai.ts`, `src/engine/turn.ts`, `src/game/factory.ts`, `src/game/factory.test.ts`, `src/engine/turn.test.ts`, `src/engine/ai.test.ts`, `scripts/convert.ts`, `scripts/convert.test.ts`
- Create: `src/engine/fighter.ts`, `src/engine/stages.ts`

**Interfaces:**
- Produces: `StatKey`, `Stages`, `MoveEffect`(21종), `Move.effects`, `BattlePokemon`의 새 필드, `BattleState.delayed`와 `pivoting`, `DelayedHit`, `Action`의 `pass`, 새 `BattleEvent`, `freshVolatile()`, `resetVolatile(pokemon)`, `stageMultiplier`, `staged`, `changeStage`, `MAX_STAGE`

- [ ] **Step 1: `src/engine/types.ts`를 다음으로 바꾼다**

```ts
export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type Status = 'poison' | 'burn' | 'paralysis' | 'sleep';

export type StatKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type Stages = Record<StatKey, number>;

export type MoveEffect =
  | { kind: 'status'; status: Status; chance: number }
  | { kind: 'confuse'; chance: number }
  | { kind: 'drain'; ratio: number }
  | { kind: 'heal'; ratio: number }
  | { kind: 'recoil'; ratio: number }
  | { kind: 'crit' }
  | { kind: 'multiHit'; hits: number }
  | { kind: 'flinch'; chance: number }
  | { kind: 'stage'; target: 'self' | 'foe'; stat: StatKey; delta: number; chance: number }
  | { kind: 'lowHp' }
  | { kind: 'revenge' }
  | { kind: 'punish' }
  | { kind: 'percent'; ratio: number }
  | { kind: 'gamble'; min: number; max: number }
  | { kind: 'delayed' }
  | { kind: 'charge' }
  | { kind: 'pivot' }
  | { kind: 'trap'; turns: number }
  | { kind: 'shield' }
  | { kind: 'cleanse'; healRatio: number };

export interface Move {
  id: number;
  name: string;
  type: TypeName;
  category: 'physical' | 'special' | 'status';
  power: number;
  /** 0이면 반드시 명중 */
  accuracy: number;
  priority: number;
  effects: MoveEffect[];
}

export interface Stats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

export interface BattlePokemon {
  speciesId: number;
  name: string;
  level: number;
  types: TypeName[];
  stats: Stats;
  hp: number;
  status: Status | null;
  sleepTurns: number;
  moves: Move[];
  /** 아래는 전투 중에만 있는 임시 상태다. 교체하면 초기화된다 */
  stages: Stages;
  /** 남은 혼란 횟수. 0이면 혼란이 아니다 */
  confusion: number;
  flinched: boolean;
  shielded: boolean;
  shieldStreak: number;
  /** 충전 중인 기술의 번호 */
  charging: number | null;
  /** 교체할 수 없는 남은 턴 */
  trapped: number;
  hitThisTurn: boolean;
}

export interface Side {
  team: BattlePokemon[];
  active: number;
}

export type SideIndex = 0 | 1;

export interface DelayedHit {
  targetSide: SideIndex;
  amount: number;
  userName: string;
  moveName: string;
  turnsLeft: number;
}

export interface BattleState {
  sides: [Side, Side];
  turn: number;
  winner: SideIndex | null;
  rngState: number;
  pendingSwitch: [boolean, boolean];
  delayed: DelayedHit[];
  /** 교대 공격을 쓴 쪽. 턴이 끝나면 교체를 고른다 */
  pivoting: [boolean, boolean];
}

export type Action =
  | { kind: 'move'; moveIndex: number }
  | { kind: 'switch'; teamIndex: number }
  | { kind: 'pass' };

export type BattleEvent =
  | { t: 'switch'; side: SideIndex; teamIndex: number; name: string; hp: number }
  | { t: 'move'; side: SideIndex; name: string; moveName: string }
  | { t: 'miss'; side: SideIndex }
  | { t: 'noEffect'; side: SideIndex }
  | { t: 'damage'; side: SideIndex; amount: number; hp: number; effectiveness: number; critical: boolean }
  | { t: 'hits'; count: number }
  | { t: 'heal'; side: SideIndex; name: string; amount: number; hp: number }
  | { t: 'cure'; side: SideIndex; name: string }
  | { t: 'status'; side: SideIndex; name: string; status: Status }
  | { t: 'statusDamage'; side: SideIndex; name: string; status: Status; amount: number; hp: number }
  | { t: 'cantMove'; side: SideIndex; name: string; reason: 'sleep' | 'paralysis' | 'flinch' }
  | { t: 'wake'; side: SideIndex; name: string }
  | { t: 'stage'; side: SideIndex; name: string; stat: StatKey; delta: number }
  | { t: 'confused'; side: SideIndex; name: string }
  | { t: 'confusionHit'; side: SideIndex; name: string; amount: number; hp: number }
  | { t: 'confusionEnd'; side: SideIndex; name: string }
  | { t: 'recoil'; side: SideIndex; name: string; amount: number; hp: number }
  | { t: 'charge'; side: SideIndex; name: string }
  | { t: 'delayedSet'; side: SideIndex; name: string; moveName: string }
  | { t: 'delayedHit'; side: SideIndex; name: string; moveName: string; amount: number; hp: number }
  | { t: 'trap'; side: SideIndex; name: string }
  | { t: 'shield'; side: SideIndex; name: string }
  | { t: 'shieldBlock'; side: SideIndex; name: string }
  | { t: 'pivot'; side: SideIndex; name: string }
  | { t: 'faint'; side: SideIndex; name: string }
  | { t: 'win'; side: SideIndex };

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
}
```

- [ ] **Step 2: 새 파일 두 개를 만든다**

`src/engine/stages.ts`:

```ts
import type { StatKey, Stages } from './types.ts';

export const MAX_STAGE = 6;

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function staged(value: number, stage: number): number {
  return Math.max(1, Math.floor(value * stageMultiplier(stage)));
}

/** 단계를 바꾸고 실제로 바뀐 만큼을 돌려준다. 한계에 막히면 0이다 */
export function changeStage(stages: Stages, stat: StatKey, delta: number): number {
  const next = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, stages[stat] + delta));
  const applied = next - stages[stat];
  stages[stat] = next;
  return applied;
}
```

`src/engine/fighter.ts`:

```ts
import type { BattlePokemon } from './types.ts';

export type Volatile = Pick<
  BattlePokemon,
  'stages' | 'confusion' | 'flinched' | 'shielded' | 'shieldStreak' | 'charging' | 'trapped' | 'hitThisTurn'
>;

export function freshVolatile(): Volatile {
  return {
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    confusion: 0,
    flinched: false,
    shielded: false,
    shieldStreak: 0,
    charging: null,
    trapped: 0,
    hitThisTurn: false,
  };
}

export function resetVolatile(pokemon: BattlePokemon): void {
  Object.assign(pokemon, freshVolatile());
}
```

- [ ] **Step 3: `testkit.ts`, `factory.ts`를 고친다**

`src/engine/testkit.ts`의 `tackle`에서 `effect: { kind: 'none' },`를 `effects: [],`로 바꾼다. `mon`의 반환 객체 끝에 `...freshVolatile(),`를 `...overrides` 앞에 넣는다(`import { freshVolatile } from './fighter.ts';` 추가). `battle`의 반환 객체에 `delayed: [], pivoting: [false, false],`를 추가한다.

`src/game/factory.ts`의 `createBattlePokemon` 반환 객체에서 `moves` 줄 뒤에 `...freshVolatile(),`를 추가하고 import한다. `createBattle`의 반환 객체에도 `delayed: [], pivoting: [false, false],`를 추가한다. `src/game/factory.test.ts`의 `tackle({ id: 1 })` 같은 호출은 바꾸지 않는다.

- [ ] **Step 4: 기존 코드를 새 `effects` 모양으로 맞춘다 (동작은 그대로)**

`src/engine/turn.ts`의 `executeMove`에서 `const { effect } = move;`로 시작하는 상태 기술 분기를 다음으로 바꾼다.

```ts
  if (move.category === 'status') {
    let worked = false;
    for (const effect of move.effects) {
      if (effect.kind === 'heal') worked = heal(attacker, side, Math.floor(attacker.stats.hp * effect.ratio), events) || worked;
      if (effect.kind === 'status') worked = applyStatus(defender, targetSide, effect.status, rng, events) || worked;
    }
    if (!worked && move.effects.length > 0) events.push({ t: 'noEffect', side });
    return;
  }
```

같은 함수 끝의 두 줄(`if (move.effect.kind === 'drain') ...`와 `if (move.effect.kind === 'status' && ...) {...}`)을 다음으로 바꾼다.

```ts
  for (const effect of move.effects) {
    if (effect.kind === 'drain') heal(attacker, side, Math.floor(dealt * effect.ratio), events);
    if (effect.kind === 'status' && rng.int(1, 100) <= effect.chance) {
      applyStatus(defender, targetSide, effect.status, rng, events);
    }
  }
```

`src/engine/ai.ts`의 `scoreMove`를 다음으로 바꾼다.

```ts
function scoreMove(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  if (move.category === 'status') {
    const status = move.effects.find((e) => e.kind === 'status');
    if (status?.kind === 'status') {
      return defender.status === null && !isStatusImmune(defender.types, status.status) ? STATUS_MOVE_SCORE : 0;
    }
    if (move.effects.some((e) => e.kind === 'heal')) return attacker.hp * 2 < attacker.stats.hp ? STATUS_MOVE_SCORE : 0;
    return 0;
  }
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const accuracy = move.accuracy === 0 ? 1 : move.accuracy / 100;
  return move.power * stab * accuracy * typeEffectiveness(move.type, defender.types);
}
```

`turn.test.ts`와 `ai.test.ts`에서 `effect: { ... }`를 `effects: [{ ... }]`로 모두 바꾼다(독 기술, 수면 기술, 회복 기술, 흡수 기술). `scripts/convert.ts`의 `toMove`가 돌려주는 객체의 `effect,`를 `effects: effect.kind === 'none' ? [] : [effect],`로 바꾸고, 안에서 쓰는 `MoveEffect` 타입에 `{ kind: 'none' }`이 남아 있다면 `moveEffect`의 반환 타입을 `MoveEffect | { kind: 'none' } | null`로 고친다. `scripts/convert.test.ts`에서 `effect: { kind: 'none' }`는 `effects: []`로, `?.effect).toEqual({ kind: 'status', ... })` 같은 단언은 `?.effects).toEqual([{ kind: 'status', ... }])`로, `{ kind: 'none' }` 단언은 `[]`로 바꾼다.

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit`, `npm test` / Expected: 오류 없음, 기존 54개 테스트 모두 통과

`npm run build`도 통과해야 한다. 앱은 아직 옛 포켓몬 데이터의 `effect` 모양을 읽으므로 화면에서 전투를 하면 오류가 나는 것이 정상이다. 이 작업과 Task 7 사이에는 배포하지 않는다.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: 엔진 모델 확장 (effects 배열, 전투 임시 상태)"
```

---

### Task 2: 능력 단계와 위력 보정

**Files:**
- Modify: `src/engine/damage.ts`, `src/engine/turn.ts`
- Test: `src/engine/stages.test.ts`, `src/engine/modifiers.test.ts`

**Interfaces:**
- Consumes: Task 1 전체
- Produces: `computeDamage(attacker, defender, move, rng, options?: DamageOptions)`, `DamageOptions = { power?: number; criticalChance?: number }`, `HIGH_CRITICAL_CHANCE`, `confusionDamage(pokemon)`, `effectOf(move, kind)`, `movePower(move, attacker, defender, rng)`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/stages.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { computeDamage } from './damage.ts';
import type { Rng } from './rng.ts';
import { changeStage, stageMultiplier } from './stages.ts';
import { battle, mon, tackle } from './testkit.ts';
import { resolveTurn } from './turn.ts';
import type { Action } from './types.ts';

const noCrit: Rng = { next: () => 0, int: (_min, max) => max, chance: () => false, state: 0 };
const useMove: Action = { kind: 'move', moveIndex: 0 };
const hit = tackle({ power: 80 });

describe('능력 단계', () => {
  test('배수', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(2)).toBe(2);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-2)).toBe(0.5);
  });

  test('changeStage는 한계에서 멈추고 실제 변화량을 돌려준다', () => {
    const stages = { atk: 5, def: -6, spa: 0, spd: 0, spe: 0 };
    expect(changeStage(stages, 'atk', 2)).toBe(1);
    expect(stages.atk).toBe(6);
    expect(changeStage(stages, 'def', -1)).toBe(0);
    expect(changeStage(stages, 'spa', -2)).toBe(-2);
  });
});

describe('데미지에 반영', () => {
  const ground = { types: ['ground' as const] };

  test('공격 +2단계', () => {
    const attacker = mon({ ...ground });
    attacker.stages.atk = 2;
    expect(computeDamage(attacker, mon({ ...ground }), hit, noCrit).damage).toBe(72);
  });

  test('방어 +2단계', () => {
    const defender = mon({ ...ground });
    defender.stages.def = 2;
    expect(computeDamage(mon({ ...ground }), defender, hit, noCrit).damage).toBe(19);
  });
});

describe('기술 효과로 단계가 바뀐다', () => {
  const buff = tackle({ effects: [{ kind: 'stage', target: 'self', stat: 'atk', delta: 1, chance: 100 }] });
  const debuff = tackle({ effects: [{ kind: 'stage', target: 'foe', stat: 'def', delta: -1, chance: 100 }] });

  test('자신 +1', () => {
    const state = battle([mon({ moves: [buff] })], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(next.sides[0].team[0].stages.atk).toBe(1);
    expect(events).toContainEqual({ t: 'stage', side: 0, name: '테스트몬', stat: 'atk', delta: 1 });
  });

  test('상대 -1, 한계에서는 이벤트가 없다', () => {
    const state = battle([mon({ moves: [debuff] })], [mon()]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[1].team[0].stages.def).toBe(-1);

    const capped = battle([mon({ moves: [debuff] })], [mon()]);
    capped.sides[1].team[0].stages.def = -6;
    const { events } = resolveTurn(capped, [useMove, useMove]);
    expect(events.some((e) => e.t === 'stage' && e.side === 1)).toBe(false);
  });

  test('변화 기술로 2단계를 올린다', () => {
    const buff2 = tackle({
      category: 'status', power: 0,
      effects: [{ kind: 'stage', target: 'self', stat: 'spe', delta: 2, chance: 100 }],
    });
    const state = battle([mon({ moves: [buff2] })], [mon()]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[0].team[0].stages.spe).toBe(2);
  });
});

describe('속도와 교체', () => {
  test('속도 단계가 순서를 바꾼다', () => {
    const slow = mon({ stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 50 } });
    slow.stages.spe = 2;
    const fast = mon({ stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 80 } });
    const state = battle([slow], [fast]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(events.filter((e) => e.t === 'move').map((e) => e.side)).toEqual([0, 1]);
  });

  test('교체해서 빠지면 단계가 초기화된다', () => {
    const state = battle([mon(), mon({ name: '후보' })], [mon()]);
    state.sides[0].team[0].stages.atk = 3;
    const { state: next } = resolveTurn(state, [{ kind: 'switch', teamIndex: 1 }, useMove]);
    expect(next.sides[0].team[0].stages.atk).toBe(0);
  });
});
```

`src/engine/modifiers.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { computeDamage, HIGH_CRITICAL_CHANCE } from './damage.ts';
import type { Rng } from './rng.ts';
import { battle, mon, tackle } from './testkit.ts';
import { movePower, resolveTurn } from './turn.ts';
import type { Action, MoveEffect } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const rngWith = (next: number): Rng => ({ next: () => next, int: (_min, max) => max, chance: () => false, state: 0 });
const base = (effects: MoveEffect[]) => tackle({ power: 80, effects });

describe('위력 보정', () => {
  test('역전: 체력이 낮을수록 세다', () => {
    const attacker = mon({ hp: 25 });
    expect(movePower(base([{ kind: 'lowHp' }]), attacker, mon(), rngWith(0))).toBe(140);
    expect(movePower(base([{ kind: 'lowHp' }]), mon(), mon(), rngWith(0))).toBe(80);
  });

  test('보복: 이번 턴에 맞았을 때만 2배', () => {
    const attacker = mon();
    expect(movePower(base([{ kind: 'revenge' }]), attacker, mon(), rngWith(0))).toBe(80);
    attacker.hitThisTurn = true;
    expect(movePower(base([{ kind: 'revenge' }]), attacker, mon(), rngWith(0))).toBe(160);
  });

  test('약점 사냥: 상태이상인 상대에게 1.6배', () => {
    expect(movePower(base([{ kind: 'punish' }]), mon(), mon({ status: 'burn' }), rngWith(0))).toBe(128);
    expect(movePower(base([{ kind: 'punish' }]), mon(), mon(), rngWith(0))).toBe(80);
  });

  test('도박: 난수에 따라 0.4~1.6배', () => {
    const move = base([{ kind: 'gamble', min: 0.4, max: 1.6 }]);
    expect(movePower(move, mon(), mon(), rngWith(0))).toBe(32);
    expect(movePower(move, mon(), mon(), rngWith(0.5))).toBe(80);
  });
});

describe('급소와 비례 피해', () => {
  test('급소 효과는 급소 확률 인자를 넘긴다', () => {
    let seen = -1;
    const rng: Rng = { next: () => 0, int: (_min, max) => max, chance: (p) => { seen = p; return false; }, state: 0 };
    computeDamage(mon(), mon(), tackle(), rng, { criticalChance: HIGH_CRITICAL_CHANCE });
    expect(seen).toBe(1 / 3);
  });

  test('비례 피해는 방어와 상관없이 상대 현재 체력의 35%', () => {
    const wall = mon({ stats: { hp: 100, atk: 100, def: 9999, spa: 100, spd: 9999, spe: 100 } });
    const move = tackle({ power: 1, effects: [{ kind: 'percent', ratio: 0.35 }] });
    const state = battle([mon({ moves: [move] })], [wall]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(events).toContainEqual(expect.objectContaining({ t: 'damage', side: 1, amount: 35 }));
  });

  test('타입 무효면 비례 피해도 들어가지 않는다', () => {
    const move = tackle({ type: 'normal', effects: [{ kind: 'percent', ratio: 0.35 }] });
    const state = battle([mon({ moves: [move] })], [mon({ types: ['ghost'] })]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(events.some((e) => e.t === 'noEffect' && e.side === 0)).toBe(true);
    expect(next.sides[1].team[0].hp).toBe(100);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL (`stages.test.ts`의 데미지, 효과 테스트와 `movePower`가 없음)

- [ ] **Step 3: `src/engine/damage.ts` 구현**

```ts
import type { Rng } from './rng.ts';
import { staged } from './stages.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { BattlePokemon, Move } from './types.ts';

const CRITICAL_CHANCE = 1 / 24;
export const HIGH_CRITICAL_CHANCE = 1 / 3;

export interface DamageResult {
  damage: number;
  effectiveness: number;
  critical: boolean;
}

export interface DamageOptions {
  power?: number;
  criticalChance?: number;
}

export function computeDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
  options: DamageOptions = {},
): DamageResult {
  const effectiveness = typeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) return { damage: 0, effectiveness: 0, critical: false };

  const physical = move.category === 'physical';
  const attack = staged(physical ? attacker.stats.atk : attacker.stats.spa, physical ? attacker.stages.atk : attacker.stages.spa);
  const defense = staged(physical ? defender.stats.def : defender.stats.spd, physical ? defender.stages.def : defender.stages.spd);
  const power = options.power ?? move.power;
  const levelFactor = Math.floor((2 * attacker.level) / 5 + 2);
  const base = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50) + 2;

  const critical = rng.chance(options.criticalChance ?? CRITICAL_CHANCE);
  let damage = base * (critical ? 1.5 : 1) * (rng.int(85, 100) / 100);
  if (attacker.types.includes(move.type)) damage *= 1.5;
  damage *= effectiveness;
  if (physical && attacker.status === 'burn') damage *= 0.5;

  return { damage: Math.max(1, Math.floor(damage)), effectiveness, critical };
}

/** 혼란에 빠진 오디가 자신을 때리는 피해. 위력 40의 물리 공격이고 난수가 없다 */
export function confusionDamage(pokemon: BattlePokemon): number {
  const attack = staged(pokemon.stats.atk, pokemon.stages.atk);
  const defense = staged(pokemon.stats.def, pokemon.stages.def);
  const levelFactor = Math.floor((2 * pokemon.level) / 5 + 2);
  return Math.max(1, Math.floor(Math.floor((levelFactor * 40 * attack) / defense) / 50) + 2);
}
```

- [ ] **Step 4: `src/engine/turn.ts`에 추가한다**

import에 다음을 더한다.

```ts
import { HIGH_CRITICAL_CHANCE } from './damage.ts';
import { resetVolatile } from './fighter.ts';
import { changeStage, staged } from './stages.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { MoveEffect } from './types.ts';
```

(`computeDamage` import는 그대로 둔다. `types.ts` import 목록에는 `MoveEffect`를 이미 더했는지 확인한다.)

헬퍼를 추가한다.

```ts
export function effectOf<K extends MoveEffect['kind']>(move: Move, kind: K): Extract<MoveEffect, { kind: K }> | undefined {
  return move.effects.find((effect) => effect.kind === kind) as Extract<MoveEffect, { kind: K }> | undefined;
}

/** 이번에 실제로 쓰는 위력. 도박은 난수를 하나 쓴다 */
export function movePower(move: Move, attacker: BattlePokemon, defender: BattlePokemon, rng: Rng): number {
  let power = move.power;
  for (const effect of move.effects) {
    if (effect.kind === 'lowHp') power *= 1 + (1 - attacker.hp / attacker.stats.hp);
    if (effect.kind === 'revenge' && attacker.hitThisTurn) power *= 2;
    if (effect.kind === 'punish' && defender.status !== null) power *= 1.6;
    if (effect.kind === 'gamble') power *= effect.min + rng.next() * (effect.max - effect.min);
  }
  return Math.max(1, Math.round(power));
}

function roll(rng: Rng, chance: number): boolean {
  return chance >= 100 || rng.int(1, 100) <= chance;
}

function applyStage(
  target: BattlePokemon,
  side: SideIndex,
  effect: Extract<MoveEffect, { kind: 'stage' }>,
  events: BattleEvent[],
): boolean {
  if (target.hp <= 0) return false;
  const applied = changeStage(target.stages, effect.stat, effect.delta);
  if (applied === 0) return false;
  events.push({ t: 'stage', side, name: target.name, stat: effect.stat, delta: applied });
  return true;
}
```

`effectiveSpeed`를 단계가 반영되도록 바꾼다.

```ts
function effectiveSpeed(pokemon: BattlePokemon): number {
  const speed = staged(pokemon.stats.spe, pokemon.stages.spe);
  return pokemon.status === 'paralysis' ? Math.floor(speed / 2) : speed;
}
```

`switchIn` 첫 줄에 `resetVolatile(activeOf(state, side));`를 넣는다(빠지는 오디의 임시 상태를 초기화).

`executeMove` 전체를 다음으로 바꾼다. 이 작업에서는 위력 보정, 비례 피해, 급소, 단계 효과, 흡수, 상태이상을 처리하고 연타, 반동 등은 Task 3, 4에서 더한다.

```ts
function executeMove(state: BattleState, side: SideIndex, move: Move, rng: Rng, events: BattleEvent[]) {
  const attacker = activeOf(state, side);
  const targetSide = other(side);
  const defender = activeOf(state, targetSide);
  events.push({ t: 'move', side, name: attacker.name, moveName: move.name });

  if (move.accuracy !== 0 && rng.int(1, 100) > move.accuracy) {
    events.push({ t: 'miss', side });
    return;
  }

  if (move.category === 'status') {
    let worked = false;
    for (const effect of move.effects) {
      if (effect.kind === 'heal') worked = heal(attacker, side, Math.floor(attacker.stats.hp * effect.ratio), events) || worked;
      if (effect.kind === 'status') worked = applyStatus(defender, targetSide, effect.status, rng, events) || worked;
      if (effect.kind === 'stage') {
        const toSelf = effect.target === 'self';
        worked = applyStage(toSelf ? attacker : defender, toSelf ? side : targetSide, effect, events) || worked;
      }
    }
    if (!worked && move.effects.length > 0) events.push({ t: 'noEffect', side });
    return;
  }

  if (typeEffectiveness(move.type, defender.types) === 0) {
    events.push({ t: 'noEffect', side });
    return;
  }

  const percent = effectOf(move, 'percent');
  const power = movePower(move, attacker, defender, rng);
  const criticalChance = effectOf(move, 'crit') ? HIGH_CRITICAL_CHANCE : undefined;
  let amount: number;
  let effectiveness: number;
  let critical = false;
  if (percent) {
    amount = Math.max(1, Math.floor(defender.hp * percent.ratio));
    effectiveness = typeEffectiveness(move.type, defender.types);
  } else {
    const result = computeDamage(attacker, defender, move, rng, { power, criticalChance });
    amount = result.damage;
    effectiveness = result.effectiveness;
    critical = result.critical;
  }
  const dealt = Math.min(amount, defender.hp);
  defender.hp -= dealt;
  defender.hitThisTurn = true;
  events.push({ t: 'damage', side: targetSide, amount: dealt, hp: defender.hp, effectiveness, critical });
  if (defender.hp <= 0) events.push({ t: 'faint', side: targetSide, name: defender.name });

  for (const effect of move.effects) {
    if (effect.kind === 'drain') heal(attacker, side, Math.floor(dealt * effect.ratio), events);
    if (effect.kind === 'status' && defender.hp > 0 && roll(rng, effect.chance)) {
      applyStatus(defender, targetSide, effect.status, rng, events);
    }
    if (effect.kind === 'stage') {
      const toSelf = effect.target === 'self';
      const target = toSelf ? attacker : defender;
      if (target.hp > 0 && roll(rng, effect.chance)) applyStage(target, toSelf ? side : targetSide, effect, events);
    }
  }
}
```

기존 테스트의 흡수 기술 기대값(`10 + floor(amount*0.5)`)과 독, 수면 테스트가 계속 통과하는지 확인한다. 흡수 계산은 이전과 같다. `resolveTurn`의 시작부에 다음을 추가한다(턴마다 초기화).

```ts
  for (const side of [0, 1] as const) activeOf(state, side).hitThisTurn = false;
```

- [ ] **Step 5: 통과 확인**

Run: `npm test`, `npx tsc --noEmit` / Expected: 전부 통과

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 능력 단계, 위력 보정, 비례 피해, 급소 효과"
```

---

### Task 3: 연타, 반동, 움찔, 혼란, 방어, 정화

**Files:**
- Modify: `src/engine/turn.ts`
- Test: `src/engine/effects.test.ts`

**Interfaces:**
- Consumes: Task 1, 2 전체
- Produces: 연타, 반동, 움찔, 혼란(공격 부가와 변화 기술), 방어 태세, 정화가 동작한다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/effects.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { battle, mon, tackle } from './testkit.ts';
import { isLegalAction, resolveTurn } from './turn.ts';
import type { Action, BattleEvent } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const spe = (value: number) => ({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: value });
const big = { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
const count = (events: BattleEvent[], t: BattleEvent['t'], side?: number) =>
  events.filter((e) => e.t === t && (side === undefined || ('side' in e && e.side === side))).length;

describe('연타', () => {
  test('3연타는 피해 이벤트 3번과 연타 횟수를 남긴다', () => {
    const move = tackle({ power: 10, effects: [{ kind: 'multiHit', hits: 3 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 1000, stats: big })]);
    const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(count(events, 'damage')).toBe(3);
    expect(events).toContainEqual({ t: 'hits', count: 3 });
  });

  test('도중에 쓰러지면 멈춘다', () => {
    const move = tackle({ power: 500, effects: [{ kind: 'multiHit', hits: 2 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 5 })]);
    const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(count(events, 'damage')).toBe(1);
    expect(count(events, 'hits')).toBe(0);
  });
});

describe('반동', () => {
  test('준 피해의 1/4을 자신도 받는다', () => {
    const move = tackle({ power: 60, effects: [{ kind: 'recoil', ratio: 0.25 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 1000, stats: big })]);
    const { events, state: next } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    const damage = events.find((e) => e.t === 'damage');
    const recoil = events.find((e) => e.t === 'recoil');
    if (damage?.t !== 'damage' || recoil?.t !== 'recoil') throw new Error('이벤트 없음');
    expect(recoil.amount).toBe(Math.max(1, Math.floor(damage.amount * 0.25)));
    expect(next.sides[0].team[0].hp).toBe(100 - recoil.amount);
  });
});

describe('움찔', () => {
  const flinch = tackle({ effects: [{ kind: 'flinch', chance: 100 }] });

  test('먼저 움직이면 상대가 이번 턴 못 움직인다', () => {
    const state = battle([mon({ stats: spe(200), moves: [flinch] })], [mon({ stats: spe(100) })]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(events).toContainEqual({ t: 'cantMove', side: 1, name: '테스트몬', reason: 'flinch' });
    expect(count(events, 'move', 1)).toBe(0);
  });

  test('늦게 움직이면 움찔시키지 못한다', () => {
    const state = battle([mon({ stats: spe(50), moves: [flinch] })], [mon({ stats: spe(100) })]);
    const { events } = resolveTurn(state, [useMove, useMove]);
    expect(count(events, 'cantMove')).toBe(0);
  });
});

describe('혼란', () => {
  const confuseMove = tackle({ category: 'status', power: 0, effects: [{ kind: 'confuse', chance: 100 }] });

  test('변화 기술로 혼란에 빠뜨린다', () => {
    const state = battle([mon({ moves: [confuseMove] })], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(next.sides[1].team[0].confusion).toBeGreaterThanOrEqual(2);
    expect(count(events, 'confused')).toBe(1);
  });

  test('혼란 중에는 가끔 자신을 때리고 그 턴에는 움직이지 못한다', () => {
    let selfHits = 0;
    let moved = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const confused = mon();
      confused.confusion = 5;
      const state = battle([confused], [mon({ hp: 1000, stats: big })], seed);
      const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
      if (events.some((e) => e.t === 'confusionHit')) {
        selfHits += 1;
        expect(count(events, 'move', 0)).toBe(0);
      } else if (count(events, 'move', 0) === 1) {
        moved += 1;
      }
    }
    expect(selfHits).toBeGreaterThan(5);
    expect(moved).toBeGreaterThan(20);
  });

  test('마지막 혼란 횟수에서는 풀리고 움직인다', () => {
    const confused = mon();
    confused.confusion = 1;
    const state = battle([confused], [mon({ hp: 1000, stats: big })]);
    const { events, state: next } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(events).toContainEqual({ t: 'confusionEnd', side: 0, name: '테스트몬' });
    expect(count(events, 'move', 0)).toBe(1);
    expect(next.sides[0].team[0].confusion).toBe(0);
  });

  test('공격에 붙은 혼란', () => {
    const move = tackle({ effects: [{ kind: 'confuse', chance: 100 }] });
    const state = battle([mon({ moves: [move] })], [mon({ hp: 1000, stats: big })]);
    expect(resolveTurn(state, [useMove, { kind: 'pass' }]).state.sides[1].team[0].confusion).toBeGreaterThan(0);
  });
});

describe('방어 태세', () => {
  const shield = tackle({ category: 'status', power: 0, accuracy: 0, priority: 4, effects: [{ kind: 'shield' }] });

  test('이번 턴 공격을 막는다', () => {
    const state = battle([mon({ moves: [shield] })], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(events).toContainEqual({ t: 'shieldBlock', side: 0, name: '테스트몬' });
    expect(next.sides[0].team[0].hp).toBe(100);
    expect(next.sides[0].team[0].shielded).toBe(false);
  });

  test('연달아 쓰면 실패할 때가 있다', () => {
    let success = 0;
    let fail = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const user = mon({ moves: [shield] });
      user.shieldStreak = 1;
      const state = battle([user], [mon()], seed);
      const { events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
      if (count(events, 'shield') === 1) success += 1;
      else fail += 1;
    }
    expect(success).toBeGreaterThan(10);
    expect(fail).toBeGreaterThan(10);
  });

  test('다른 기술을 쓰면 연속 횟수가 초기화된다', () => {
    const user = mon({ moves: [tackle()] });
    user.shieldStreak = 3;
    const { state: next } = resolveTurn(battle([user], [mon()]), [useMove, useMove]);
    expect(next.sides[0].team[0].shieldStreak).toBe(0);
  });
});

describe('정화', () => {
  test('상태이상을 낫고 체력을 1/4 회복한다', () => {
    const cleanse = tackle({ category: 'status', power: 0, accuracy: 0, effects: [{ kind: 'cleanse', healRatio: 0.25 }] });
    const user = mon({ hp: 50, status: 'burn', moves: [cleanse] });
    const state = battle([user], [mon()]);
    const { state: next, events } = resolveTurn(state, [useMove, { kind: 'pass' }]);
    expect(next.sides[0].team[0].status).toBeNull();
    expect(next.sides[0].team[0].hp).toBe(75);
    expect(events).toContainEqual({ t: 'cure', side: 0, name: '테스트몬' });
  });
});

test('isLegalAction은 pass를 허용하지 않는다', () => {
  expect(isLegalAction(battle([mon()], [mon()]), 0, { kind: 'pass' })).toBe(false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL (`pass`, 연타, 반동 등이 없음)

- [ ] **Step 3: `src/engine/turn.ts` 구현**

import에 `confusionDamage`를 더한다(`import { computeDamage, confusionDamage, HIGH_CRITICAL_CHANCE } from './damage.ts';`).

`isLegalAction` 첫 줄에 추가한다.

```ts
  if (action.kind === 'pass') return false;
```

`actionPriority`의 첫 줄을 다음으로 바꾼다.

```ts
  if (action.kind === 'pass') return 0;
  if (action.kind === 'switch') return 100;
```

`resolveTurn` 반복문에서 `if (action.kind === 'switch') {...}` 바로 뒤에 추가한다.

```ts
    if (action.kind === 'pass') continue;
```

`canAct`를 다음으로 바꾼다(이 함수는 `activeOf`가 아닌 인자를 쓴다).

```ts
const CONFUSION_SELF_HIT = 1 / 3;

function canAct(pokemon: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]): boolean {
  const blocked = (reason: 'sleep' | 'paralysis' | 'flinch') => {
    pokemon.charging = null;
    events.push({ t: 'cantMove', side, name: pokemon.name, reason });
    return false;
  };
  if (pokemon.status === 'sleep') {
    if (pokemon.sleepTurns > 0) {
      pokemon.sleepTurns -= 1;
      return blocked('sleep');
    }
    pokemon.status = null;
    events.push({ t: 'wake', side, name: pokemon.name });
  }
  if (pokemon.flinched) {
    pokemon.flinched = false;
    return blocked('flinch');
  }
  if (pokemon.status === 'paralysis' && rng.chance(0.25)) return blocked('paralysis');
  if (pokemon.confusion > 0) {
    pokemon.confusion -= 1;
    if (pokemon.confusion === 0) {
      events.push({ t: 'confusionEnd', side, name: pokemon.name });
    } else if (rng.chance(CONFUSION_SELF_HIT)) {
      const amount = Math.min(confusionDamage(pokemon), pokemon.hp);
      pokemon.hp -= amount;
      pokemon.charging = null;
      events.push({ t: 'confusionHit', side, name: pokemon.name, amount, hp: pokemon.hp });
      if (pokemon.hp <= 0) events.push({ t: 'faint', side, name: pokemon.name });
      return false;
    }
  }
  return true;
}
```

새 헬퍼를 추가한다.

```ts
function applyConfusion(target: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]): boolean {
  if (target.hp <= 0 || target.confusion > 0) return false;
  target.confusion = rng.int(3, 5);
  events.push({ t: 'confused', side, name: target.name });
  return true;
}

function cleanse(pokemon: BattlePokemon, side: SideIndex, ratio: number, events: BattleEvent[]): boolean {
  let did = false;
  if (pokemon.status !== null) {
    pokemon.status = null;
    pokemon.sleepTurns = 0;
    events.push({ t: 'cure', side, name: pokemon.name });
    did = true;
  }
  return heal(pokemon, side, Math.floor(pokemon.stats.hp * ratio), events) || did;
}

function useShield(attacker: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]) {
  const success = attacker.shieldStreak === 0 || rng.chance(0.5 ** attacker.shieldStreak);
  if (!success) {
    attacker.shieldStreak = 0;
    events.push({ t: 'noEffect', side });
    return;
  }
  attacker.shielded = true;
  attacker.shieldStreak += 1;
  events.push({ t: 'shield', side, name: attacker.name });
}

function targetsFoe(move: Move): boolean {
  return (
    move.category !== 'status' ||
    move.effects.some((e) => e.kind === 'status' || e.kind === 'confuse' || (e.kind === 'stage' && e.target === 'foe'))
  );
}
```

`executeMove`의 인자를 `(state, side, moveIndex, rng, events, movedFirst)`로 바꾸고 본문을 다음으로 바꾼다. 호출부는 `executeMove(state, side, action.moveIndex, rng, events, side === order[0])`로 바꾸고, `resolveTurn`의 `for` 앞에서 `const order = actionOrder(state, actions, rng);`로 한 번만 계산해 `for (const side of order)`로 쓴다.

```ts
function executeMove(
  state: BattleState, side: SideIndex, moveIndex: number, rng: Rng, events: BattleEvent[], movedFirst: boolean,
) {
  const attacker = activeOf(state, side);
  const move = attacker.moves[moveIndex];
  const targetSide = other(side);
  const defender = activeOf(state, targetSide);
  if (!effectOf(move, 'shield')) attacker.shieldStreak = 0;
  events.push({ t: 'move', side, name: attacker.name, moveName: move.name });

  if (effectOf(move, 'shield')) {
    useShield(attacker, side, rng, events);
    return;
  }
  if (targetsFoe(move) && defender.shielded) {
    events.push({ t: 'shieldBlock', side: targetSide, name: defender.name });
    return;
  }
  if (move.accuracy !== 0 && rng.int(1, 100) > move.accuracy) {
    events.push({ t: 'miss', side });
    return;
  }

  if (move.category === 'status') {
    const immune = typeEffectiveness(move.type, defender.types) === 0;
    let worked = false;
    for (const effect of move.effects) {
      if (effect.kind === 'heal') worked = heal(attacker, side, Math.floor(attacker.stats.hp * effect.ratio), events) || worked;
      if (effect.kind === 'cleanse') worked = cleanse(attacker, side, effect.healRatio, events) || worked;
      if (effect.kind === 'status' && !immune) worked = applyStatus(defender, targetSide, effect.status, rng, events) || worked;
      if (effect.kind === 'confuse' && !immune) worked = applyConfusion(defender, targetSide, rng, events) || worked;
      if (effect.kind === 'stage') {
        const toSelf = effect.target === 'self';
        if (toSelf || !immune) worked = applyStage(toSelf ? attacker : defender, toSelf ? side : targetSide, effect, events) || worked;
      }
    }
    if (!worked && move.effects.length > 0) events.push({ t: 'noEffect', side });
    return;
  }

  if (typeEffectiveness(move.type, defender.types) === 0) {
    events.push({ t: 'noEffect', side });
    return;
  }

  const percent = effectOf(move, 'percent');
  const power = movePower(move, attacker, defender, rng);
  const criticalChance = effectOf(move, 'crit') ? HIGH_CRITICAL_CHANCE : undefined;
  const hits = effectOf(move, 'multiHit')?.hits ?? 1;
  let total = 0;
  let landed = 0;
  for (let i = 0; i < hits && defender.hp > 0; i++) {
    let amount: number;
    let effectiveness = typeEffectiveness(move.type, defender.types);
    let critical = false;
    if (percent) {
      amount = Math.max(1, Math.floor(defender.hp * percent.ratio));
    } else {
      const result = computeDamage(attacker, defender, move, rng, { power, criticalChance });
      amount = result.damage;
      effectiveness = result.effectiveness;
      critical = result.critical;
    }
    const dealt = Math.min(amount, defender.hp);
    defender.hp -= dealt;
    total += dealt;
    landed += 1;
    events.push({ t: 'damage', side: targetSide, amount: dealt, hp: defender.hp, effectiveness, critical });
  }
  if (landed > 1) events.push({ t: 'hits', count: landed });
  defender.hitThisTurn = true;
  if (defender.hp <= 0) events.push({ t: 'faint', side: targetSide, name: defender.name });

  for (const effect of move.effects) {
    if (effect.kind === 'drain') heal(attacker, side, Math.floor(total * effect.ratio), events);
    if (effect.kind === 'recoil') {
      const amount = Math.min(Math.max(1, Math.floor(total * effect.ratio)), attacker.hp);
      attacker.hp -= amount;
      events.push({ t: 'recoil', side, name: attacker.name, amount, hp: attacker.hp });
      if (attacker.hp <= 0) events.push({ t: 'faint', side, name: attacker.name });
    }
    if (effect.kind === 'status' && defender.hp > 0 && roll(rng, effect.chance)) {
      applyStatus(defender, targetSide, effect.status, rng, events);
    }
    if (effect.kind === 'confuse' && defender.hp > 0 && roll(rng, effect.chance)) {
      applyConfusion(defender, targetSide, rng, events);
    }
    if (effect.kind === 'flinch' && movedFirst && defender.hp > 0 && roll(rng, effect.chance)) {
      defender.flinched = true;
    }
    if (effect.kind === 'stage') {
      const toSelf = effect.target === 'self';
      const target = toSelf ? attacker : defender;
      if (target.hp > 0 && roll(rng, effect.chance)) applyStage(target, toSelf ? side : targetSide, effect, events);
    }
  }
}
```

`resolveTurn`의 `endOfTurnDamage` 호출 앞에 추가한다.

```ts
  for (const side of [0, 1] as const) {
    const pokemon = activeOf(state, side);
    pokemon.flinched = false;
    pokemon.shielded = false;
  }
```

(속박 감소는 Task 4에서 더한다.)

- [ ] **Step 4: 통과 확인**

Run: `npm test`, `npx tsc --noEmit` / Expected: 전부 통과 (이전 테스트 포함)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 연타, 반동, 움찔, 혼란, 방어 태세, 정화"
```

---

### Task 4: 충전, 지연, 교대, 속박

**Files:**
- Modify: `src/engine/turn.ts`
- Test: `src/engine/multiturn.test.ts`

**Interfaces:**
- Consumes: Task 1~3 전체
- Produces: 충전, 지연 공격, 교대 공격, 속박이 동작한다. 충전 중에는 행동이 강제되고 교체할 수 없다. 속박되면 교체할 수 없다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/multiturn.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { battle, mon, tackle } from './testkit.ts';
import { isLegalAction, resolveForcedSwitch, resolveTurn } from './turn.ts';
import type { Action, BattleEvent } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const pass: Action = { kind: 'pass' };
const hasEvent = (events: BattleEvent[], t: BattleEvent['t']) => events.some((e) => e.t === t);
const tank = { hp: 1000, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };

describe('충전', () => {
  const charge = tackle({ power: 100, effects: [{ kind: 'charge' }] });

  test('첫 턴은 모으기만 하고 다음 턴에 공격한다', () => {
    const state = battle([mon({ moves: [charge] })], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    expect(hasEvent(first.events, 'charge')).toBe(true);
    expect(hasEvent(first.events, 'damage')).toBe(false);
    expect(first.state.sides[0].team[0].charging).toBe(0);

    const second = resolveTurn(first.state, [pass, pass]);
    expect(hasEvent(second.events, 'damage')).toBe(true);
    expect(second.state.sides[0].team[0].charging).toBeNull();
  });

  test('충전 중에는 교체할 수 없고, 다른 행동을 골라도 충전한 기술이 나간다', () => {
    const state = battle([mon({ moves: [charge, tackle()] }), mon()], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    expect(isLegalAction(first.state, 0, { kind: 'switch', teamIndex: 1 })).toBe(false);
    const second = resolveTurn(first.state, [{ kind: 'move', moveIndex: 1 }, pass]);
    expect(second.events).toContainEqual(expect.objectContaining({ t: 'move', side: 0, moveName: '몸통박치기' }));
    expect(second.events.filter((e) => e.t === 'damage')).toHaveLength(1);
  });

  test('충전 중에 잠들면 충전이 풀린다', () => {
    const state = battle([mon({ moves: [charge] })], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    first.state.sides[0].team[0].status = 'sleep';
    first.state.sides[0].team[0].sleepTurns = 2;
    const second = resolveTurn(first.state, [pass, pass]);
    expect(second.state.sides[0].team[0].charging).toBeNull();
  });
});

describe('지연', () => {
  test('쓴 다음 턴 끝에 맞는다', () => {
    const delayed = tackle({ power: 80, effects: [{ kind: 'delayed' }] });
    const state = battle([mon({ moves: [delayed] })], [mon({ hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    expect(hasEvent(first.events, 'delayedSet')).toBe(true);
    expect(first.state.sides[1].team[0].hp).toBe(1000);
    expect(first.state.delayed).toHaveLength(1);

    const second = resolveTurn(first.state, [pass, pass]);
    expect(hasEvent(second.events, 'delayedHit')).toBe(true);
    expect(second.state.sides[1].team[0].hp).toBeLessThan(1000);
    expect(second.state.delayed).toHaveLength(0);
  });

  test('그 사이 교체해도 새로 나온 오디가 맞는다', () => {
    const delayed = tackle({ power: 80, effects: [{ kind: 'delayed' }] });
    const state = battle([mon({ moves: [delayed] })], [mon({ hp: 1000, stats: tank }), mon({ name: '후보', hp: 1000, stats: tank })]);
    const first = resolveTurn(state, [useMove, pass]);
    const second = resolveTurn(first.state, [pass, { kind: 'switch', teamIndex: 1 }]);
    expect(second.state.sides[1].team[1].hp).toBeLessThan(1000);
  });
});

describe('교대 공격', () => {
  const pivot = tackle({ effects: [{ kind: 'pivot' }] });

  test('벤치가 있으면 턴이 끝난 뒤 교체를 고른다', () => {
    const state = battle([mon({ moves: [pivot] }), mon({ name: '후보' })], [mon({ hp: 1000, stats: tank })]);
    const { state: next, events } = resolveTurn(state, [useMove, pass]);
    expect(hasEvent(events, 'pivot')).toBe(true);
    expect(next.pendingSwitch).toEqual([true, false]);
    expect(resolveForcedSwitch(next, 0, 1).state.sides[0].active).toBe(1);
  });

  test('벤치가 없으면 그대로 남는다', () => {
    const state = battle([mon({ moves: [pivot] })], [mon({ hp: 1000, stats: tank })]);
    expect(resolveTurn(state, [useMove, pass]).state.pendingSwitch).toEqual([false, false]);
  });
});

describe('속박', () => {
  const trap = tackle({ effects: [{ kind: 'trap', turns: 3 }] });

  test('3턴 동안 교체할 수 없고 그 뒤에 풀린다', () => {
    const state = battle([mon({ moves: [trap] })], [mon({ hp: 1000, stats: tank }), mon({ name: '후보' })]);
    let current = resolveTurn(state, [useMove, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(false);
    current = resolveTurn(current, [pass, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(false);
    current = resolveTurn(current, [pass, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(false);
    current = resolveTurn(current, [pass, pass]).state;
    expect(isLegalAction(current, 1, { kind: 'switch', teamIndex: 1 })).toBe(true);
  });

  test('쓰러져서 바꾸는 것은 막지 않는다', () => {
    const state = battle([mon()], [mon({ hp: 0 }), mon({ name: '후보' })]);
    state.sides[1].team[0].trapped = 3;
    expect(isLegalAction(state, 1, { kind: 'switch', teamIndex: 1 })).toBe(true);
  });
});

test('전투 상태를 JSON으로 바꿨다 되돌려도 같은 결과가 나온다', () => {
  const delayed = tackle({ power: 80, effects: [{ kind: 'delayed' }] });
  const state = battle([mon({ moves: [delayed] })], [mon({ hp: 1000, stats: tank })], 7);
  const first = resolveTurn(state, [useMove, pass]);
  const copy = JSON.parse(JSON.stringify(first.state));
  expect(resolveTurn(copy, [pass, pass])).toEqual(resolveTurn(first.state, [pass, pass]));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL (충전, 지연, 교대, 속박이 없음)

- [ ] **Step 3: `src/engine/turn.ts` 구현**

import에 `DelayedHit`를 더한다.

`hasBench`와 정규화 헬퍼를 추가한다.

```ts
function hasBench(state: BattleState, side: SideIndex): boolean {
  const { team, active } = state.sides[side];
  return team.some((pokemon, index) => index !== active && pokemon.hp > 0);
}

/** 충전 중이면 무엇을 골랐든 충전한 기술이 나간다 */
function normalizeAction(state: BattleState, side: SideIndex, action: Action): Action {
  const charging = activeOf(state, side).charging;
  return charging !== null ? { kind: 'move', moveIndex: charging } : action;
}
```

`isLegalAction`의 교체 부분을 다음으로 바꾼다(앞의 `pass`와 `move` 처리는 그대로).

```ts
  const { team, active } = state.sides[side];
  const current = team[active];
  if (current.hp > 0 && (current.trapped > 0 || current.charging !== null)) return false;
  const target = team[action.teamIndex];
  return action.teamIndex !== active && target !== undefined && target.hp > 0;
```

`resolveTurn` 상단에서 행동을 정규화한다. `const rng = ...`와 `hitThisTurn` 초기화 아래에 다음을 둔다.

```ts
  const acts: [Action, Action] = [normalizeAction(state, 0, actions[0]), normalizeAction(state, 1, actions[1])];
  const order = actionOrder(state, acts, rng);
```

반복문은 `for (const side of order)`로, 안에서 `actions[side]` 대신 `acts[side]`를 쓴다.

`executeMove`에서 `events.push({ t: 'move', ... })` 바로 뒤, 방어 태세 처리(`effectOf(move, 'shield')`) 앞에 충전을 추가한다. 순서는 이벤트 → 충전 → 방어 → 방어 막힘 → 명중 → 기술 종류별 처리다. `action`은 `acts[side]`다.

```ts
  if (effectOf(move, 'charge') && attacker.charging === null) {
    attacker.charging = moveIndex;
    events.push({ t: 'charge', side, name: attacker.name });
    return;
  }
  attacker.charging = null;
```

공격 부분에서 비례 피해 계산 직후, 연타 루프 앞에 지연을 처리한다.

```ts
  if (effectOf(move, 'delayed')) {
    const { damage } = computeDamage(attacker, defender, move, rng, { power, criticalChance });
    state.delayed.push({ targetSide, amount: damage, userName: attacker.name, moveName: move.name, turnsLeft: 2 });
    events.push({ t: 'delayedSet', side, name: attacker.name, moveName: move.name });
    return;
  }
```

효과 반복문(`for (const effect of move.effects)`)에 두 가지를 더한다.

```ts
    if (effect.kind === 'trap' && defender.hp > 0 && defender.trapped === 0) {
      defender.trapped = effect.turns + 1;
      events.push({ t: 'trap', side: targetSide, name: defender.name });
    }
    if (effect.kind === 'pivot' && attacker.hp > 0) {
      state.pivoting[side] = true;
      events.push({ t: 'pivot', side, name: attacker.name });
    }
```

지연 공격 처리를 추가한다.

```ts
function deliverDelayed(state: BattleState, events: BattleEvent[]) {
  const remaining: DelayedHit[] = [];
  for (const hit of state.delayed) {
    hit.turnsLeft -= 1;
    if (hit.turnsLeft > 0) {
      remaining.push(hit);
      continue;
    }
    const target = activeOf(state, hit.targetSide);
    if (target.hp <= 0) continue;
    const amount = Math.min(hit.amount, target.hp);
    target.hp -= amount;
    events.push({ t: 'delayedHit', side: hit.targetSide, name: target.name, moveName: hit.moveName, amount, hp: target.hp });
    if (target.hp <= 0) events.push({ t: 'faint', side: hit.targetSide, name: target.name });
  }
  state.delayed = remaining;
}
```

`resolveTurn`의 끝부분(반복문 뒤)을 다음 순서로 만든다.

```ts
  deliverDelayed(state, events);
  endOfTurnDamage(state, 0, events);
  endOfTurnDamage(state, 1, events);
  for (const side of [0, 1] as const) {
    const pokemon = activeOf(state, side);
    pokemon.flinched = false;
    pokemon.shielded = false;
    pokemon.trapped = Math.max(0, pokemon.trapped - 1);
  }
  settleFaints(state, rng, events);
  state.turn += 1;
  state.rngState = rng.state;
  return { state, events };
```

`settleFaints`의 마지막 줄(`state.pendingSwitch = ...`)을 다음으로 바꾼다.

```ts
  state.pendingSwitch = [0, 1].map((index) => {
    const side = index as SideIndex;
    return activeOf(state, side).hp <= 0 || (state.pivoting[side] && hasBench(state, side));
  }) as [boolean, boolean];
  state.pivoting = [false, false];
```

승패가 난 경우(`return` 앞)에도 `state.pivoting = [false, false];`를 한다.

- [ ] **Step 4: 통과 확인**

Run: `npm test`, `npx tsc --noEmit` / Expected: 전부 통과

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 충전, 지연, 교대 공격, 속박"
```

---

### Task 5: AI, 화면 문구, 전투 재생

**Files:**
- Modify: `src/engine/ai.ts`, `src/engine/ai.test.ts`, `src/ui/messages.ts`, `src/ui/messages.test.ts`, `src/ui/useBattle.ts`, `src/ui/BattleScreen.tsx`

**Interfaces:**
- Consumes: Task 1~4 전체
- Produces: `chooseAiAction`이 새 효과를 이해한다. 모든 새 이벤트에 한글 문구가 있고, 체력 막대가 반동, 혼란 자해, 지연 공격에도 움직인다. 전투 화면이 교대 공격 후 교체 선택을 처리한다

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/ai.test.ts`에 추가한다.

```ts
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
  const pound = tackle({ type: 'rock', power: 20 });
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
```

`src/ui/messages.test.ts`에서 첫 테스트의 `faint` 단언 중 `side: 1`이던 것을 `side: 0`으로 바꾸고(상대 표기가 생기므로), 다음을 추가한다.

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL

- [ ] **Step 3: AI 구현**

`src/engine/ai.ts`를 다음으로 바꾼다.

```ts
import { activeOf, effectOf, isStatusImmune } from './turn.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { Action, BattlePokemon, BattleState, Move, SideIndex } from './types.ts';

const STATUS_MOVE_SCORE = 60;
const BUFF_SCORE = 50;
const FIXED_PERCENT_POWER = 70;

function attackScore(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const accuracy = move.accuracy === 0 ? 1 : move.accuracy / 100;
  const matchup = typeEffectiveness(move.type, defender.types);
  let power = move.power;
  const gamble = effectOf(move, 'gamble');
  if (gamble) power *= (gamble.min + gamble.max) / 2;
  if (effectOf(move, 'percent')) power = FIXED_PERCENT_POWER;
  const hits = effectOf(move, 'multiHit')?.hits ?? 1;
  let score = power * hits * stab * accuracy * matchup;
  if (effectOf(move, 'recoil')) score *= 0.85;
  if (effectOf(move, 'delayed')) score *= 0.8;
  if (effectOf(move, 'charge')) score *= 0.5;
  if (effectOf(move, 'punish') && defender.status !== null) score *= 1.6;
  return score;
}

function statusScore(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  let best = 0;
  for (const effect of move.effects) {
    let score = 0;
    if (effect.kind === 'status') {
      score = defender.status === null && !isStatusImmune(defender.types, effect.status) ? STATUS_MOVE_SCORE : 0;
    }
    if (effect.kind === 'confuse') score = defender.confusion === 0 ? BUFF_SCORE : 0;
    if (effect.kind === 'heal') score = attacker.hp * 2 < attacker.stats.hp ? STATUS_MOVE_SCORE + 10 : 0;
    if (effect.kind === 'cleanse') score = attacker.status !== null || attacker.hp * 2 < attacker.stats.hp ? BUFF_SCORE : 0;
    if (effect.kind === 'shield') score = attacker.shieldStreak === 0 ? 20 : 0;
    if (effect.kind === 'stage') {
      const target = effect.target === 'self' ? attacker : defender;
      const current = target.stages[effect.stat];
      const useful = effect.delta > 0 ? current < 2 : current > -2;
      score = useful ? BUFF_SCORE : 0;
    }
    best = Math.max(best, score);
  }
  return best;
}

export function chooseAiAction(state: BattleState, side: SideIndex): Action {
  const attacker = activeOf(state, side);
  const defender = activeOf(state, side === 0 ? 1 : 0);
  if (attacker.charging !== null) return { kind: 'move', moveIndex: attacker.charging };
  let moveIndex = 0;
  let best = -1;
  attacker.moves.forEach((move, index) => {
    const score = move.category === 'status' ? statusScore(attacker, defender, move) : attackScore(attacker, defender, move);
    if (score > best) {
      best = score;
      moveIndex = index;
    }
  });
  return { kind: 'move', moveIndex };
}

export function chooseAiSwitch(state: BattleState, side: SideIndex): number {
  return state.sides[side].team.findIndex((pokemon, index) => index !== state.sides[side].active && pokemon.hp > 0);
}
```

(`chooseAiSwitch`는 현재 오디를 제외한다. 교대 공격 뒤에 현재 오디가 다시 뽑히면 안 되기 때문이다. 기존 테스트 `chooseAiSwitch는 살아 있는 첫 포켓몬을 고른다`는 `team[0]`이 쓰러진 상태에서 `active`가 0이므로 결과가 같다.)

- [ ] **Step 4: 문구와 재생 구현**

`src/ui/messages.ts`를 다음으로 통째로 바꾼다. 오디 이름 뒤 조사는 받침에 따라 달라지므로 이름 바로 뒤에 조사가 오는 문장은 `eunNeun`만 쓰고, 나머지는 조사가 필요 없는 문장으로 만들었다. 상대 오디는 앞에 「상대」를 붙인다.

```ts
import type { BattleEvent, SideIndex, Status } from '../engine/types.ts';

const STATUS_NAMES: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '수면' };
const STAT_NAMES = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '속도' };

function eunNeun(name: string): string {
  const last = name.charCodeAt(name.length - 1) - 0xac00;
  const hasFinal = last >= 0 && last % 28 !== 0;
  return `${name}${hasFinal ? '은' : '는'}`;
}

function label(side: SideIndex, name: string): string {
  return side === 0 ? name : `상대 ${name}`;
}

function damageMessage(effectiveness: number, critical: boolean): string | null {
  const parts: string[] = [];
  if (critical) parts.push('급소에 맞았다!');
  if (effectiveness > 1) parts.push('효과가 굉장했다!');
  if (effectiveness < 1) parts.push('효과가 별로인 듯하다...');
  return parts.length > 0 ? parts.join(' ') : null;
}

export function eventMessage(event: BattleEvent): string | null {
  switch (event.t) {
    case 'switch': return event.side === 0 ? `가랏, ${event.name}!` : `상대 ${event.name} 등장!`;
    case 'move': return `${label(event.side, event.name)}의 ${event.moveName}!`;
    case 'miss': return '공격이 빗나갔다!';
    case 'noEffect': return '효과가 없는 듯하다...';
    case 'damage': return damageMessage(event.effectiveness, event.critical);
    case 'hits': return `${event.count}번 맞았다!`;
    case 'heal': return `${eunNeun(label(event.side, event.name))} 체력을 회복했다!`;
    case 'cure': return `${label(event.side, event.name)}의 상태이상이 나았다!`;
    case 'status': return `${eunNeun(label(event.side, event.name))} ${STATUS_NAMES[event.status]} 상태가 되었다!`;
    case 'statusDamage': return `${eunNeun(label(event.side, event.name))} ${STATUS_NAMES[event.status]} 때문에 데미지를 입었다!`;
    case 'cantMove': {
      const who = eunNeun(label(event.side, event.name));
      if (event.reason === 'sleep') return `${who} 쿨쿨 자고 있다.`;
      if (event.reason === 'flinch') return `${who} 움찔해서 움직일 수 없다!`;
      return `${who} 몸이 저려서 움직일 수 없다!`;
    }
    case 'wake': return `${eunNeun(label(event.side, event.name))} 눈을 떴다!`;
    case 'stage': {
      const word = event.delta >= 2 ? '크게 올랐다' : event.delta === 1 ? '올랐다' : event.delta <= -2 ? '크게 내려갔다' : '내려갔다';
      return `${label(event.side, event.name)}의 ${STAT_NAMES[event.stat]} 능력이 ${word}!`;
    }
    case 'confused': return `${label(event.side, event.name)}의 머릿속이 혼란스러워졌다!`;
    case 'confusionHit': return `${label(event.side, event.name)}의 혼란! 스스로를 때렸다!`;
    case 'confusionEnd': return `${label(event.side, event.name)}의 혼란이 풀렸다!`;
    case 'recoil': return `${label(event.side, event.name)}에게 반동이 왔다!`;
    case 'charge': return `${label(event.side, event.name)}의 기운이 모이고 있다!`;
    case 'delayedSet': return `${label(event.side, event.name)}의 ${event.moveName} 준비!`;
    case 'delayedHit': return `${label(event.side, event.name)}에게 ${event.moveName} 공격이 닿았다!`;
    case 'trap': return `${label(event.side, event.name)}의 퇴로가 막혔다!`;
    case 'shield': return `${label(event.side, event.name)}의 방어 태세!`;
    case 'shieldBlock': return `${label(event.side, event.name)}의 방어 태세가 공격을 막았다!`;
    case 'pivot': return `${label(event.side, event.name)}의 교대!`;
    case 'faint': return `${eunNeun(label(event.side, event.name))} 쓰러졌다!`;
    case 'win': return event.side === 0 ? '승리했다!' : '패배했다...';
  }
}
```

`src/ui/useBattle.ts`의 `applyToShown`에서 체력이 바뀌는 이벤트 목록에 `recoil`, `confusionHit`, `delayedHit`를 추가한다.

```ts
  if (
    event.t === 'damage' || event.t === 'heal' || event.t === 'statusDamage' ||
    event.t === 'recoil' || event.t === 'confusionHit' || event.t === 'delayedHit'
  ) {
    next.hp[event.side] = event.hp;
  }
```

`finishTurn`에서 교대 공격 뒤 플레이어 교체를 처리하려면 기존 `pendingSwitch[0]` 분기가 이미 「다음 포켓몬을 골라줘!」를 띄우고 `BattleScreen`이 `mustSwitch`로 팀 목록을 보여 준다. NPC가 교대 공격을 쓴 경우 `pendingSwitch[1]`이 켜지고, 기존 코드가 `chooseAiSwitch`로 교체한다. 추가 수정은 없다.

`src/ui/BattleScreen.tsx`는 기술 버튼에 `위력`을 표시할 때 비례 피해나 도박 기술이면 「특수」를 표시한다.

```tsx
const powerLabel = (move: Move) =>
  move.category === 'status' ? '변화'
    : move.effects.some((e) => e.kind === 'percent' || e.kind === 'gamble') ? '특수'
    : `위력 ${move.power}`;
```

(`import type { Move } from '../engine/types.ts'` 추가, 버튼의 `<small>`에 `{powerLabel(move)}`를 쓴다.)

- [ ] **Step 5: 통과 확인**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` / Expected: 전부 통과

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 새 효과를 이해하는 AI, 문구, 체력 재생"
```

---

### Task 6: 오디 데이터 만들기

**Files:**
- Create: `scripts/oddie-design.ts`, `scripts/build-oddies.ts`, `scripts/oddie-design.test.ts`
- Modify: `src/data/types.ts`, `src/data/index.ts`, `src/data/data.test.ts`, `package.json`, `src/game/factory.test.ts`
- Delete: `scripts/convert.ts`, `scripts/convert.test.ts`, `scripts/build-data.ts`
- Generate: `src/data/species.json`, `src/data/moves.json`

**Interfaces:**
- Consumes: `Move`, `MoveEffect`, `Stats`, `TypeName`
- Produces:
  - `Species = { id; name; types; baseStats; learnset; region; rarity; role; captureRate; signatureMoveId }`
  - `parseDesign(text): DesignEntry[]`, `buildStats(role, total): Stats`, `isSpecialAttacker(role, firstType): boolean`
  - `commonMove(type, tier, special): Move`, `commonMoveId(type, tier, special): number`, `signatureMove(entry, rarity): Move`, `buildLearnset(entry, rarity): LearnEntry[]`
  - `SHAKE_ID`, `TACKLE_ID`, `captureRateOf(rarity)`, `totalOf(num, rarity)`

- [ ] **Step 1: 데이터 타입을 바꾼다**

`src/data/types.ts`:

```ts
import type { Stats, TypeName } from '../engine/types.ts';

export interface LearnEntry {
  level: number;
  moveId: number;
}

export type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Secret' | '???';

export interface Species {
  id: number;
  name: string;
  types: TypeName[];
  baseStats: Stats;
  learnset: LearnEntry[];
  region: string;
  rarity: Rarity;
  role: string;
  captureRate: number;
  signatureMoveId: number;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`scripts/oddie-design.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
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
    const sum = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0);
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
    expect(triple).toMatchObject({ power: 25 });
    expect(triple.effects).toEqual([{ kind: 'multiHit', hits: 3 }]);
    const charge = signatureMove(entry('010|Sunhorn|gra|fir|can|태양 뿔 광선|cha+brn'), 'Legendary');
    expect(charge.power).toBe(190);
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
      .toEqual([{ kind: 'stage', target: 'self', stat: 'def', delta: 2, chance: 100 }]);
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
    expect(move.effects).toEqual([{ kind: 'percent', ratio: 0.35 }]);
    expect(move.accuracy).toBe(90);
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
```

`src/data/data.test.ts` 전체를 다음으로 바꾼다.

```ts
import { expect, test } from 'vitest';
import { MOVES, SPECIES, speciesById } from './index.ts';

test('오디 165종이 번호순으로 있다', () => {
  expect(SPECIES).toHaveLength(165);
  expect(SPECIES.map((s) => s.id)).toEqual(Array.from({ length: 165 }, (_, i) => i + 1));
});

test('모든 습득 기술이 실제로 있고 레벨 5 이하에 2개 이상 있다', () => {
  for (const species of SPECIES) {
    expect(species.learnset.filter((e) => e.level <= 5).length).toBeGreaterThanOrEqual(2);
    for (const entry of species.learnset) expect(MOVES[entry.moveId]).toBeDefined();
    expect(species.learnset.some((e) => e.moveId === species.signatureMoveId)).toBe(true);
  }
});

test('고유 기술은 종마다 다르고 평범한 공격이 아니다', () => {
  const ids = SPECIES.map((s) => s.signatureMoveId);
  expect(new Set(ids).size).toBe(165);
  for (const id of ids) expect(MOVES[id].effects.length > 0 || MOVES[id].priority > 0).toBe(true);
});

test('대표 오디 값', () => {
  const pippo = speciesById(1);
  expect(pippo).toMatchObject({ name: 'Pippo', types: ['grass'], region: 'Meadow', rarity: 'Common', captureRate: 190 });
  expect(pippo.baseStats.hp).toBe(52);
  expect(speciesById(42).types).toEqual(['fire', 'ghost']);
  expect(speciesById(107).types).toEqual(['water']);
});

test('기술 id가 겹치지 않고 위력은 양수다', () => {
  for (const move of Object.values(MOVES)) {
    if (move.category === 'status') expect(move.power).toBe(0);
    else expect(move.power).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test` / Expected: FAIL (`./oddie-design.ts`를 찾지 못함)

- [ ] **Step 4: `scripts/oddie-design.ts` 구현**

```ts
import type { LearnEntry, Rarity } from '../src/data/types.ts';
import type { Move, MoveEffect, StatKey, Stats, TypeName } from '../src/engine/types.ts';

export type Role = 'bal' | 'bru' | 'can' | 'tnk' | 'wal' | 'spd' | 'mag' | 'gls' | 'sup';

export interface DesignEntry {
  num: number;
  name: string;
  types: TypeName[];
  role: Role;
  sig: string;
  status: boolean;
  traits: string[];
  sigType: TypeName | undefined;
}

const TYPE_CODES: Record<string, TypeName> = {
  nor: 'normal', fir: 'fire', wat: 'water', ele: 'electric', gra: 'grass', ice: 'ice', fig: 'fighting', poi: 'poison',
  gro: 'ground', fly: 'flying', psy: 'psychic', bug: 'bug', roc: 'rock', gho: 'ghost', dra: 'dragon', dar: 'dark',
  ste: 'steel', fai: 'fairy',
};
const TYPE_ORDER = Object.values(TYPE_CODES);
const ROLES: Role[] = ['bal', 'bru', 'can', 'tnk', 'wal', 'spd', 'mag', 'gls', 'sup'];

const WEIGHTS: Record<Role, number[]> = {
  bal: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  bru: [1.1, 1.4, 1.2, 0.6, 0.9, 0.8],
  can: [0.9, 0.6, 0.8, 1.5, 1.0, 1.2],
  tnk: [1.4, 0.9, 1.5, 0.6, 1.0, 0.6],
  wal: [1.3, 0.6, 1.0, 0.9, 1.5, 0.7],
  spd: [0.8, 1.2, 0.7, 0.6, 0.8, 1.9],
  mag: [0.8, 0.5, 0.7, 1.4, 0.9, 1.7],
  gls: [0.8, 1.7, 0.6, 0.5, 1.0, 1.4],
  sup: [1.3, 0.6, 1.0, 1.0, 1.3, 0.8],
};
const BASE_TOTAL: Record<Rarity, number> = { Common: 310, Rare: 400, Epic: 490, Legendary: 560, Secret: 600, '???': 640 };
const TOTAL_OVERRIDE: Record<number, number> = { 160: 540, 161: 560, 162: 480, 163: 520, 164: 560, 165: 600 };
const CAPTURE_RATE: Record<Rarity, number> = { Common: 190, Rare: 120, Epic: 60, Legendary: 25, Secret: 10, '???': 3 };
const SIGNATURE_POWER: Record<Rarity, number> = { Common: 60, Rare: 75, Epic: 90, Legendary: 105, Secret: 115, '???': 125 };
const SIGNATURE_LEVEL: Record<Rarity, number> = { Common: 6, Rare: 10, Epic: 16, Legendary: 24, Secret: 30, '???': 36 };
const SPECIAL_TYPES = new Set<TypeName>(['fire', 'water', 'electric', 'ice', 'psychic', 'fairy', 'dragon']);
const STATS: StatKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];

export const totalOf = (num: number, rarity: Rarity): number => TOTAL_OVERRIDE[num] ?? BASE_TOTAL[rarity];
export const captureRateOf = (rarity: Rarity): number => CAPTURE_RATE[rarity];

export function buildStats(role: Role, total: number): Stats {
  const [hp, atk, def, spa, spd, spe] = WEIGHTS[role].map((weight) => Math.round((total / 6) * weight));
  return { hp, atk, def, spa, spd, spe };
}

export function isSpecialAttacker(role: Role, firstType: TypeName): boolean {
  if (role === 'can' || role === 'mag' || role === 'wal' || role === 'sup') return true;
  return role === 'bal' && SPECIAL_TYPES.has(firstType);
}

// ---------- 설계표 ----------

const KNOWN_TRAITS = new Set([
  'pri', 'crit', 'rec', 'hit2', 'hit3', 'flin', 'ovr', 'low', 'rev', 'pun', 'pct', 'dly', 'cha', 'piv', 'trp', 'conf',
  'gam', 'drn', 'brn', 'par', 'psn', 'slp', 'heal', 'shield', 'cleanse',
  ...STATS.flatMap((s) => [`up_${s}`, `dn_${s}`, `up2_${s}`, `dn2_${s}`]),
]);

export function parseDesign(text: string): DesignEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [num, name, t1, t2, role, sig, traitText, sigType] = line.split('|');
      const types = [t1, t2].filter((code) => code !== '-').map((code) => {
        if (!TYPE_CODES[code]) throw new Error(`알 수 없는 타입 ${code}: ${line}`);
        return TYPE_CODES[code];
      });
      if (!ROLES.includes(role as Role)) throw new Error(`알 수 없는 역할 ${role}: ${line}`);
      const status = traitText.startsWith('!');
      const traits = traitText.replace('!', '').split('+');
      for (const trait of traits) {
        if (trait !== 'n' && !KNOWN_TRAITS.has(trait)) throw new Error(`알 수 없는 효과 ${trait}: ${line}`);
      }
      return {
        num: Number(num), name, types, role: role as Role, sig, status,
        traits: traits.filter((trait) => trait !== 'n'),
        sigType: sigType ? TYPE_CODES[sigType] : undefined,
      };
    });
}

// ---------- 공용 기술 ----------

const TIER_NAMES: Record<TypeName, [string, string, string, string]> = {
  normal: ['박치기', '돌진', '강타', '전력 질주'],
  fire: ['불씨 튀기기', '열풍', '화염탄', '대폭염'],
  water: ['물방울', '파도 타기', '물대포', '해일'],
  electric: ['전기 톡', '번개 구슬', '방전', '낙뢰'],
  grass: ['잎사귀', '덩굴 채찍', '잎날 칼', '숲의 분노'],
  ice: ['서리', '얼음 조각', '눈보라', '절대영도'],
  fighting: ['주먹질', '연타', '승천 주먹', '파괴 권'],
  poison: ['독침', '산성 액', '독 안개', '독 폭풍'],
  ground: ['모래 던지기', '흙 달리기', '지진', '대지 붕괴'],
  flying: ['날갯짓', '돌풍', '급강하', '폭풍 낙하'],
  psychic: ['염동', '환영', '정신 파동', '심연 투시'],
  bug: ['실 뿜기', '가시 침', '군집 공격', '벌레 쓰나미'],
  rock: ['자갈', '바위 낙하', '암석 포격', '산사태'],
  ghost: ['오싹', '그림자', '저주 손길', '유령 폭발'],
  dragon: ['용의 숨', '용 발톱', '용의 분노', '용성'],
  dark: ['어둠', '기습', '흑암 파동', '칠흑 폭발'],
  steel: ['철판', '강철 날개', '금속 폭풍', '거대 철퇴'],
  fairy: ['반짝이', '요정 가루', '달콤 폭탄', '요정 폭풍'],
};
const TIER_POWER = [40, 65, 85, 105];
const TIER_ACCURACY = [100, 100, 95, 90];
const TIER_LEARN_FIRST = [1, 12, 26, 42];
const TIER_LEARN_SECOND = [8, 20, 34];

/** 박치기(물리)와 마구 흔들기 */
export const TACKLE_ID = commonMoveId('normal', 1, false);
export const SHAKE_ID = 2;

export function commonMoveId(type: TypeName, tier: number, special: boolean): number {
  return 100 + TYPE_ORDER.indexOf(type) * 10 + tier + (special ? 4 : 0);
}

export function commonMove(type: TypeName, tier: number, special: boolean): Move {
  const effects: MoveEffect[] = [];
  if (tier === 1 && type === 'fire') effects.push({ kind: 'status', status: 'burn', chance: 10 });
  if (tier === 1 && type === 'electric') effects.push({ kind: 'status', status: 'paralysis', chance: 10 });
  if (tier === 1 && type === 'poison') effects.push({ kind: 'status', status: 'poison', chance: 30 });
  return {
    id: commonMoveId(type, tier, special),
    name: TIER_NAMES[type][tier - 1],
    type,
    category: special ? 'special' : 'physical',
    power: TIER_POWER[tier - 1],
    accuracy: TIER_ACCURACY[tier - 1],
    priority: type === 'dark' && tier === 2 ? 1 : 0,
    effects,
  };
}

export function shakeMove(): Move {
  return { id: SHAKE_ID, name: '마구 흔들기', type: 'normal', category: 'physical', power: 40, accuracy: 100, priority: 0, effects: [] };
}

// ---------- 고유 기술 ----------

const POWER_MULTIPLIER: Record<string, number> = {
  pri: 0.7, crit: 0.9, rec: 1.25, hit2: 0.6, hit3: 0.4, flin: 0.9, ovr: 1.3, rev: 0.8, pun: 0.9,
  dly: 1.3, cha: 1.8, piv: 0.8, trp: 0.8,
};
for (const stat of STATS) {
  POWER_MULTIPLIER[`up_${stat}`] = 0.85;
  POWER_MULTIPLIER[`dn_${stat}`] = 0.9;
}

const STATUS_OF: Record<string, 'burn' | 'paralysis' | 'poison' | 'sleep'> = {
  brn: 'burn', par: 'paralysis', psn: 'poison', slp: 'sleep',
};

function attackEffects(trait: string, special: boolean): MoveEffect[] {
  if (trait === 'crit') return [{ kind: 'crit' }];
  if (trait === 'rec') return [{ kind: 'recoil', ratio: 0.25 }];
  if (trait === 'hit2') return [{ kind: 'multiHit', hits: 2 }];
  if (trait === 'hit3') return [{ kind: 'multiHit', hits: 3 }];
  if (trait === 'flin') return [{ kind: 'flinch', chance: 30 }];
  if (trait === 'ovr') return [{ kind: 'stage', target: 'self', stat: special ? 'spa' : 'atk', delta: -1, chance: 100 }];
  if (trait === 'low') return [{ kind: 'lowHp' }];
  if (trait === 'rev') return [{ kind: 'revenge' }];
  if (trait === 'pun') return [{ kind: 'punish' }];
  if (trait === 'pct') return [{ kind: 'percent', ratio: 0.35 }];
  if (trait === 'dly') return [{ kind: 'delayed' }];
  if (trait === 'cha') return [{ kind: 'charge' }];
  if (trait === 'piv') return [{ kind: 'pivot' }];
  if (trait === 'trp') return [{ kind: 'trap', turns: 3 }];
  if (trait === 'conf') return [{ kind: 'confuse', chance: 30 }];
  if (trait === 'gam') return [{ kind: 'gamble', min: 0.4, max: 1.6 }];
  if (trait === 'drn') return [{ kind: 'drain', ratio: 0.5 }];
  if (STATUS_OF[trait]) return [{ kind: 'status', status: STATUS_OF[trait], chance: trait === 'slp' ? 20 : 30 }];
  const stage = /^(up|dn)_(atk|def|spa|spd|spe)$/.exec(trait);
  if (stage) {
    const up = stage[1] === 'up';
    return [{ kind: 'stage', target: up ? 'self' : 'foe', stat: stage[2] as StatKey, delta: up ? 1 : -1, chance: up ? 100 : 50 }];
  }
  return [];
}

function statusEffects(trait: string): MoveEffect[] {
  if (trait === 'heal') return [{ kind: 'heal', ratio: 0.5 }];
  if (trait === 'shield') return [{ kind: 'shield' }];
  if (trait === 'cleanse') return [{ kind: 'cleanse', healRatio: 0.25 }];
  if (trait === 'conf') return [{ kind: 'confuse', chance: 100 }];
  if (STATUS_OF[trait]) return [{ kind: 'status', status: STATUS_OF[trait], chance: 100 }];
  const stage = /^(up2|dn2)_(atk|def|spa|spd|spe)$/.exec(trait);
  if (stage) {
    const up = stage[1] === 'up2';
    return [{ kind: 'stage', target: up ? 'self' : 'foe', stat: stage[2] as StatKey, delta: up ? 2 : -2, chance: 100 }];
  }
  return [];
}

const nearest5 = (value: number) => Math.round(value / 5) * 5;
export const signatureId = (num: number) => 1000 + num;

export function signatureMove(entry: DesignEntry, rarity: Rarity): Move {
  const special = isSpecialAttacker(entry.role, entry.types[0]);
  const type = entry.sigType ?? entry.types[0];
  if (entry.status) {
    const effects = entry.traits.flatMap(statusEffects);
    const accuracy = effects.some((e) => e.kind === 'heal' || e.kind === 'shield' || e.kind === 'cleanse' ||
      (e.kind === 'stage' && e.target === 'self')) ? 0 : entry.traits.some((t) => STATUS_OF[t] || t === 'conf') ? 75 : 100;
    return { id: signatureId(entry.num), name: entry.sig, type, category: 'status', power: 0, accuracy, priority: 0, effects };
  }
  const multiplier = entry.traits.reduce((product, trait) => product * (POWER_MULTIPLIER[trait] ?? 1), 1);
  const base = SIGNATURE_POWER[rarity];
  const noScaling = entry.traits.includes('gam') || entry.traits.includes('pct');
  const power = noScaling ? base : nearest5(base * multiplier);
  const hard = entry.traits.includes('pct') || power >= 105;
  return {
    id: signatureId(entry.num),
    name: entry.sig,
    type,
    category: special ? 'special' : 'physical',
    power,
    accuracy: hard ? 90 : 100,
    priority: entry.traits.includes('pri') ? 1 : 0,
    effects: entry.traits.flatMap((trait) => attackEffects(trait, special)),
  };
}

// ---------- 습득 목록 ----------

export function buildLearnset(entry: DesignEntry, rarity: Rarity): LearnEntry[] {
  const special = isSpecialAttacker(entry.role, entry.types[0]);
  const [first, second] = entry.types;
  const list: LearnEntry[] = [{ level: 1, moveId: TACKLE_ID }];
  list.push({ level: 1, moveId: first === 'normal' ? SHAKE_ID : commonMoveId(first, 1, special) });
  for (let tier = 2; tier <= 4; tier++) list.push({ level: TIER_LEARN_FIRST[tier - 1], moveId: commonMoveId(first, tier, special) });
  if (second) {
    for (let tier = 1; tier <= 3; tier++) list.push({ level: TIER_LEARN_SECOND[tier - 1], moveId: commonMoveId(second, tier, special) });
  }
  list.push({ level: SIGNATURE_LEVEL[rarity], moveId: signatureId(entry.num) });

  const seen = new Set<number>();
  return list
    .sort((a, b) => a.level - b.level)
    .filter((e) => !seen.has(e.moveId) && seen.add(e.moveId));
}
```

위에서 `TACKLE_ID`가 `commonMoveId`보다 먼저 쓰이면 함수 선언 호이스팅으로 동작하지만 `TYPE_ORDER` 상수가 이미 정의돼 있어야 한다. 파일 순서는 위와 같이 유지한다.

- [ ] **Step 5: `scripts/build-oddies.ts` 구현과 데이터 생성**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import type { Rarity, Species } from '../src/data/types.ts';
import type { Move } from '../src/engine/types.ts';
import {
  buildLearnset, buildStats, captureRateOf, commonMove, isSpecialAttacker, parseDesign, shakeMove, signatureId,
  signatureMove, totalOf,
} from './oddie-design.ts';

interface Meta { id: string; name: string; region: string; rarity: Rarity }

const meta: Meta[] = JSON.parse(readFileSync('design/oddies.meta.json', 'utf8'));
const entries = parseDesign(readFileSync('design/oddies.psv', 'utf8'));
if (entries.length !== meta.length) throw new Error(`설계표 ${entries.length}줄, 메타 ${meta.length}줄`);

const TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const;

const moves: Record<number, Move> = { 2: shakeMove() };
for (const type of TYPES) {
  for (const tier of [1, 2, 3, 4]) {
    for (const special of [false, true]) {
      const move = commonMove(type, tier, special);
      moves[move.id] = move;
    }
  }
}

const species: Species[] = entries.map((entry, index) => {
  const info = meta[index];
  if (info.id !== `OD-${String(entry.num).padStart(3, '0')}` || info.name !== entry.name) {
    throw new Error(`설계표와 메타가 어긋남: ${entry.num} ${entry.name} / ${info.id} ${info.name}`);
  }
  const move = signatureMove(entry, info.rarity);
  moves[move.id] = move;
  return {
    id: entry.num,
    name: entry.name,
    types: entry.types,
    baseStats: buildStats(entry.role, totalOf(entry.num, info.rarity)),
    learnset: buildLearnset(entry, info.rarity),
    region: info.region,
    rarity: info.rarity,
    role: entry.role,
    captureRate: captureRateOf(info.rarity),
    signatureMoveId: signatureId(entry.num),
  };
});

writeFileSync('src/data/species.json', JSON.stringify(species));
writeFileSync('src/data/moves.json', JSON.stringify(moves));
console.log(`오디 ${species.length}종, 기술 ${Object.keys(moves).length}개 저장 (물리/특수 판정 ${entries.filter((e) => isSpecialAttacker(e.role, e.types[0])).length}종이 특수)`);
```

`package.json`의 `data` 스크립트를 `"data": "tsx scripts/build-oddies.ts"`로 바꾼다. `scripts/convert.ts`, `scripts/convert.test.ts`, `scripts/build-data.ts`를 지운다.

Run: `npm run data` / Expected: `오디 165종, 기술 N개 저장` (N은 2 + 144 + 165 = 311)

- [ ] **Step 6: 데이터 로딩과 팩토리 테스트를 맞춘다**

`src/data/index.ts`는 그대로 두되 `Species` 타입 변경으로 컴파일이 되는지 확인한다. `src/game/factory.test.ts`의 `species` 객체에 새 필드를 넣는다.

```ts
  region: 'Meadow', rarity: 'Common', role: 'bal', captureRate: 190, signatureMoveId: 1,
```

그 테스트에서 `tackle({ id: 1 })` 대신 쓰는 `moves` 객체의 모양은 그대로이다.

- [ ] **Step 7: 통과 확인**

Run: `npm test`, `npx tsc --noEmit` / Expected: 전부 통과. `src/ui`가 아직 `speciesById(4)` 같은 포켓몬 번호를 쓰므로 타입은 통과하지만 화면 동작은 Task 7에서 고친다.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 오디 165종 데이터 생성, 포켓몬 데이터 제거"
```

---

### Task 7: 앱을 오디로 연결하고 포켓몬 자산 제거

**Files:**
- Create: `src/ui/OddieArt.tsx`
- Modify: `src/App.tsx`, `src/ui/StarterScreen.tsx`, `src/ui/BattleScreen.tsx`, `src/ui/app.css`
- Delete: `public/sprites/` 폴더 전체
- Test: `src/ui/oddieArt.test.ts`

**Interfaces:**
- Consumes: Task 5, 6 전체
- Produces: `typeColor(type: TypeName): string`, `<OddieArt name types size />`

3D 모델이 준비되기 전까지 오디 그림은 타입 색 카드로 대신한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/ui/oddieArt.test.ts`:

```ts
import { expect, test } from 'vitest';
import { typeColor } from './OddieArt.tsx';

test('모든 타입에 색이 있다', () => {
  for (const type of ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'] as const) {
    expect(typeColor(type)).toMatch(/^#[0-9a-f]{6}$/);
  }
});
```

- [ ] **Step 2: 구현**

`src/ui/OddieArt.tsx`:

```tsx
import type { TypeName } from '../engine/types.ts';

const COLORS: Record<TypeName, string> = {
  normal: '#b8b8a8', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8',
  fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac',
};

export function typeColor(type: TypeName): string {
  return COLORS[type];
}

interface Props {
  name: string;
  types: TypeName[];
  size?: number;
}

/** 3D 모델이 오기 전의 임시 그림. 타입 색 카드에 이름 앞 두 글자를 보여 준다 */
export function OddieArt({ name, types, size = 96 }: Props) {
  const first = typeColor(types[0]);
  const second = typeColor(types[1] ?? types[0]);
  return (
    <div
      className="oddie-art"
      role="img"
      aria-label={name}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${first}, ${second})` }}
    >
      {name.slice(0, 2)}
    </div>
  );
}
```

`src/ui/app.css` 끝에 추가한다.

```css
.oddie-art {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--line);
  border-radius: 16px;
  color: #fff;
  font-size: 1.4rem;
  font-weight: 800;
  text-shadow: 0 1px 3px #0008;
}
```

`src/ui/StarterScreen.tsx`를 다음으로 바꾼다.

```tsx
import { speciesById } from '../data/index.ts';
import { OddieArt } from './OddieArt.tsx';

const STARTERS = [1, 42, 107];

export function StarterScreen({ onPick }: { onPick: (speciesId: number) => void }) {
  return (
    <main className="screen">
      <h1>함께할 오디를 골라줘!</h1>
      <div className="starters">
        {STARTERS.map((id) => {
          const species = speciesById(id);
          return (
            <button key={id} className="starter" onClick={() => onPick(id)}>
              <OddieArt name={species.name} types={species.types} />
              {species.name}
            </button>
          );
        })}
      </div>
    </main>
  );
}
```

`src/ui/BattleScreen.tsx`에서 `spriteUrl` 함수와 `<img className="sprite" ...>`를 지우고, `Fighter`의 이미지 자리에 `<OddieArt name={pokemon.name} types={pokemon.types} size={96} />`를 넣는다(`import { OddieArt } from './OddieArt.tsx'`).

`src/App.tsx`를 오디 기준으로 바꾼다. 야생 후보는 초원 흔함 오디로 한다.

```tsx
const PLAYER_LEVEL = 10;
const WILD_IDS = [2, 3, 4];
```

푸터 문구는 `「Catch an Oddie」의 캐릭터로 만든 학교 활동 게임입니다.`로 바꾼다.

`public/sprites/` 폴더를 지운다.

```bash
git rm -r public/sprites
```

- [ ] **Step 3: 검증**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` / Expected: 오류 없음

`grep -ri "pokemon\|포켓몬" src docs/superpowers/plans/2026-11-02-oddie-engine-and-data.md` 결과에 설명 문장이나 테스트의 옛 변수 이름이 남으면 오디 기준 이름으로 바꾼다. 작업 기록 안의 문구는 둔다.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: 앱을 오디 데이터로 연결, 포켓몬 이미지 제거"
```

- [ ] **Step 5: 브라우저 검증**

컨트롤러가 내장 브라우저에서 375px로 확인한다. 스타터 3종(Pippo, Emberi, Bubblit) 카드가 보이고, 하나를 고르면 전투가 시작되며, 기술 버튼에 이름과 위력이 나오고, 끝까지 싸울 수 있고, 가로 스크롤과 콘솔 오류가 없다. 고유 기술이 효과 문구와 함께 동작하는지(Emberi의 급소와 화상, Pippo의 속도 하락)도 확인한다.

- [ ] **Step 6: 배포 여부는 사용자 확인 후**

기존 공개 저장소의 기록에는 이미 포켓몬 이미지가 들어 있다. 새 코드를 같은 저장소에 push할지, 저장소를 새로 만들어 기록 없이 올릴지는 사용자와 정한 뒤에 한다. 정해지기 전에는 push하지 않는다.

---

## 이 계획 이후

- **월드 시제품:** Three.js로 3D 맵, 캐릭터 이동, 오디 배회, 접근해서 결투 신청, 배틀 화면 전환. 오디 모델은 `art/raw`의 결과를 Blender로 줄인 파일을 쓴다.
- **성장과 포획, 저장:** 이전 `phase2-growth.md`의 경험치, 레벨업, 로프 포획, 상점, 가입과 저장 규칙을 오디 기준으로 다시 쓴다.
- **친구 대전:** `phase1-followups.md`의 「3단계 전」 항목과 합친다.
