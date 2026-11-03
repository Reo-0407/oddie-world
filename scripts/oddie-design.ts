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
// 기술 번호가 저장 데이터에 남으므로 순서를 고정한다
const TYPE_ORDER: TypeName[] = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];
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
    const tackles = [commonMoveId('normal', 1, false), commonMoveId('normal', 1, true)];
    for (let tier = 1; tier <= 3; tier++) {
      const moveId = commonMoveId(second, tier, special);
      if (!tackles.includes(moveId)) list.push({ level: TIER_LEARN_SECOND[tier - 1], moveId });
    }
  }
  list.push({ level: SIGNATURE_LEVEL[rarity], moveId: signatureId(entry.num) });

  const seen = new Set<number>();
  return list
    .sort((a, b) => a.level - b.level)
    .filter((e) => !seen.has(e.moveId) && seen.add(e.moveId));
}
