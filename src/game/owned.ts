export const MAX_TEAM = 6;

/** 내가 가진 오디 한 마리 (전투 밖에서는 이 정도만 기억한다. 체력은 월드에서 항상 가득) */
export interface OwnedOddie {
  speciesId: number;
  level: number;
  /** 현재 레벨에서 모은 경험치 */
  exp: number;
  /** 반짝이 오디(금빛). 옛 저장에는 없다 */
  shiny?: boolean;
}

/** 팀이 차 있으면 박스로 보낸다 */
export function addCaught(
  team: OwnedOddie[], box: OwnedOddie[], oddie: OwnedOddie,
): { team: OwnedOddie[]; box: OwnedOddie[]; toBox: boolean } {
  if (team.length < MAX_TEAM) return { team: [...team, oddie], box, toBox: false };
  return { team, box: [...box, oddie], toBox: true };
}

export function highestLevel(team: readonly OwnedOddie[], fallback = 1): number {
  if (team.length === 0) return fallback;
  return team.reduce((max, oddie) => Math.max(max, oddie.level), 1);
}
