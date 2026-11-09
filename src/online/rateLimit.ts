/** 방 코드 추측 속도 제한: 사용자마다 1분 창 안에서 실패가 MAX_FAILS번 넘으면 그 창이 끝날 때까지 막는다 */
export interface LimitState {
  /** 창이 시작한 시각(ms) */
  windowStart: number;
  fails: number;
}

export const LIMIT_WINDOW_MS = 60_000;
export const MAX_FAILS = 8;

export function currentFails(state: LimitState | null, now: number): number {
  return state && now - state.windowStart < LIMIT_WINDOW_MS ? state.fails : 0;
}

export function isBlocked(state: LimitState | null, now: number): boolean {
  return currentFails(state, now) >= MAX_FAILS;
}

/** 실패 한 번을 더한다 (창이 지났으면 새 창에서 1부터) */
export function recordFail(state: LimitState | null, now: number): LimitState {
  if (state && now - state.windowStart < LIMIT_WINDOW_MS) return { windowStart: state.windowStart, fails: state.fails + 1 };
  return { windowStart: now, fails: 1 };
}
