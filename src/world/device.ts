/** 기기에 맞는 화면 배율 상한: 폰(터치 기기나 좁은 화면)은 1.5, 그 밖은 2 */
export function pixelRatioCap(touchPoints: number, innerWidth: number): number {
  return touchPoints > 0 || innerWidth < 768 ? 1.5 : 2;
}

export function pixelRatioFor(devicePixelRatio: number, touchPoints: number, innerWidth: number): number {
  return Math.min(devicePixelRatio, pixelRatioCap(touchPoints, innerWidth));
}
