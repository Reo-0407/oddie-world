/**
 * 월드에 나올 수 있는 야생 오디 번호 = public/models 에 GLB 파일이 있는 종.
 * 갱신 방법: `ls public/models` 로 OD-###.glb 번호를 확인해 아래 배열을 고친다.
 */
export const MODEL_SPECIES_IDS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 20, 21, 23, 26, 27, 28, 29, 30,
  32, 34, 36, 37, 40, 41, 42, 43, 45, 46, 47, 50, 51, 52, 54, 63, 78, 107,
];

export function modelUrl(speciesId: number): string {
  return `${import.meta.env.BASE_URL}models/OD-${String(speciesId).padStart(3, '0')}.glb`;
}

/** 야생 오디 레벨: 플레이어 레벨 ±2 (최소 1) */
export function wildLevel(playerLevel: number, rand: () => number): number {
  return Math.max(1, playerLevel - 2 + Math.floor(rand() * 5));
}
