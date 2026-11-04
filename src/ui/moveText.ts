import type { Move, MoveEffect, Status, StatKey } from '../engine/types.ts';

const STATUS_NAMES: Record<Status, string> = { poison: '독', burn: '화상', paralysis: '마비', sleep: '수면' };
const STAT_NAMES: Record<StatKey, string> = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '속도' };
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** 효과 코드 → 한국어 한 줄 설명. 효과 종류를 추가하면 여기에 꼭 적는다(컴파일러가 알려 준다) */
const DESCRIBERS: { [K in MoveEffect['kind']]: (effect: Extract<MoveEffect, { kind: K }>) => string } = {
  status: (e) => `${e.chance}% 확률로 ${STATUS_NAMES[e.status]} 상태`,
  confuse: (e) => `${e.chance}% 확률로 혼란`,
  drain: (e) => `준 피해의 ${percent(e.ratio)}만큼 체력 회복`,
  heal: (e) => `최대 체력의 ${percent(e.ratio)} 회복`,
  recoil: (e) => `준 피해의 ${percent(e.ratio)}만큼 반동 피해`,
  crit: () => '급소에 맞기 쉬움',
  multiHit: (e) => `${e.hits}번 연속 공격`,
  flinch: (e) => `${e.chance}% 확률로 상대가 움찔함`,
  stage: (e) => {
    const who = e.target === 'self' ? '내' : '상대';
    const direction = e.delta > 0 ? '올림' : '내림';
    const amount = Math.abs(e.delta) >= 2 ? ' (크게)' : '';
    const chance = e.chance >= 100 ? '' : `${e.chance}% 확률로 `;
    return `${chance}${who} ${STAT_NAMES[e.stat]}을(를) ${direction}${amount}`;
  },
  lowHp: () => '내 체력이 낮을수록 위력 상승',
  revenge: () => '먼저 맞았다면 위력 2배',
  punish: () => '상대가 상태이상이면 위력 1.6배',
  percent: (e) => `상대 현재 체력의 ${percent(e.ratio)} 피해`,
  gamble: (e) => `위력이 ×${e.min}~×${e.max}로 들쭉날쭉`,
  delayed: () => '2턴 뒤에 공격이 닿음',
  charge: () => '한 턴 기운을 모은 뒤 공격',
  pivot: () => '공격 후 다른 오디와 교대',
  trap: (e) => `${e.turns}턴 동안 상대가 교체할 수 없음`,
  shield: () => '이번 턴 공격을 막음 (연속 사용하면 실패)',
  cleanse: (e) => `상태이상을 낫고 체력 ${percent(e.healRatio)} 회복`,
};

export function describeEffect(effect: MoveEffect): string {
  const describe = DESCRIBERS[effect.kind] as (e: MoveEffect) => string;
  return describe(effect);
}

export function describeEffects(move: Move): string[] {
  return move.effects.map(describeEffect);
}

/** 기술 버튼용 한 줄 요약 */
export function moveSummary(move: Move): string {
  const effects = describeEffects(move);
  return effects.length > 0 ? effects.join(' · ') : '추가 효과 없음';
}

export function powerText(move: Move): string {
  if (move.category === 'status') return '변화';
  if (move.effects.some((e) => e.kind === 'percent' || e.kind === 'gamble')) return '특수';
  return `위력 ${move.power}`;
}

const CATEGORY_NAMES = { physical: '물리', special: '특수', status: '변화' };

/** ⓘ 상세 설명 */
export function moveDetail(move: Move): string[] {
  const lines = [
    `${CATEGORY_NAMES[move.category]} · ${powerText(move)} · 명중 ${move.accuracy === 0 ? '필중' : move.accuracy}`,
  ];
  if (move.priority > 0) lines.push('먼저 움직인다');
  if (move.priority < 0) lines.push('나중에 움직인다');
  lines.push(...describeEffects(move));
  return lines;
}
