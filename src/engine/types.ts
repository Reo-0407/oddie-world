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
