import type { Species } from '../data/types.ts';
import type { BattlePokemon, Move } from '../engine/types.ts';
import { createBattlePokemon } from '../game/factory.ts';
import type { TeamMemberSpec, TeamSpec } from './protocol.ts';

export const TEAM_SIZE = 3;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 50;
export const MAX_MOVES = 4;

export type ValidateResult = { ok: true; team: TeamSpec } | { ok: false; errors: string[] };

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/** 네트워크로 온 팀을 검사한다. 3마리, 레벨 1~50, 종이 있고, 기술은 배울 수 있는 것만 최대 4개(중복 없음) */
export function validateTeam(
  team: unknown, species: readonly Species[], moves: Record<number, Move>,
): ValidateResult {
  const errors: string[] = [];
  if (!Array.isArray(team)) return { ok: false, errors: ['팀이 배열이 아님'] };
  if (team.length !== TEAM_SIZE) errors.push(`팀은 ${TEAM_SIZE}마리여야 함 (지금 ${team.length}마리)`);
  const clean: TeamMemberSpec[] = [];
  team.slice(0, 20).forEach((raw: unknown, index: number) => {
    const label = `#${index + 1}`;
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`${label} 형식이 잘못됨`);
      return;
    }
    const { speciesId, level, moveIds } = raw as Record<string, unknown>;
    if (!isInt(speciesId)) {
      errors.push(`${label} 종 번호가 정수가 아님`);
      return;
    }
    const entry = species.find((s) => s.id === speciesId);
    if (!entry) errors.push(`${label} 없는 종 ${speciesId}`);
    if (!isInt(level) || level < MIN_LEVEL || level > MAX_LEVEL) errors.push(`${label} 레벨은 ${MIN_LEVEL}~${MAX_LEVEL}`);
    if (!Array.isArray(moveIds) || moveIds.length < 1 || moveIds.length > MAX_MOVES) {
      errors.push(`${label} 기술은 1~${MAX_MOVES}개`);
      return;
    }
    if (new Set(moveIds).size !== moveIds.length) errors.push(`${label} 기술이 중복됨`);
    for (const moveId of moveIds) {
      if (!isInt(moveId) || !moves[moveId]) {
        errors.push(`${label} 없는 기술 ${String(moveId)}`);
      } else if (entry && isInt(level) && !entry.learnset.some((l) => l.moveId === moveId && l.level <= level)) {
        errors.push(`${label} ${entry.name}은(는) 레벨 ${level}에 ${moves[moveId].name}을(를) 배울 수 없음`);
      }
    }
    if (entry && isInt(level) && Array.isArray(moveIds)) clean.push({ speciesId, level, moveIds: [...moveIds] as number[] });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, team: clean };
}

/** 검사를 통과한 팀을 전투용 오디로 만든다 (고른 기술 그대로) */
export function buildBattleTeam(
  team: TeamSpec, species: readonly Species[], moves: Record<number, Move>,
): BattlePokemon[] {
  return team.map((member) => {
    const entry = species.find((s) => s.id === member.speciesId);
    if (!entry) throw new Error(`없는 종 ${member.speciesId}`);
    const pokemon = createBattlePokemon(entry, member.level, moves);
    return { ...pokemon, moves: member.moveIds.map((id) => moves[id]) };
  });
}
