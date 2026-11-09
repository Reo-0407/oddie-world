import { eloUpdate, START_RATING } from './elo.ts';
import type { EndReason } from './protocol.ts';
import type { Room } from './room.ts';

/** 끝난 방에서 전적에 기록할 내용. 전투가 한 번도 시작 안 했거나 두 사람이 다 없으면 null */
export interface FinishedMatch {
  roomCode: string;
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  winnerId: string | null;
  loserId: string | null;
  draw: boolean;
  reason: EndReason;
  /** a(0번 자리) 입장의 점수: 이기면 1, 지면 0, 비기면 0.5 */
  scoreA: 0 | 0.5 | 1;
}

export function finishedMatch(room: Room): FinishedMatch | null {
  const [a, b] = room.seats;
  if (room.phase !== 'finished' || !a || !b || !room.battle || room.endReason === null) return null;
  const draw = room.winner === null;
  const winner = room.winner === null ? null : room.seats[room.winner];
  const loser = room.winner === null ? null : room.seats[room.winner === 0 ? 1 : 0];
  return {
    roomCode: room.code,
    aId: a.playerId,
    bId: b.playerId,
    aName: a.name,
    bName: b.name,
    winnerId: winner?.playerId ?? null,
    loserId: loser?.playerId ?? null,
    draw,
    reason: room.endReason,
    scoreA: draw ? 0.5 : room.winner === 0 ? 1 : 0,
  };
}

/** 점수 변화량(더하는 값). 점수를 아직 모르는 사람은 기본 점수로 본다 */
export function eloDeltas(ratingA: number | undefined, ratingB: number | undefined, scoreA: 0 | 0.5 | 1): [number, number] {
  const a = ratingA ?? START_RATING;
  const b = ratingB ?? START_RATING;
  const [newA, newB] = eloUpdate(a, b, scoreA);
  return [newA - a, newB - b];
}
