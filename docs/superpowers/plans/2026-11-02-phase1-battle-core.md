# 1단계: 데이터·배틀 엔진·전투 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰 브라우저에서 스타터를 골라 NPC와 전투 한 판을 끝까지 할 수 있게 만든다.

**Architecture:** `src/engine`은 화면, 네트워크, JSON 데이터에 의존하지 않는 순수 TypeScript다. 전투 상태 안에 기술 객체가 통째로 들어 있어 엔진이 데이터 파일을 읽지 않으며, 3단계에서 같은 코드를 Supabase Edge Function(Deno)에서 실행한다. 그래서 엔진 안의 import는 `.ts` 확장자를 붙인다.

**Tech Stack:** React, TypeScript, Vite, Vitest, tsx, PokeAPI(빌드 시점만)

**Spec:** `docs/superpowers/specs/2026-11-02-pokemon-battle-game-design.md`

## Global Constraints

- 게임 실행 중에는 PokeAPI를 호출하지 않는다. 데이터와 이미지는 빌드 전에 받아 저장소에 넣는다.
- 도감 1~151번. 타입과 종족값은 PokeAPI 현재 값.
- 능력치는 종족값과 레벨로만 계산한다. 개체값, 노력치, 성격, 특성, PP, 능력치 랭크 변화는 없다.
- 구현 효과는 일반 공격, 독, 화상, 마비, 수면, 흡수, 회복뿐이다.
- 배틀 엔진의 모든 난수는 `state.rngState`에서 나온다. `Math.random`과 `Date` 금지.
- 화면 문구는 한글. 폰 세로 화면(375px)에서 가로 스크롤이 없어야 한다.
- 화면 하단에 비공식 팬 게임 표시를 넣는다.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/engine/types.ts` | 전투 타입 정의 |
| `src/engine/rng.ts` | 시드 난수 |
| `src/engine/typeChart.ts` | 타입 상성 |
| `src/engine/stats.ts` | 능력치 계산 |
| `src/engine/damage.ts` | 데미지 계산 |
| `src/engine/turn.ts` | 턴 처리, 강제 교체, 합법 행동 검사 |
| `src/engine/ai.ts` | NPC 행동 선택 |
| `src/engine/testkit.ts` | 테스트용 포켓몬, 기술 생성 |
| `scripts/convert.ts` | PokeAPI 응답을 게임 데이터로 변환 |
| `scripts/build-data.ts` | 내려받기와 파일 저장 |
| `src/data/types.ts`, `src/data/index.ts` | 데이터 타입과 로딩 |
| `src/game/factory.ts` | 종과 레벨로 전투용 포켓몬, 전투 생성 |
| `src/ui/*` | 전투 화면 |

---

### Task 1: 프로젝트 초기화

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `npm test`, `npm run build`, `npm run dev`, `npm run data`

- [ ] **Step 1: 이 폴더에 별도 git 저장소 만들기**

홈 폴더 전체가 git 저장소이므로 이 폴더에 따로 만든다. 프로젝트 폴더에서 실행한다.

```bash
git init -b main
```

- [ ] **Step 2: 설정 파일 작성**

`package.json`:

```json
{
  "name": "pokemon-battle",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host",
    "test": "vitest run",
    "data": "tsx scripts/build-data.ts"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "scripts"]
}
```

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/pokemon-battle/',
  plugins: [react()],
  test: { environment: 'node' },
});
```

`.gitignore`:

```
node_modules
dist
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>포켓몬 키우고 배틀</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return <h1>포켓몬 키우고 배틀</h1>;
}
```

`src/smoke.test.ts`:

```ts
import { expect, test } from 'vitest';

test('테스트 환경이 동작한다', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 3: 패키지 설치**

```bash
npm install react react-dom
```

```bash
npm install -D typescript vite vitest tsx @vitejs/plugin-react @types/react @types/react-dom @types/node
```

- [ ] **Step 4: 검증**

Run: `npm test` / Expected: 1 passed
Run: `npm run build` / Expected: `dist/` 생성, 오류 없음

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: 프로젝트 초기화"
```

---

### Task 2: 엔진 타입, 난수, 타입 상성, 능력치

**Files:**
- Create: `src/engine/types.ts`, `src/engine/rng.ts`, `src/engine/typeChart.ts`, `src/engine/stats.ts`, `src/engine/testkit.ts`
- Test: `src/engine/basics.test.ts`
- Delete: `src/smoke.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: 아래 코드의 모든 타입, `createRng(seed): Rng`, `typeEffectiveness(moveType, defenderTypes): number`, `calcStats(base, level): Stats`, `mon(overrides)`, `tackle(overrides)`, `battle(a, b, seed?)`

- [ ] **Step 1: 타입 작성**

`src/engine/types.ts`:

```ts
export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type Status = 'poison' | 'burn' | 'paralysis' | 'sleep';

export type MoveEffect =
  | { kind: 'none' }
  | { kind: 'status'; status: Status; chance: number }
  | { kind: 'drain'; ratio: number }
  | { kind: 'heal'; ratio: number };

export interface Move {
  id: number;
  name: string;
  type: TypeName;
  category: 'physical' | 'special' | 'status';
  power: number;
  /** 0이면 반드시 명중 */
  accuracy: number;
  priority: number;
  effect: MoveEffect;
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
}

export interface Side {
  team: BattlePokemon[];
  active: number;
}

export type SideIndex = 0 | 1;

export interface BattleState {
  sides: [Side, Side];
  turn: number;
  winner: SideIndex | null;
  rngState: number;
  pendingSwitch: [boolean, boolean];
}

export type Action =
  | { kind: 'move'; moveIndex: number }
  | { kind: 'switch'; teamIndex: number };

export type BattleEvent =
  | { t: 'switch'; side: SideIndex; teamIndex: number; name: string; hp: number }
  | { t: 'move'; side: SideIndex; name: string; moveName: string }
  | { t: 'miss'; side: SideIndex }
  | { t: 'noEffect'; side: SideIndex }
  | { t: 'damage'; side: SideIndex; amount: number; hp: number; effectiveness: number; critical: boolean }
  | { t: 'heal'; side: SideIndex; name: string; amount: number; hp: number }
  | { t: 'status'; side: SideIndex; name: string; status: Status }
  | { t: 'statusDamage'; side: SideIndex; name: string; status: Status; amount: number; hp: number }
  | { t: 'cantMove'; side: SideIndex; name: string; reason: 'sleep' | 'paralysis' }
  | { t: 'wake'; side: SideIndex; name: string }
  | { t: 'faint'; side: SideIndex; name: string }
  | { t: 'win'; side: SideIndex };

export interface TurnResult {
  state: BattleState;
  events: BattleEvent[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/smoke.test.ts`를 지우고 `src/engine/basics.test.ts`를 만든다.

```ts
import { describe, expect, test } from 'vitest';
import { createRng } from './rng.ts';
import { calcStats } from './stats.ts';
import { typeEffectiveness } from './typeChart.ts';

describe('createRng', () => {
  test('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  test('저장한 state에서 이어가면 같은 수가 나온다', () => {
    const a = createRng(7);
    a.next();
    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  test('int는 양 끝을 포함한 범위 안의 값을 준다', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(85, 100);
      expect(n).toBeGreaterThanOrEqual(85);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});

describe('typeEffectiveness', () => {
  test('약점, 반감, 무효, 복합 타입', () => {
    expect(typeEffectiveness('water', ['fire'])).toBe(2);
    expect(typeEffectiveness('water', ['grass'])).toBe(0.5);
    expect(typeEffectiveness('electric', ['ground'])).toBe(0);
    expect(typeEffectiveness('normal', ['fire'])).toBe(1);
    expect(typeEffectiveness('electric', ['water', 'flying'])).toBe(4);
    expect(typeEffectiveness('ground', ['fire', 'flying'])).toBe(0);
  });
});

describe('calcStats', () => {
  test('레벨 50 피카츄의 종족값 계산', () => {
    const stats = calcStats({ hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 }, 50);
    expect(stats).toEqual({ hp: 95, atk: 60, def: 45, spa: 55, spd: 55, spe: 95 });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test` / Expected: FAIL, `./rng.ts`를 찾지 못함

- [ ] **Step 4: 구현**

`src/engine/rng.ts`:

```ts
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    get state() {
      return s;
    },
  };
}
```

`src/engine/typeChart.ts`:

```ts
import type { TypeName } from './types.ts';

interface Matchup {
  strong: TypeName[];
  weak: TypeName[];
  immune: TypeName[];
}

const CHART: Record<TypeName, Matchup> = {
  normal: { strong: [], weak: ['rock', 'steel'], immune: ['ghost'] },
  fire: { strong: ['grass', 'ice', 'bug', 'steel'], weak: ['fire', 'water', 'rock', 'dragon'], immune: [] },
  water: { strong: ['fire', 'ground', 'rock'], weak: ['water', 'grass', 'dragon'], immune: [] },
  electric: { strong: ['water', 'flying'], weak: ['electric', 'grass', 'dragon'], immune: ['ground'] },
  grass: { strong: ['water', 'ground', 'rock'], weak: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'], immune: [] },
  ice: { strong: ['grass', 'ground', 'flying', 'dragon'], weak: ['fire', 'water', 'ice', 'steel'], immune: [] },
  fighting: { strong: ['normal', 'ice', 'rock', 'dark', 'steel'], weak: ['poison', 'flying', 'psychic', 'bug', 'fairy'], immune: ['ghost'] },
  poison: { strong: ['grass', 'fairy'], weak: ['poison', 'ground', 'rock', 'ghost'], immune: ['steel'] },
  ground: { strong: ['fire', 'electric', 'poison', 'rock', 'steel'], weak: ['grass', 'bug'], immune: ['flying'] },
  flying: { strong: ['grass', 'fighting', 'bug'], weak: ['electric', 'rock', 'steel'], immune: [] },
  psychic: { strong: ['fighting', 'poison'], weak: ['psychic', 'steel'], immune: ['dark'] },
  bug: { strong: ['grass', 'psychic', 'dark'], weak: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'], immune: [] },
  rock: { strong: ['fire', 'ice', 'flying', 'bug'], weak: ['fighting', 'ground', 'steel'], immune: [] },
  ghost: { strong: ['psychic', 'ghost'], weak: ['dark'], immune: ['normal'] },
  dragon: { strong: ['dragon'], weak: ['steel'], immune: ['fairy'] },
  dark: { strong: ['psychic', 'ghost'], weak: ['fighting', 'dark', 'fairy'], immune: [] },
  steel: { strong: ['ice', 'rock', 'fairy'], weak: ['fire', 'water', 'electric', 'steel'], immune: [] },
  fairy: { strong: ['fighting', 'dragon', 'dark'], weak: ['fire', 'poison', 'steel'], immune: [] },
};

export function typeEffectiveness(moveType: TypeName, defenderTypes: TypeName[]): number {
  const { strong, weak, immune } = CHART[moveType];
  return defenderTypes.reduce((multiplier, type) => {
    if (immune.includes(type)) return 0;
    if (strong.includes(type)) return multiplier * 2;
    if (weak.includes(type)) return multiplier * 0.5;
    return multiplier;
  }, 1);
}
```

`src/engine/stats.ts`:

```ts
import type { Stats } from './types.ts';

export function calcStats(base: Stats, level: number): Stats {
  const other = (value: number) => Math.floor((2 * value * level) / 100) + 5;
  return {
    hp: Math.floor((2 * base.hp * level) / 100) + level + 10,
    atk: other(base.atk),
    def: other(base.def),
    spa: other(base.spa),
    spd: other(base.spd),
    spe: other(base.spe),
  };
}
```

`src/engine/testkit.ts`:

```ts
import type { BattlePokemon, BattleState, Move } from './types.ts';

export function tackle(overrides: Partial<Move> = {}): Move {
  return {
    id: 33,
    name: '몸통박치기',
    type: 'normal',
    category: 'physical',
    power: 40,
    accuracy: 0,
    priority: 0,
    effect: { kind: 'none' },
    ...overrides,
  };
}

export function mon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    speciesId: 1,
    name: '테스트몬',
    level: 50,
    types: ['normal'],
    stats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
    hp: 100,
    status: null,
    sleepTurns: 0,
    moves: [tackle()],
    ...overrides,
  };
}

export function battle(a: BattlePokemon[], b: BattlePokemon[], seed = 1): BattleState {
  return {
    sides: [{ team: a, active: 0 }, { team: b, active: 0 }],
    turn: 1,
    winner: null,
    rngState: seed,
    pendingSwitch: [false, false],
  };
}
```

- [ ] **Step 5: 통과 확인**

Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 엔진 타입, 난수, 타입 상성, 능력치"
```

---

### Task 3: 데미지 계산

**Files:**
- Create: `src/engine/damage.ts`
- Test: `src/engine/damage.test.ts`

**Interfaces:**
- Consumes: `BattlePokemon`, `Move`, `Rng`, `typeEffectiveness`
- Produces: `computeDamage(attacker, defender, move, rng): DamageResult`, `DamageResult = { damage: number; effectiveness: number; critical: boolean }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/damage.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { computeDamage } from './damage.ts';
import type { Rng } from './rng.ts';
import { mon, tackle } from './testkit.ts';

/** 급소 없음, 난수 최대(100%)로 고정 */
const noCrit: Rng = { next: () => 0, int: (_min, max) => max, chance: () => false, state: 0 };
const alwaysCrit: Rng = { ...noCrit, chance: () => true };

const fighter = mon({ types: ['ground'] });
const target = mon({ types: ['ground'] });
const hit = tackle({ power: 80 });

describe('computeDamage', () => {
  test('기본 공식: 레벨 50, 위력 80, 공방 같음', () => {
    expect(computeDamage(fighter, target, hit, noCrit).damage).toBe(37);
  });

  test('자속 보정 1.5배', () => {
    const attacker = mon({ types: ['normal'] });
    expect(computeDamage(attacker, target, hit, noCrit).damage).toBe(55);
  });

  test('타입 약점 2배', () => {
    const result = computeDamage(fighter, mon({ types: ['ice'] }), tackle({ power: 80, type: 'fire' }), noCrit);
    expect(result).toEqual({ damage: 74, effectiveness: 2, critical: false });
  });

  test('무효면 0', () => {
    const result = computeDamage(fighter, target, tackle({ power: 80, type: 'electric' }), noCrit);
    expect(result).toEqual({ damage: 0, effectiveness: 0, critical: false });
  });

  test('화상은 물리 공격만 반감', () => {
    const burned = mon({ types: ['ground'], status: 'burn' });
    expect(computeDamage(burned, target, hit, noCrit).damage).toBe(18);
    expect(computeDamage(burned, target, tackle({ power: 80, category: 'special' }), noCrit).damage).toBe(37);
  });

  test('특수기는 특공과 특방을 쓴다', () => {
    const smart = mon({ types: ['ground'], stats: { hp: 100, atk: 1, def: 100, spa: 200, spd: 100, spe: 100 } });
    expect(computeDamage(smart, target, tackle({ power: 80, category: 'special' }), noCrit).damage).toBe(72);
  });

  test('급소 1.5배', () => {
    const result = computeDamage(fighter, target, hit, alwaysCrit);
    expect(result.damage).toBe(55);
    expect(result.critical).toBe(true);
  });

  test('최소 1', () => {
    const weak = mon({ types: ['ground'], level: 1, stats: { hp: 10, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } });
    const wall = mon({ types: ['ground'], stats: { hp: 100, atk: 1, def: 500, spa: 1, spd: 1, spe: 1 } });
    expect(computeDamage(weak, wall, tackle({ power: 10, type: 'rock' }), noCrit).damage).toBeGreaterThanOrEqual(1);
  });
});
```

검산: `floor(floor(22 × 80 × 100 / 100) / 50) + 2 = 37`. 자속 `floor(55.5) = 55`, 화상 `floor(18.5) = 18`, 특공 200은 `floor(3520 / 50) + 2 = 72`.

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL, `./damage.ts`를 찾지 못함

- [ ] **Step 3: 구현**

`src/engine/damage.ts`:

```ts
import type { Rng } from './rng.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { BattlePokemon, Move } from './types.ts';

const CRITICAL_CHANCE = 1 / 24;

export interface DamageResult {
  damage: number;
  effectiveness: number;
  critical: boolean;
}

export function computeDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  rng: Rng,
): DamageResult {
  const effectiveness = typeEffectiveness(move.type, defender.types);
  if (effectiveness === 0) return { damage: 0, effectiveness: 0, critical: false };

  const physical = move.category === 'physical';
  const attack = physical ? attacker.stats.atk : attacker.stats.spa;
  const defense = physical ? defender.stats.def : defender.stats.spd;
  const levelFactor = Math.floor((2 * attacker.level) / 5 + 2);
  const base = Math.floor(Math.floor((levelFactor * move.power * attack) / defense) / 50) + 2;

  const critical = rng.chance(CRITICAL_CHANCE);
  let damage = base * (critical ? 1.5 : 1) * (rng.int(85, 100) / 100);
  if (attacker.types.includes(move.type)) damage *= 1.5;
  damage *= effectiveness;
  if (physical && attacker.status === 'burn') damage *= 0.5;

  return { damage: Math.max(1, Math.floor(damage)), effectiveness, critical };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 데미지 계산"
```

---

### Task 4: 턴 처리

**Files:**
- Create: `src/engine/turn.ts`
- Test: `src/engine/turn.test.ts`

**Interfaces:**
- Consumes: `computeDamage`, `createRng`, 전투 타입
- Produces:
  - `resolveTurn(state, actions: [Action, Action]): TurnResult`
  - `resolveForcedSwitch(state, side, teamIndex): TurnResult`
  - `isLegalAction(state, side, action): boolean`
  - `activeOf(state, side): BattlePokemon`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/turn.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { battle, mon, tackle } from './testkit.ts';
import { activeOf, isLegalAction, resolveForcedSwitch, resolveTurn } from './turn.ts';
import type { Action, BattleState } from './types.ts';

const useMove: Action = { kind: 'move', moveIndex: 0 };
const fast = (spe: number) => ({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe });
const ko = tackle({ power: 500 });

function moveOrder(events: ReturnType<typeof resolveTurn>['events']) {
  return events.filter((e) => e.t === 'move').map((e) => e.side);
}

describe('행동 순서', () => {
  test('스피드가 빠른 쪽이 먼저 움직인다', () => {
    const state = battle([mon({ stats: fast(50) })], [mon({ stats: fast(150) })]);
    expect(moveOrder(resolveTurn(state, [useMove, useMove]).events)).toEqual([1, 0]);
  });

  test('선공 기술이 스피드보다 우선한다', () => {
    const slow = mon({ stats: fast(10), moves: [tackle({ priority: 1 })] });
    const state = battle([slow], [mon({ stats: fast(200) })]);
    expect(moveOrder(resolveTurn(state, [useMove, useMove]).events)).toEqual([0, 1]);
  });

  test('마비는 스피드를 절반으로 만든다', () => {
    const state = battle(
      [mon({ stats: fast(100), status: 'paralysis' })],
      [mon({ stats: fast(60) })],
      3,
    );
    expect(moveOrder(resolveTurn(state, [useMove, useMove]).events)[0]).toBe(1);
  });

  test('교체는 기술보다 먼저 일어난다', () => {
    const state = battle([mon({ stats: fast(1) }), mon({ name: '후보' })], [mon({ stats: fast(200) })]);
    const { events, state: next } = resolveTurn(state, [{ kind: 'switch', teamIndex: 1 }, useMove]);
    expect(events[0].t).toBe('switch');
    expect(next.sides[0].active).toBe(1);
  });
});

describe('공격과 쓰러짐', () => {
  test('입력 상태를 바꾸지 않는다', () => {
    const state = battle([mon()], [mon()]);
    const before = JSON.stringify(state);
    resolveTurn(state, [useMove, useMove]);
    expect(JSON.stringify(state)).toBe(before);
  });

  test('쓰러진 포켓몬은 행동하지 않고, 후보가 없으면 승패가 난다', () => {
    const state = battle([mon({ stats: fast(200), moves: [ko] })], [mon({ stats: fast(1) })]);
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    expect(moveOrder(events)).toEqual([0]);
    expect(next.winner).toBe(0);
    expect(events.at(-1)).toEqual({ t: 'win', side: 0 });
  });

  test('후보가 있으면 강제 교체를 기다린다', () => {
    const state = battle([mon({ stats: fast(200), moves: [ko] })], [mon(), mon({ name: '후보' })]);
    const { state: next } = resolveTurn(state, [useMove, useMove]);
    expect(next.winner).toBeNull();
    expect(next.pendingSwitch).toEqual([false, true]);

    const after = resolveForcedSwitch(next, 1, 1);
    expect(activeOf(after.state, 1).name).toBe('후보');
    expect(after.state.pendingSwitch).toEqual([false, false]);
  });
});

describe('상태이상', () => {
  test('독과 화상은 턴 끝에 데미지를 준다', () => {
    const poisoned = battle(
      [mon({ status: 'poison', moves: [tackle({ power: 0, category: 'status' })] })],
      [mon({ moves: [tackle({ power: 0, category: 'status' })] })],
    );
    expect(resolveTurn(poisoned, [useMove, useMove]).state.sides[0].team[0].hp).toBe(88);

    const burned = battle(
      [mon({ status: 'burn', moves: [tackle({ power: 0, category: 'status' })] })],
      [mon({ moves: [tackle({ power: 0, category: 'status' })] })],
    );
    expect(resolveTurn(burned, [useMove, useMove]).state.sides[0].team[0].hp).toBe(94);
  });

  test('수면 중에는 움직이지 못하고 시간이 지나면 깬다', () => {
    let state: BattleState = battle([mon({ status: 'sleep', sleepTurns: 1 })], [mon({ moves: [tackle({ power: 1 })] })]);
    const first = resolveTurn(state, [useMove, useMove]);
    expect(first.events.some((e) => e.t === 'cantMove' && e.side === 0)).toBe(true);
    state = first.state;

    const second = resolveTurn(state, [useMove, useMove]);
    expect(second.events.some((e) => e.t === 'wake' && e.side === 0)).toBe(true);
    expect(moveOrder(second.events)).toContain(0);
  });

  test('독 타입은 독에 걸리지 않는다', () => {
    const toxic = tackle({ category: 'status', power: 0, effect: { kind: 'status', status: 'poison', chance: 100 } });
    const state = battle([mon({ moves: [toxic] })], [mon({ types: ['poison'] })]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[1].team[0].status).toBeNull();
  });

  test('수면 기술은 대상을 재운다', () => {
    const sleepMove = tackle({ category: 'status', power: 0, effect: { kind: 'status', status: 'sleep', chance: 100 } });
    const state = battle([mon({ stats: fast(200), moves: [sleepMove] })], [mon()]);
    const target = resolveTurn(state, [useMove, useMove]).state.sides[1].team[0];
    expect(target.status).toBe('sleep');
  });
});

describe('회복과 흡수', () => {
  test('회복은 최대 HP를 넘지 않는다', () => {
    const heal = tackle({ category: 'status', power: 0, effect: { kind: 'heal', ratio: 0.5 } });
    const state = battle([mon({ hp: 80, moves: [heal] })], [mon({ moves: [tackle({ power: 0, category: 'status' })] })]);
    expect(resolveTurn(state, [useMove, useMove]).state.sides[0].team[0].hp).toBe(100);
  });

  test('흡수는 준 데미지의 비율만큼 회복한다', () => {
    const drain = tackle({ power: 80, type: 'rock', effect: { kind: 'drain', ratio: 0.5 } });
    const state = battle(
      [mon({ hp: 10, stats: fast(200), moves: [drain] })],
      [mon({ moves: [tackle({ power: 0, category: 'status' })] })],
    );
    const { state: next, events } = resolveTurn(state, [useMove, useMove]);
    const damage = events.find((e) => e.t === 'damage');
    if (damage?.t !== 'damage') throw new Error('damage 이벤트 없음');
    expect(next.sides[0].team[0].hp).toBe(10 + Math.floor(damage.amount * 0.5));
  });
});

describe('결정성과 합법성', () => {
  test('같은 시드면 결과가 같다', () => {
    const state = battle([mon()], [mon()], 99);
    expect(resolveTurn(state, [useMove, useMove])).toEqual(resolveTurn(state, [useMove, useMove]));
  });

  test('isLegalAction', () => {
    const state = battle([mon(), mon({ hp: 0 }), mon()], [mon()]);
    expect(isLegalAction(state, 0, { kind: 'move', moveIndex: 0 })).toBe(true);
    expect(isLegalAction(state, 0, { kind: 'move', moveIndex: 3 })).toBe(false);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 0 })).toBe(false);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 1 })).toBe(false);
    expect(isLegalAction(state, 0, { kind: 'switch', teamIndex: 2 })).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL, `./turn.ts`를 찾지 못함

- [ ] **Step 3: 구현**

`src/engine/turn.ts`:

```ts
import { computeDamage } from './damage.ts';
import { createRng, type Rng } from './rng.ts';
import type {
  Action, BattleEvent, BattlePokemon, BattleState, Move, SideIndex, Status, TurnResult, TypeName,
} from './types.ts';

const STATUS_IMMUNITY: Partial<Record<Status, TypeName[]>> = {
  poison: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
};

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

export function activeOf(state: BattleState, side: SideIndex): BattlePokemon {
  const { team, active } = state.sides[side];
  return team[active];
}

export function isLegalAction(state: BattleState, side: SideIndex, action: Action): boolean {
  if (action.kind === 'move') {
    return action.moveIndex >= 0 && action.moveIndex < activeOf(state, side).moves.length;
  }
  const { team, active } = state.sides[side];
  const target = team[action.teamIndex];
  return action.teamIndex !== active && target !== undefined && target.hp > 0;
}

function effectiveSpeed(pokemon: BattlePokemon): number {
  return pokemon.status === 'paralysis' ? Math.floor(pokemon.stats.spe / 2) : pokemon.stats.spe;
}

function actionPriority(state: BattleState, side: SideIndex, action: Action): number {
  if (action.kind === 'switch') return 100;
  return activeOf(state, side).moves[action.moveIndex].priority;
}

function actionOrder(state: BattleState, actions: [Action, Action], rng: Rng): [SideIndex, SideIndex] {
  const priorityGap = actionPriority(state, 0, actions[0]) - actionPriority(state, 1, actions[1]);
  if (priorityGap !== 0) return priorityGap > 0 ? [0, 1] : [1, 0];
  const speedGap = effectiveSpeed(activeOf(state, 0)) - effectiveSpeed(activeOf(state, 1));
  if (speedGap !== 0) return speedGap > 0 ? [0, 1] : [1, 0];
  return rng.chance(0.5) ? [0, 1] : [1, 0];
}

function switchIn(state: BattleState, side: SideIndex, teamIndex: number, events: BattleEvent[]) {
  state.sides[side].active = teamIndex;
  const pokemon = activeOf(state, side);
  events.push({ t: 'switch', side, teamIndex, name: pokemon.name, hp: pokemon.hp });
}

/** 턴 시작 전에 움직일 수 있는지 판단한다 */
function canAct(pokemon: BattlePokemon, side: SideIndex, rng: Rng, events: BattleEvent[]): boolean {
  if (pokemon.status === 'sleep') {
    if (pokemon.sleepTurns > 0) {
      pokemon.sleepTurns -= 1;
      events.push({ t: 'cantMove', side, name: pokemon.name, reason: 'sleep' });
      return false;
    }
    pokemon.status = null;
    events.push({ t: 'wake', side, name: pokemon.name });
  }
  if (pokemon.status === 'paralysis' && rng.chance(0.25)) {
    events.push({ t: 'cantMove', side, name: pokemon.name, reason: 'paralysis' });
    return false;
  }
  return true;
}

function applyStatus(target: BattlePokemon, side: SideIndex, status: Status, rng: Rng, events: BattleEvent[]): boolean {
  if (target.hp <= 0 || target.status !== null) return false;
  if (STATUS_IMMUNITY[status]?.some((type) => target.types.includes(type))) return false;
  target.status = status;
  if (status === 'sleep') target.sleepTurns = rng.int(1, 3);
  events.push({ t: 'status', side, name: target.name, status });
  return true;
}

function heal(pokemon: BattlePokemon, side: SideIndex, amount: number, events: BattleEvent[]): boolean {
  const healed = Math.min(amount, pokemon.stats.hp - pokemon.hp);
  if (healed <= 0) return false;
  pokemon.hp += healed;
  events.push({ t: 'heal', side, name: pokemon.name, amount: healed, hp: pokemon.hp });
  return true;
}

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
    const { effect } = move;
    const worked =
      (effect.kind === 'heal' && heal(attacker, side, Math.floor(attacker.stats.hp * effect.ratio), events)) ||
      (effect.kind === 'status' && applyStatus(defender, targetSide, effect.status, rng, events));
    if (!worked && effect.kind !== 'none') events.push({ t: 'noEffect', side });
    return;
  }

  const { damage, effectiveness, critical } = computeDamage(attacker, defender, move, rng);
  if (effectiveness === 0) {
    events.push({ t: 'noEffect', side });
    return;
  }
  const dealt = Math.min(damage, defender.hp);
  defender.hp -= dealt;
  events.push({ t: 'damage', side: targetSide, amount: dealt, hp: defender.hp, effectiveness, critical });

  if (defender.hp <= 0) events.push({ t: 'faint', side: targetSide, name: defender.name });
  if (move.effect.kind === 'drain') heal(attacker, side, Math.floor(dealt * move.effect.ratio), events);
  if (move.effect.kind === 'status' && rng.int(1, 100) <= move.effect.chance) {
    applyStatus(defender, targetSide, move.effect.status, rng, events);
  }
}

function endOfTurnDamage(state: BattleState, side: SideIndex, events: BattleEvent[]) {
  const pokemon = activeOf(state, side);
  if (pokemon.hp <= 0 || (pokemon.status !== 'poison' && pokemon.status !== 'burn')) return;
  const divisor = pokemon.status === 'poison' ? 8 : 16;
  const amount = Math.min(Math.max(1, Math.floor(pokemon.stats.hp / divisor)), pokemon.hp);
  pokemon.hp -= amount;
  events.push({ t: 'statusDamage', side, name: pokemon.name, status: pokemon.status, amount, hp: pokemon.hp });
  if (pokemon.hp <= 0) events.push({ t: 'faint', side, name: pokemon.name });
}

function hasLivingPokemon(state: BattleState, side: SideIndex): boolean {
  return state.sides[side].team.some((pokemon) => pokemon.hp > 0);
}

function settleFaints(state: BattleState, rng: Rng, events: BattleEvent[]) {
  const alive = [hasLivingPokemon(state, 0), hasLivingPokemon(state, 1)];
  if (!alive[0] || !alive[1]) {
    const winner: SideIndex = alive[0] ? 0 : alive[1] ? 1 : rng.chance(0.5) ? 0 : 1;
    state.winner = winner;
    events.push({ t: 'win', side: winner });
    return;
  }
  state.pendingSwitch = [activeOf(state, 0).hp <= 0, activeOf(state, 1).hp <= 0];
}

export function resolveTurn(previous: BattleState, actions: [Action, Action]): TurnResult {
  const state = structuredClone(previous);
  const rng = createRng(state.rngState);
  const events: BattleEvent[] = [];

  for (const side of actionOrder(state, actions, rng)) {
    const action = actions[side];
    if (action.kind === 'switch') {
      switchIn(state, side, action.teamIndex, events);
      continue;
    }
    const attacker = activeOf(state, side);
    if (attacker.hp <= 0 || activeOf(state, other(side)).hp <= 0) continue;
    if (canAct(attacker, side, rng, events)) {
      executeMove(state, side, attacker.moves[action.moveIndex], rng, events);
    }
  }

  endOfTurnDamage(state, 0, events);
  endOfTurnDamage(state, 1, events);
  settleFaints(state, rng, events);
  state.turn += 1;
  state.rngState = rng.state;
  return { state, events };
}

export function resolveForcedSwitch(previous: BattleState, side: SideIndex, teamIndex: number): TurnResult {
  const state = structuredClone(previous);
  const events: BattleEvent[] = [];
  switchIn(state, side, teamIndex, events);
  state.pendingSwitch[side] = false;
  return { state, events };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 턴 처리와 상태이상"
```

---

### Task 5: NPC AI

**Files:**
- Create: `src/engine/ai.ts`
- Test: `src/engine/ai.test.ts`

**Interfaces:**
- Consumes: `activeOf`, `typeEffectiveness`, 전투 타입
- Produces: `chooseAiAction(state, side): Action`, `chooseAiSwitch(state, side): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/engine/ai.test.ts`:

```ts
import { expect, test } from 'vitest';
import { chooseAiAction, chooseAiSwitch } from './ai.ts';
import { battle, mon, tackle } from './testkit.ts';

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
  const spore = tackle({ category: 'status', power: 0, effect: { kind: 'status', status: 'sleep', chance: 100 } });
  const pound = tackle({ type: 'rock', power: 20 });
  const state = battle([mon()], [mon({ moves: [pound, spore] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 1 });
});

test('이미 상태이상이면 상태 기술을 쓰지 않는다', () => {
  const spore = tackle({ category: 'status', power: 0, effect: { kind: 'status', status: 'sleep', chance: 100 } });
  const pound = tackle({ type: 'rock', power: 20 });
  const state = battle([mon({ status: 'burn' })], [mon({ moves: [pound, spore] })]);
  expect(chooseAiAction(state, 1)).toEqual({ kind: 'move', moveIndex: 0 });
});

test('강제 교체는 살아 있는 첫 포켓몬을 고른다', () => {
  const state = battle([mon()], [mon({ hp: 0 }), mon({ hp: 0 }), mon()]);
  expect(chooseAiSwitch(state, 1)).toBe(2);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL, `./ai.ts`를 찾지 못함

- [ ] **Step 3: 구현**

`src/engine/ai.ts`:

```ts
import { activeOf } from './turn.ts';
import { typeEffectiveness } from './typeChart.ts';
import type { Action, BattlePokemon, BattleState, Move, SideIndex } from './types.ts';

const STATUS_MOVE_SCORE = 60;

function scoreMove(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  if (move.category === 'status') {
    if (move.effect.kind === 'status') return defender.status === null ? STATUS_MOVE_SCORE : 0;
    if (move.effect.kind === 'heal') return attacker.hp * 2 < attacker.stats.hp ? STATUS_MOVE_SCORE : 0;
    return 0;
  }
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const accuracy = move.accuracy === 0 ? 1 : move.accuracy / 100;
  return move.power * stab * accuracy * typeEffectiveness(move.type, defender.types);
}

export function chooseAiAction(state: BattleState, side: SideIndex): Action {
  const attacker = activeOf(state, side);
  const defender = activeOf(state, side === 0 ? 1 : 0);
  let moveIndex = 0;
  let best = -1;
  attacker.moves.forEach((move, index) => {
    const score = scoreMove(attacker, defender, move);
    if (score > best) {
      best = score;
      moveIndex = index;
    }
  });
  return { kind: 'move', moveIndex };
}

export function chooseAiSwitch(state: BattleState, side: SideIndex): number {
  return state.sides[side].team.findIndex((pokemon) => pokemon.hp > 0);
}
```

검산: 세 번째 테스트에서 바위 기술 위력 20은 점수 20, 상태 기술은 60. 네 번째는 20 대 0이다.

- [ ] **Step 4: 통과 확인**

Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: NPC AI"
```

---

### Task 6: 포켓몬 데이터 생성

**Files:**
- Create: `scripts/convert.ts`, `scripts/build-data.ts`, `src/data/types.ts`, `src/data/index.ts`, `src/game/factory.ts`
- Generate: `src/data/species.json`, `src/data/moves.json`, `public/sprites/front/*.png`, `public/sprites/back/*.png`
- Test: `scripts/convert.test.ts`, `src/data/data.test.ts`, `src/game/factory.test.ts`

**Interfaces:**
- Consumes: `Move`, `Stats`, `TypeName`, `calcStats`, `BattlePokemon`, `BattleState`
- Produces:
  - `Species = { id; name; types: TypeName[]; baseStats: Stats; learnset: { level: number; moveId: number }[] }`
  - `SPECIES: Species[]`, `MOVES: Record<number, Move>`, `speciesById(id): Species`
  - `toMove(raw): Move | null`, `toSpecies(pokemon, speciesRaw, knownMoveIds): Species`
  - `createBattlePokemon(species, level, moves): BattlePokemon`, `createBattle(teamA, teamB, seed): BattleState`

- [ ] **Step 1: 데이터 타입 작성**

`src/data/types.ts`:

```ts
import type { Stats, TypeName } from '../engine/types.ts';

export interface LearnEntry {
  level: number;
  moveId: number;
}

export interface Species {
  id: number;
  name: string;
  types: TypeName[];
  baseStats: Stats;
  learnset: LearnEntry[];
}
```

- [ ] **Step 2: 변환 테스트 작성**

`scripts/convert.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { toMove, toSpecies, type RawMove, type RawPokemon } from './convert.ts';

function rawMove(overrides: Partial<RawMove> = {}): RawMove {
  return {
    id: 1,
    power: 40,
    accuracy: 100,
    priority: 0,
    type: { name: 'normal' },
    damage_class: { name: 'physical' },
    names: [{ language: { name: 'ko' }, name: '막치기' }],
    meta: { category: { name: 'damage' }, ailment: { name: 'none' }, ailment_chance: 0, drain: 0, healing: 0 },
    ...overrides,
  };
}

const meta = (changes: Partial<RawMove['meta'] & object>) => ({ ...rawMove().meta!, ...changes });

describe('toMove', () => {
  test('일반 공격', () => {
    expect(toMove(rawMove())).toEqual({
      id: 1, name: '막치기', type: 'normal', category: 'physical',
      power: 40, accuracy: 100, priority: 0, effect: { kind: 'none' },
    });
  });

  test('랭크 변화가 붙은 공격은 일반 공격으로 쓴다', () => {
    const move = toMove(rawMove({ meta: meta({ category: { name: 'damage+lower' } }) }));
    expect(move?.effect).toEqual({ kind: 'none' });
  });

  test('추가 상태이상', () => {
    const move = toMove(rawMove({ meta: meta({ category: { name: 'damage+ailment' }, ailment: { name: 'burn' }, ailment_chance: 10 }) }));
    expect(move?.effect).toEqual({ kind: 'status', status: 'burn', chance: 10 });
  });

  test('흡수', () => {
    const move = toMove(rawMove({ meta: meta({ category: { name: 'damage+heal' }, drain: 50 }) }));
    expect(move?.effect).toEqual({ kind: 'drain', ratio: 0.5 });
  });

  test('상태 기술: 재우기와 회복', () => {
    const sleep = toMove(rawMove({
      power: null, damage_class: { name: 'status' },
      meta: meta({ category: { name: 'ailment' }, ailment: { name: 'sleep' } }),
    }));
    expect(sleep?.effect).toEqual({ kind: 'status', status: 'sleep', chance: 100 });

    const recover = toMove(rawMove({
      power: null, damage_class: { name: 'status' },
      meta: meta({ category: { name: 'heal' }, healing: 50 }),
    }));
    expect(recover?.effect).toEqual({ kind: 'heal', ratio: 0.5 });
  });

  test('구현 범위 밖의 기술은 null', () => {
    expect(toMove(rawMove({ power: null, damage_class: { name: 'status' }, meta: meta({ category: { name: 'net-good-stats' } }) }))).toBeNull();
    expect(toMove(rawMove({ meta: meta({ category: { name: 'ohko' } }) }))).toBeNull();
    expect(toMove(rawMove({ id: 153 }))).toBeNull();
    expect(toMove(rawMove({ power: null }))).toBeNull();
    expect(toMove(rawMove({ meta: null }))).toBeNull();
  });

  test('accuracy가 null이면 반드시 명중(0)', () => {
    expect(toMove(rawMove({ accuracy: null }))?.accuracy).toBe(0);
  });
});

describe('toSpecies', () => {
  const pokemon: RawPokemon = {
    id: 25,
    types: [{ type: { name: 'electric' } }],
    stats: [
      { base_stat: 35, stat: { name: 'hp' } },
      { base_stat: 55, stat: { name: 'attack' } },
      { base_stat: 40, stat: { name: 'defense' } },
      { base_stat: 50, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } },
      { base_stat: 90, stat: { name: 'speed' } },
    ],
    moves: [
      { move: { url: 'https://pokeapi.co/api/v2/move/84/' }, version_group_details: [{ level_learned_at: 1, version_group: { name: 'red-blue' }, move_learn_method: { name: 'level-up' } }] },
      { move: { url: 'https://pokeapi.co/api/v2/move/85/' }, version_group_details: [{ level_learned_at: 26, version_group: { name: 'red-blue' }, move_learn_method: { name: 'level-up' } }] },
      { move: { url: 'https://pokeapi.co/api/v2/move/86/' }, version_group_details: [{ level_learned_at: 9, version_group: { name: 'red-blue' }, move_learn_method: { name: 'level-up' } }] },
      { move: { url: 'https://pokeapi.co/api/v2/move/87/' }, version_group_details: [{ level_learned_at: 43, version_group: { name: 'gold-silver' }, move_learn_method: { name: 'level-up' } }] },
      { move: { url: 'https://pokeapi.co/api/v2/move/25/' }, version_group_details: [{ level_learned_at: 0, version_group: { name: 'red-blue' }, move_learn_method: { name: 'machine' } }] },
    ],
  };
  const speciesRaw = { names: [{ language: { name: 'ko' }, name: '피카츄' }] };

  test('레벨순 습득 목록을 만들고 구현 안 된 기술과 다른 세대를 뺀다', () => {
    const species = toSpecies(pokemon, speciesRaw, new Set([84, 85, 33]));
    expect(species.name).toBe('피카츄');
    expect(species.learnset).toEqual([{ level: 1, moveId: 84 }, { level: 26, moveId: 85 }]);
    expect(species.baseStats).toEqual({ hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 });
  });

  test('초반 기술이 없으면 몸통박치기를 레벨 1에 준다', () => {
    const species = toSpecies(pokemon, speciesRaw, new Set([85]));
    expect(species.learnset[0]).toEqual({ level: 1, moveId: 33 });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm test` / Expected: FAIL, `./convert.ts`를 찾지 못함

- [ ] **Step 4: 변환 구현**

`scripts/convert.ts`:

```ts
import type { Species } from '../src/data/types.ts';
import type { Move, MoveEffect, Stats, Status, TypeName } from '../src/engine/types.ts';

export interface RawName {
  language: { name: string };
  name: string;
}

export interface RawMove {
  id: number;
  power: number | null;
  accuracy: number | null;
  priority: number;
  type: { name: string };
  damage_class: { name: string };
  names: RawName[];
  meta: {
    category: { name: string };
    ailment: { name: string };
    ailment_chance: number;
    drain: number;
    healing: number;
  } | null;
}

export interface RawPokemon {
  id: number;
  types: { type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
  moves: {
    move: { url: string };
    version_group_details: {
      level_learned_at: number;
      version_group: { name: string };
      move_learn_method: { name: string };
    }[];
  }[];
}

export interface RawSpecies {
  names: RawName[];
}

export const TACKLE_ID = 33;
/** 자폭, 대폭발, 발버둥은 구현하지 않는다 */
const EXCLUDED_MOVE_IDS = new Set([120, 153, 165]);
const SUPPORTED_STATUSES: readonly string[] = ['poison', 'burn', 'paralysis', 'sleep'];

function koreanName(names: RawName[]): string | undefined {
  return names.find((entry) => entry.language.name === 'ko')?.name;
}

function moveEffect(raw: RawMove): MoveEffect | null {
  const meta = raw.meta!;
  const ailment = SUPPORTED_STATUSES.includes(meta.ailment.name) ? (meta.ailment.name as Status) : null;

  if (raw.damage_class.name === 'status') {
    if (meta.category.name === 'ailment' && ailment) {
      return { kind: 'status', status: ailment, chance: meta.ailment_chance || 100 };
    }
    if (meta.category.name === 'heal' && meta.healing > 0) return { kind: 'heal', ratio: meta.healing / 100 };
    return null;
  }

  if ((raw.power ?? 0) <= 0 || meta.category.name === 'ohko') return null;
  if (ailment && meta.ailment_chance > 0) return { kind: 'status', status: ailment, chance: meta.ailment_chance };
  if (meta.drain > 0) return { kind: 'drain', ratio: meta.drain / 100 };
  return { kind: 'none' };
}

export function toMove(raw: RawMove): Move | null {
  if (EXCLUDED_MOVE_IDS.has(raw.id) || raw.meta === null) return null;
  const name = koreanName(raw.names);
  const effect = moveEffect(raw);
  if (!name || !effect) return null;
  return {
    id: raw.id,
    name,
    type: raw.type.name as TypeName,
    category: raw.damage_class.name as Move['category'],
    power: raw.power ?? 0,
    accuracy: raw.accuracy ?? 0,
    priority: raw.priority,
    effect,
  };
}

function baseStats(raw: RawPokemon): Stats {
  const value = (name: string) => raw.stats.find((entry) => entry.stat.name === name)!.base_stat;
  return {
    hp: value('hp'),
    atk: value('attack'),
    def: value('defense'),
    spa: value('special-attack'),
    spd: value('special-defense'),
    spe: value('speed'),
  };
}

export function moveIdFromUrl(url: string): number {
  return Number(url.split('/').filter(Boolean).pop());
}

export function learnedMoveIds(raw: RawPokemon): { level: number; moveId: number }[] {
  return raw.moves.flatMap((entry) => {
    const detail = entry.version_group_details.find(
      (d) => d.version_group.name === 'red-blue' && d.move_learn_method.name === 'level-up',
    );
    return detail ? [{ level: detail.level_learned_at, moveId: moveIdFromUrl(entry.move.url) }] : [];
  });
}

export function toSpecies(raw: RawPokemon, species: RawSpecies, knownMoveIds: Set<number>): Species {
  const learnset = learnedMoveIds(raw)
    .filter((entry) => knownMoveIds.has(entry.moveId))
    .sort((a, b) => a.level - b.level);
  if (!learnset.some((entry) => entry.level <= 5)) learnset.unshift({ level: 1, moveId: TACKLE_ID });
  return {
    id: raw.id,
    name: koreanName(species.names)!,
    types: raw.types.map((entry) => entry.type.name as TypeName),
    baseStats: baseStats(raw),
    learnset,
  };
}
```

Run: `npm test` / Expected: `convert.test.ts` PASS

- [ ] **Step 5: 내려받기 스크립트 작성**

`scripts/build-data.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import {
  learnedMoveIds, TACKLE_ID, toMove, toSpecies, type RawMove, type RawPokemon, type RawSpecies,
} from './convert.ts';
import type { Move } from '../src/engine/types.ts';

const API = 'https://pokeapi.co/api/v2';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const COUNT = 151;
const BATCH_SIZE = 10;

async function inBatches<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    results.push(...(await Promise.all(items.slice(i, i + BATCH_SIZE).map(task))));
  }
  return results;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json() as Promise<T>;
}

async function saveSprite(url: string, path: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

const ids = Array.from({ length: COUNT }, (_, index) => index + 1);

const rawPokemon = await inBatches(ids, (id) => getJson<RawPokemon>(`${API}/pokemon/${id}`));
const rawSpecies = await inBatches(ids, (id) => getJson<RawSpecies>(`${API}/pokemon-species/${id}`));

const moveIds = [...new Set([TACKLE_ID, ...rawPokemon.flatMap((p) => learnedMoveIds(p).map((m) => m.moveId))])];
const rawMoves = await inBatches(moveIds, (id) => getJson<RawMove>(`${API}/move/${id}`));

const moves: Record<number, Move> = {};
for (const raw of rawMoves) {
  const move = toMove(raw);
  if (move) moves[move.id] = move;
}

const known = new Set(Object.keys(moves).map(Number));
const species = rawPokemon.map((pokemon, index) => toSpecies(pokemon, rawSpecies[index], known));

await writeFile('src/data/species.json', JSON.stringify(species));
await writeFile('src/data/moves.json', JSON.stringify(moves));

await mkdir('public/sprites/front', { recursive: true });
await mkdir('public/sprites/back', { recursive: true });
await inBatches(ids, async (id) => {
  await saveSprite(`${SPRITES}/${id}.png`, `public/sprites/front/${id}.png`);
  await saveSprite(`${SPRITES}/back/${id}.png`, `public/sprites/back/${id}.png`);
});

console.log(`포켓몬 ${species.length}마리, 기술 ${known.size}개 저장`);
```

- [ ] **Step 6: 데이터 생성**

Run: `npm run data` / Expected: `포켓몬 151마리, 기술 N개 저장` (N은 100 이상)

- [ ] **Step 7: 데이터, 팩토리 테스트 작성**

`src/data/data.test.ts`:

```ts
import { expect, test } from 'vitest';
import { MOVES, SPECIES, speciesById } from './index.ts';

test('151마리가 도감 순서대로 있다', () => {
  expect(SPECIES).toHaveLength(151);
  expect(SPECIES.map((s) => s.id)).toEqual(Array.from({ length: 151 }, (_, i) => i + 1));
});

test('모든 포켓몬이 한글 이름과 레벨 5 이하 기술을 가진다', () => {
  for (const species of SPECIES) {
    expect(species.name).toMatch(/[가-힣]/);
    expect(species.learnset.some((entry) => entry.level <= 5)).toBe(true);
    for (const entry of species.learnset) expect(MOVES[entry.moveId]).toBeDefined();
  }
});

test('대표 포켓몬 값이 맞다', () => {
  const pikachu = speciesById(25);
  expect(pikachu.name).toBe('피카츄');
  expect(pikachu.types).toEqual(['electric']);
  expect(pikachu.baseStats.spe).toBe(90);
});
```

`src/game/factory.test.ts`:

```ts
import { expect, test } from 'vitest';
import type { Species } from '../data/types.ts';
import { tackle } from '../engine/testkit.ts';
import { createBattle, createBattlePokemon } from './factory.ts';

const moves = {
  1: tackle({ id: 1 }), 2: tackle({ id: 2 }), 3: tackle({ id: 3 }),
  4: tackle({ id: 4 }), 5: tackle({ id: 5 }), 6: tackle({ id: 6 }),
};
const species: Species = {
  id: 25, name: '피카츄', types: ['electric'],
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
  learnset: [1, 5, 10, 15, 20, 30].map((level, index) => ({ level, moveId: index + 1 })),
};

test('레벨에 맞는 최근 기술 4개와 만피를 가진다', () => {
  const pokemon = createBattlePokemon(species, 20, moves);
  expect(pokemon.moves.map((m) => m.id)).toEqual([2, 3, 4, 5]);
  expect(pokemon.hp).toBe(pokemon.stats.hp);
  expect(pokemon.status).toBeNull();
});

test('createBattle은 첫 턴 상태를 만든다', () => {
  const pokemon = createBattlePokemon(species, 5, moves);
  const state = createBattle([pokemon], [pokemon], 42);
  expect(state).toMatchObject({ turn: 1, winner: null, rngState: 42, pendingSwitch: [false, false] });
});
```

- [ ] **Step 8: 실패 확인**

Run: `npm test` / Expected: FAIL, `./index.ts`, `./factory.ts`를 찾지 못함

- [ ] **Step 9: 구현**

`src/data/index.ts`:

```ts
import type { Move } from '../engine/types.ts';
import movesJson from './moves.json';
import speciesJson from './species.json';
import type { Species } from './types.ts';

export const SPECIES = speciesJson as unknown as Species[];
export const MOVES = movesJson as unknown as Record<number, Move>;

export function speciesById(id: number): Species {
  const species = SPECIES[id - 1];
  if (!species) throw new Error(`없는 도감 번호: ${id}`);
  return species;
}
```

`src/game/factory.ts`:

```ts
import type { Species } from '../data/types.ts';
import { calcStats } from '../engine/stats.ts';
import type { BattlePokemon, BattleState, Move } from '../engine/types.ts';

const MAX_MOVES = 4;

export function createBattlePokemon(
  species: Species,
  level: number,
  moves: Record<number, Move>,
): BattlePokemon {
  const stats = calcStats(species.baseStats, level);
  return {
    speciesId: species.id,
    name: species.name,
    level,
    types: species.types,
    stats,
    hp: stats.hp,
    status: null,
    sleepTurns: 0,
    moves: species.learnset
      .filter((entry) => entry.level <= level)
      .slice(-MAX_MOVES)
      .map((entry) => moves[entry.moveId]),
  };
}

export function createBattle(teamA: BattlePokemon[], teamB: BattlePokemon[], seed: number): BattleState {
  return {
    sides: [{ team: teamA, active: 0 }, { team: teamB, active: 0 }],
    turn: 1,
    winner: null,
    rngState: seed,
    pendingSwitch: [false, false],
  };
}
```

- [ ] **Step 10: 통과 확인**

Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: PokeAPI 데이터 생성과 전투 팩토리"
```

---

### Task 7: 전투 화면

**Files:**
- Create: `src/ui/messages.ts`, `src/ui/useBattle.ts`, `src/ui/BattleScreen.tsx`, `src/ui/StarterScreen.tsx`, `src/ui/app.css`
- Modify: `src/App.tsx`
- Test: `src/ui/messages.test.ts`

**Interfaces:**
- Consumes: `resolveTurn`, `resolveForcedSwitch`, `isLegalAction`, `activeOf`, `chooseAiAction`, `chooseAiSwitch`, `createBattlePokemon`, `createBattle`, `speciesById`, `MOVES`
- Produces: `eventMessage(event): string | null`, `useBattle(initial)`, `<BattleScreen initial onExit />`, `<StarterScreen onPick />`

플레이어는 항상 side 0, NPC는 side 1이다.

- [ ] **Step 1: 메시지 테스트 작성**

`src/ui/messages.test.ts`:

```ts
import { expect, test } from 'vitest';
import { eventMessage } from './messages.ts';

test('받침에 맞춰 조사를 고른다', () => {
  expect(eventMessage({ t: 'faint', side: 1, name: '피카츄' })).toBe('피카츄는 쓰러졌다!');
  expect(eventMessage({ t: 'faint', side: 1, name: '꼬부기' })).toBe('꼬부기는 쓰러졌다!');
  expect(eventMessage({ t: 'faint', side: 1, name: '파이리' })).toBe('파이리는 쓰러졌다!');
  expect(eventMessage({ t: 'faint', side: 1, name: '이상해꽃' })).toBe('이상해꽃은 쓰러졌다!');
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test` / Expected: FAIL, `./messages.ts`를 찾지 못함

- [ ] **Step 3: 메시지 구현**

`src/ui/messages.ts`:

```ts
import type { BattleEvent, Status } from '../engine/types.ts';

const STATUS_NAMES: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '수면' };

function eunNeun(name: string): string {
  const last = name.charCodeAt(name.length - 1) - 0xac00;
  const hasFinal = last >= 0 && last % 28 !== 0;
  return `${name}${hasFinal ? '은' : '는'}`;
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
    case 'switch': return `가랏, ${event.name}!`;
    case 'move': return `${event.name}의 ${event.moveName}!`;
    case 'miss': return '공격이 빗나갔다!';
    case 'noEffect': return '효과가 없는 듯하다...';
    case 'damage': return damageMessage(event.effectiveness, event.critical);
    case 'heal': return `${eunNeun(event.name)} 체력을 회복했다!`;
    case 'status': return `${eunNeun(event.name)} ${STATUS_NAMES[event.status]} 상태가 되었다!`;
    case 'statusDamage': return `${eunNeun(event.name)} ${STATUS_NAMES[event.status]} 때문에 데미지를 입었다!`;
    case 'cantMove': return event.reason === 'sleep' ? `${eunNeun(event.name)} 쿨쿨 자고 있다.` : `${eunNeun(event.name)} 몸이 저려서 움직일 수 없다!`;
    case 'wake': return `${eunNeun(event.name)} 눈을 떴다!`;
    case 'faint': return `${eunNeun(event.name)} 쓰러졌다!`;
    case 'win': return event.side === 0 ? '승리했다!' : '패배했다...';
  }
}
```

Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 4: 전투 진행 훅 구현**

`src/ui/useBattle.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseAiAction, chooseAiSwitch } from '../engine/ai.ts';
import { activeOf, resolveForcedSwitch, resolveTurn } from '../engine/turn.ts';
import type { Action, BattleEvent, BattleState, SideIndex, TurnResult } from '../engine/types.ts';
import { eventMessage } from './messages.ts';

const EVENT_DELAY_MS = 900;

/** 재생 중 화면에 보이는 값. 재생이 끝나면 전투 상태에서 다시 맞춘다 */
interface Shown {
  active: [number, number];
  hp: [number, number];
}

function shownFrom(state: BattleState): Shown {
  return {
    active: [state.sides[0].active, state.sides[1].active],
    hp: [activeOf(state, 0).hp, activeOf(state, 1).hp],
  };
}

function applyToShown(shown: Shown, event: BattleEvent): Shown {
  const next: Shown = { active: [...shown.active], hp: [...shown.hp] };
  if (event.t === 'switch') {
    next.active[event.side] = event.teamIndex;
    next.hp[event.side] = event.hp;
  }
  if (event.t === 'damage' || event.t === 'heal' || event.t === 'statusDamage') {
    // 흡수와 회복의 hp는 그 이벤트 side의 값이다
    next.hp[event.side] = event.hp;
  }
  return next;
}

export function useBattle(initial: BattleState) {
  const [state, setState] = useState(initial);
  const [shown, setShown] = useState(() => shownFrom(initial));
  const [message, setMessage] = useState('어떻게 할까?');
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** 이벤트를 순서대로 보여주고 끝나면 onDone을 부른다 */
  const play = useCallback((events: BattleEvent[], final: BattleState, onDone: () => void) => {
    setPlaying(true);
    let index = 0;
    const step = () => {
      if (index >= events.length) {
        setState(final);
        setShown(shownFrom(final));
        setPlaying(false);
        onDone();
        return;
      }
      const event = events[index++];
      setShown((current) => applyToShown(current, event));
      const text = eventMessage(event);
      if (text === null) {
        step();
        return;
      }
      setMessage(text);
      timer.current = setTimeout(step, EVENT_DELAY_MS);
    };
    step();
  }, []);

  /** NPC가 쓰러졌으면 교체까지 이어서 재생한다 */
  const finishTurn = useCallback((result: TurnResult) => {
    play(result.events, result.state, () => {
      if (result.state.winner !== null) return;
      if (result.state.pendingSwitch[1]) {
        const swap = resolveForcedSwitch(result.state, 1, chooseAiSwitch(result.state, 1));
        play(swap.events, swap.state, () => {
          setMessage(swap.state.pendingSwitch[0] ? '다음 포켓몬을 골라줘!' : '어떻게 할까?');
        });
        return;
      }
      setMessage(result.state.pendingSwitch[0] ? '다음 포켓몬을 골라줘!' : '어떻게 할까?');
    });
  }, [play]);

  const act = useCallback((action: Action) => {
    finishTurn(resolveTurn(state, [action, chooseAiAction(state, 1)]));
  }, [finishTurn, state]);

  const forceSwitch = useCallback((side: SideIndex, teamIndex: number) => {
    finishTurn(resolveForcedSwitch(state, side, teamIndex));
  }, [finishTurn, state]);

  return { state, shown, message, playing, act, forceSwitch };
}
```

- [ ] **Step 5: 화면 구현**

`src/ui/StarterScreen.tsx`:

```tsx
import { speciesById } from '../data/index.ts';

const STARTERS = [1, 4, 7];

export function StarterScreen({ onPick }: { onPick: (speciesId: number) => void }) {
  return (
    <main className="screen">
      <h1>함께할 포켓몬을 골라줘!</h1>
      <div className="starters">
        {STARTERS.map((id) => (
          <button key={id} className="starter" onClick={() => onPick(id)}>
            <img src={`${import.meta.env.BASE_URL}sprites/front/${id}.png`} alt="" />
            {speciesById(id).name}
          </button>
        ))}
      </div>
    </main>
  );
}
```

`src/ui/BattleScreen.tsx`:

```tsx
import { useState } from 'react';
import { isLegalAction } from '../engine/turn.ts';
import type { BattlePokemon, BattleState, Status } from '../engine/types.ts';
import { useBattle } from './useBattle.ts';

const STATUS_LABELS: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '수면' };

function spriteUrl(speciesId: number, view: 'front' | 'back') {
  return `${import.meta.env.BASE_URL}sprites/${view}/${speciesId}.png`;
}

function Fighter({ pokemon, hp, view }: { pokemon: BattlePokemon; hp: number; view: 'front' | 'back' }) {
  const percent = Math.round((hp / pokemon.stats.hp) * 100);
  return (
    <div className={`fighter fighter-${view}`}>
      <div className="plate">
        <div className="plate-name">
          {pokemon.name} <small>Lv.{pokemon.level}</small>
          {pokemon.status && <span className="status">{STATUS_LABELS[pokemon.status]}</span>}
        </div>
        <div className="hp-bar" role="progressbar" aria-valuenow={percent}>
          <div className={`hp-fill ${percent < 25 ? 'low' : ''}`} style={{ width: `${percent}%` }} />
        </div>
        {view === 'back' && <div className="hp-text">{hp} / {pokemon.stats.hp}</div>}
      </div>
      <img className="sprite" src={spriteUrl(pokemon.speciesId, view)} alt={pokemon.name} />
    </div>
  );
}

interface Props {
  initial: BattleState;
  onExit: () => void;
}

export function BattleScreen({ initial, onExit }: Props) {
  const { state, shown, message, playing, act, forceSwitch } = useBattle(initial);
  const [choosingSwitch, setChoosingSwitch] = useState(false);

  const player = state.sides[0];
  const opponent = state.sides[1];
  const mustSwitch = state.pendingSwitch[0];
  const over = state.winner !== null;
  const showTeam = (choosingSwitch || mustSwitch) && !over;

  const pickSwitch = (teamIndex: number) => {
    setChoosingSwitch(false);
    if (mustSwitch) forceSwitch(0, teamIndex);
    else act({ kind: 'switch', teamIndex });
  };

  return (
    <main className="screen battle">
      <div className="arena">
        <Fighter pokemon={opponent.team[shown.active[1]]} hp={shown.hp[1]} view="front" />
        <Fighter pokemon={player.team[shown.active[0]]} hp={shown.hp[0]} view="back" />
      </div>

      <p className="message" aria-live="polite">{message}</p>

      {over && !playing && <button className="wide" onClick={onExit}>처음으로</button>}

      {!over && !playing && !showTeam && (
        <div className="moves">
          {player.team[player.active].moves.map((move, moveIndex) => (
            <button key={move.id} className={`move type-${move.type}`} onClick={() => act({ kind: 'move', moveIndex })}>
              {move.name}
              <small>{move.category === 'status' ? '변화' : `위력 ${move.power}`}</small>
            </button>
          ))}
          {player.team.length > 1 && (
            <button className="wide" onClick={() => setChoosingSwitch(true)}>포켓몬 교체</button>
          )}
        </div>
      )}

      {!playing && showTeam && (
        <div className="team">
          {player.team.map((pokemon, teamIndex) => (
            <button
              key={teamIndex}
              disabled={!isLegalAction(state, 0, { kind: 'switch', teamIndex })}
              onClick={() => pickSwitch(teamIndex)}
            >
              {pokemon.name} ({pokemon.hp}/{pokemon.stats.hp})
            </button>
          ))}
          {!mustSwitch && <button onClick={() => setChoosingSwitch(false)}>취소</button>}
        </div>
      )}
    </main>
  );
}
```

`src/App.tsx`:

```tsx
import { useState } from 'react';
import { MOVES, speciesById } from './data/index.ts';
import type { BattleState } from './engine/types.ts';
import { createBattle, createBattlePokemon } from './game/factory.ts';
import { BattleScreen } from './ui/BattleScreen.tsx';
import { StarterScreen } from './ui/StarterScreen.tsx';
import './ui/app.css';

const PLAYER_LEVEL = 10;
const WILD_IDS = [16, 19, 25];

function startBattle(starterId: number): BattleState {
  const seed = Math.floor(Math.random() * 2 ** 32);
  const wildId = WILD_IDS[seed % WILD_IDS.length];
  const player = createBattlePokemon(speciesById(starterId), PLAYER_LEVEL, MOVES);
  const wild = createBattlePokemon(speciesById(wildId), PLAYER_LEVEL, MOVES);
  return createBattle([player], [wild], seed);
}

export default function App() {
  const [battle, setBattle] = useState<BattleState | null>(null);
  return (
    <>
      {battle
        ? <BattleScreen initial={battle} onExit={() => setBattle(null)} />
        : <StarterScreen onPick={(id) => setBattle(startBattle(id))} />}
      <footer>비영리 학교 활동으로 만든 비공식 팬 게임입니다. Pokémon의 권리는 원저작권자에게 있습니다.</footer>
    </>
  );
}
```

`src/ui/app.css`:

```css
:root {
  --bg: #f4f1e8;
  --panel: #ffffff;
  --ink: #23262b;
  --line: #23262b;
  --accent: #d94f3d;
  --hp: #3bb273;
  --hp-low: #e0523f;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, 'Malgun Gothic', sans-serif;
}

.screen {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
}

h1 { font-size: 1.3rem; text-align: center; }

button {
  min-height: 48px;
  padding: 8px;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

button:disabled { opacity: 0.4; cursor: not-allowed; }

.starters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.starter { display: flex; flex-direction: column; align-items: center; }
.starter img { width: 100%; max-width: 96px; image-rendering: pixelated; }

.arena {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: linear-gradient(#cfe8f5 55%, #bcdc9d 55%);
}

.fighter { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.fighter-back { flex-direction: row-reverse; }

.sprite { width: 112px; height: 112px; image-rendering: pixelated; }

.plate {
  flex: 1;
  min-width: 0;
  padding: 8px;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.plate-name { font-weight: 700; }
.status { margin-left: 6px; color: var(--accent); font-size: 0.8rem; }

.hp-bar {
  height: 10px;
  margin-top: 6px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 5px;
}

.hp-fill { height: 100%; background: var(--hp); transition: width 0.4s; }
.hp-fill.low { background: var(--hp-low); }
.hp-text { margin-top: 4px; text-align: right; font-size: 0.85rem; }

.message {
  min-height: 72px;
  margin: 12px 0;
  padding: 12px;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  line-height: 1.4;
}

.moves { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.move { display: flex; flex-direction: column; align-items: center; }
.move small { font-weight: 400; }
.wide { grid-column: 1 / -1; width: 100%; }
.team { display: grid; gap: 8px; }

footer {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  font-size: 0.75rem;
  text-align: center;
  opacity: 0.7;
}
```

- [ ] **Step 6: 자동 검증**

Run: `npm test` / Expected: 전부 PASS
Run: `npm run build` / Expected: 오류 없음

- [ ] **Step 7: 브라우저 검증**

`.claude/launch.json`에 `npm run dev`(포트 5173)를 등록하고 내장 브라우저로 연다. 주소는 `http://localhost:5173/pokemon-battle/`이다. 모바일 프리셋(375×812)에서 다음을 확인한다.

1. 스타터 3마리 이미지가 보인다.
2. 스타터를 고르면 전투가 시작되고 기술 버튼이 나온다.
3. 끝까지 싸우면 HP 바가 줄고 승패 문구 뒤에 `처음으로` 버튼이 나온다.
4. 가로 스크롤이 없다. 콘솔 오류가 없다.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 스타터 선택과 전투 화면"
```

---

### Task 8: GitHub Pages 배포

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run build`
- Produces: `https://reo-0407.github.io/pokemon-battle/`

무료 GitHub 계정의 Pages는 공개 저장소에서만 동작한다. **`gh repo create`와 push 전에 사용자에게 공개 저장소가 되어도 괜찮은지 확인한다.**

- [ ] **Step 1: 워크플로 작성**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: GitHub Pages 배포"
```

- [ ] **Step 3: 사용자 확인 후 저장소 생성과 push**

```bash
gh repo create pokemon-battle --public --source=. --push
```

```bash
gh api -X POST repos/Reo-0407/pokemon-battle/pages -f build_type=workflow
```

```bash
gh workflow run Deploy
```

- [ ] **Step 4: 실제 사이트 검증**

배포가 끝나면 내장 브라우저로 `https://reo-0407.github.io/pokemon-battle/`을 열어 전투 한 판을 끝까지 하고, 사용자 폰에서도 열어본다.

---

## 다음 단계 (각각 앞 단계가 끝난 뒤 별도 계획 작성)

- **2단계 `phase2-growth`:** 스타터 저장, 지역 8곳, 포획, 경험치, 기술 습득, 진화(`build-data`에 포획률, 진화 데이터 추가), 상점, 가입과 저장(Supabase 키 필요).
- **3단계 `phase3-online`:** DB 테이블과 권한, 서버 함수 5개, 방 코드, 실시간 대전, 재접속, 시간 제한. `src/engine`의 Deno 실행 방식은 이때 Supabase CLI로 확인한다.
- **4단계 `phase4-content`:** 체육관 8곳, 전설, 랭킹, 연출, 친구 테스트.
