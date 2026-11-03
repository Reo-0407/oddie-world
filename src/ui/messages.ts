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
