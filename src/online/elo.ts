export const ELO_K = 32;
export const START_RATING = 1000;

/** a가 b를 이길 기대 확률 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** scoreA: a가 이기면 1, 지면 0, 비기면 0.5. 새 점수는 반올림한 정수 */
export function eloUpdate(ratingA: number, ratingB: number, scoreA: 0 | 0.5 | 1): [number, number] {
  const expectedA = expectedScore(ratingA, ratingB);
  const deltaA = ELO_K * (scoreA - expectedA);
  const deltaB = ELO_K * ((1 - scoreA) - (1 - expectedA));
  return [Math.round(ratingA + deltaA), Math.round(ratingB + deltaB)];
}
