/**
 * 월드에 나올 수 있는 야생 오디 번호 = public/models 에 GLB 파일이 있는 종.
 * 빌드 때 폴더를 읽어 자동으로 채운다(새 모델을 넣으면 따로 고칠 것 없음).
 */
export const MODEL_SPECIES_IDS: readonly number[] = Object.keys(
  import.meta.glob('/public/models/OD-*.glb', { query: '?url', eager: false }),
)
  .map((path) => Number(/OD-(\d+)\.glb$/.exec(path)?.[1]))
  .filter((id) => Number.isInteger(id))
  .sort((x, y) => x - y);

export function modelUrl(speciesId: number): string {
  return `${import.meta.env.BASE_URL}models/OD-${String(speciesId).padStart(3, '0')}.glb`;
}

/** 야생 오디 레벨: 플레이어 레벨 ±2 (최소 1) */
export function wildLevel(playerLevel: number, rand: () => number): number {
  return Math.max(1, playerLevel - 2 + Math.floor(rand() * 5));
}
