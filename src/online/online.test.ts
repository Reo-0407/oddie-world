import { describe, expect, it } from 'vitest';
import { MOVES, SPECIES, speciesById } from '../data/index.ts';
import { createRng } from '../engine/rng.ts';
import { createBattlePokemon } from '../game/factory.ts';
import { OnlineClient } from './client.ts';
import { eloUpdate, expectedScore } from './elo.ts';
import { createLocalBus } from './localServer.ts';
import { createMemoryNetwork } from './memoryTransport.ts';
import type { TeamSpec } from './protocol.ts';
import {
  codeFromSeed, CODE_LENGTH, createRoom, joinRoom, leaveRoom, MAX_MISSES, seatOf, setConnected, submitAction,
  submitTeam, tick, TEAM_MS, TURN_MS, viewFor, type Room,
} from './room.ts';
import { GameServer } from './server.ts';
import { validateTeam } from './validate.ts';

const data = { species: SPECIES, moves: MOVES };

function teamOf(ids: number[], level = 20): TeamSpec {
  return ids.map((id) => ({
    speciesId: id,
    level,
    moveIds: createBattlePokemon(speciesById(id), level, MOVES).moves.map((m) => m.id),
  }));
}

const ok = (result: { ok: boolean; room?: Room }): Room => {
  if (!result.ok || !result.room) throw new Error('실패한 결과');
  return result.room;
};

/** 두 사람이 들어와 팀까지 낸 전투 중인 방 */
function battleRoom(now = 0): Room {
  let room = createRoom('ABC234', 'p1', '가', 42);
  room = ok(joinRoom(room, 'p2', '나', now));
  room = ok(submitTeam(room, 'p1', teamOf([1, 2, 3]), data, now));
  room = ok(submitTeam(room, 'p2', teamOf([42, 43, 45]), data, now));
  return room;
}

describe('팀 검사', () => {
  it('올바른 팀은 통과', () => {
    expect(validateTeam(teamOf([1, 2, 3]), SPECIES, MOVES).ok).toBe(true);
  });
  it('3마리가 아니면 거절', () => {
    const result = validateTeam(teamOf([1, 2]), SPECIES, MOVES);
    expect(result.ok).toBe(false);
    expect(validateTeam(teamOf([1, 2, 3, 4]), SPECIES, MOVES).ok).toBe(false);
    expect(validateTeam('팀', SPECIES, MOVES).ok).toBe(false);
  });
  it('레벨은 1~50 정수', () => {
    for (const level of [0, 51, 10.5, -3]) {
      const team = teamOf([1, 2, 3]);
      team[0].level = level;
      expect(validateTeam(team, SPECIES, MOVES).ok, `레벨 ${level}`).toBe(false);
    }
    const edge = teamOf([1, 2, 3], 50);
    expect(validateTeam(edge, SPECIES, MOVES).ok).toBe(true);
  });
  it('없는 종은 거절', () => {
    const team = teamOf([1, 2, 3]);
    team[1].speciesId = 9999;
    expect(validateTeam(team, SPECIES, MOVES).ok).toBe(false);
  });
  it('배울 수 없는 기술, 4개 초과, 중복, 0개는 거절', () => {
    const base = () => teamOf([1, 2, 3]);
    const stranger = base();
    stranger[0].moveIds = [speciesById(42).signatureMoveId]; // 다른 오디의 고유 기술
    expect(validateTeam(stranger, SPECIES, MOVES).ok).toBe(false);
    const many = base();
    many[0].moveIds = [...many[0].moveIds, 9999, 9998, 9997];
    expect(validateTeam(many, SPECIES, MOVES).ok).toBe(false);
    const dup = base();
    dup[0].moveIds = [dup[0].moveIds[0], dup[0].moveIds[0]];
    expect(validateTeam(dup, SPECIES, MOVES).ok).toBe(false);
    const none = base();
    none[0].moveIds = [];
    expect(validateTeam(none, SPECIES, MOVES).ok).toBe(false);
    const missing = base();
    missing[0].moveIds = [999999];
    expect(validateTeam(missing, SPECIES, MOVES).ok).toBe(false);
  });
  it('고유 기술은 배우는 레벨 이상에서만', () => {
    const species = speciesById(1);
    const signature = species.learnset.find((entry) => entry.moveId === species.signatureMoveId)!;
    const low = [{ speciesId: 1, level: Math.max(1, signature.level - 1), moveIds: [species.signatureMoveId] }, ...teamOf([2, 3]).slice(0, 2)];
    expect(validateTeam(low, SPECIES, MOVES).ok).toBe(signature.level <= 1);
    const enough = [{ speciesId: 1, level: Math.max(signature.level, 1), moveIds: [species.signatureMoveId] }, ...teamOf([2, 3]).slice(0, 2)];
    expect(validateTeam(enough, SPECIES, MOVES).ok).toBe(true);
  });
  it('이상한 값(문자열 레벨 등)도 던지지 않고 거절', () => {
    const team = teamOf([1, 2, 3]) as unknown as Record<string, unknown>[];
    team[0].level = '10';
    team[1] = null as never;
    expect(() => validateTeam(team, SPECIES, MOVES)).not.toThrow();
    expect(validateTeam(team, SPECIES, MOVES).ok).toBe(false);
  });
});

describe('방 코드', () => {
  it('6자리, 헷갈리는 글자 없음, 시드가 같으면 같다', () => {
    const code = codeFromSeed(1234);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    expect(codeFromSeed(1234)).toBe(code);
    expect(codeFromSeed(1235)).not.toBe(code);
  });
});

describe('방 상태 머신', () => {
  it('대기 → 팀 고르기 → 전투', () => {
    let room = createRoom('ABC234', 'p1', '가', 42);
    expect(room.phase).toBe('waiting');
    room = ok(joinRoom(room, 'p2', '나', 0));
    expect(room.phase).toBe('teams');
    expect(room.deadline).toBe(TEAM_MS);
    room = ok(submitTeam(room, 'p1', teamOf([1, 2, 3]), data, 10));
    expect(room.phase).toBe('teams');
    room = ok(submitTeam(room, 'p2', teamOf([42, 43, 45]), data, 20));
    expect(room.phase).toBe('battle');
    expect(room.turn).toBe(1);
    expect(room.deadline).toBe(20 + TURN_MS);
    expect(room.awaiting).toEqual([true, true]);
  });
  it('잘못된 단계와 사람은 오류', () => {
    const waiting = createRoom('ABC234', 'p1', '가', 42);
    expect(submitTeam(waiting, 'p1', teamOf([1, 2, 3]), data, 0)).toMatchObject({ ok: false, error: 'bad-phase' });
    const full = ok(joinRoom(waiting, 'p2', '나', 0));
    expect(joinRoom(full, 'p3', '다', 0)).toMatchObject({ ok: false, error: 'full' });
    expect(submitTeam(full, 'zzz', teamOf([1, 2, 3]), data, 0)).toMatchObject({ ok: false, error: 'not-seated' });
    expect(submitTeam(full, 'p1', teamOf([1, 2]), data, 0)).toMatchObject({ ok: false, error: 'invalid-team' });
  });
  it('이미 있는 사람이 다시 join하면 재접속으로 본다', () => {
    const room = battleRoom();
    const gone = ok(setConnected(room, 'p2', false));
    expect(gone.seats[1]?.connected).toBe(false);
    const back = ok(joinRoom(gone, 'p2', '나', 5));
    expect(back.seats[1]?.connected).toBe(true);
  });
  it('행동 검사: 오래된 턴, 두 번 제출, 불법 행동, pass', () => {
    const room = battleRoom();
    expect(submitAction(room, 'p1', 0, { kind: 'move', moveIndex: 0 }, 0)).toMatchObject({ ok: false, error: 'stale-turn' });
    expect(submitAction(room, 'p1', 1, { kind: 'move', moveIndex: 9 }, 0)).toMatchObject({ ok: false, error: 'illegal-action' });
    expect(submitAction(room, 'p1', 1, { kind: 'pass' }, 0)).toMatchObject({ ok: false, error: 'illegal-action' });
    expect(submitAction(room, 'zzz', 1, { kind: 'move', moveIndex: 0 }, 0)).toMatchObject({ ok: false, error: 'not-seated' });
    const first = ok(submitAction(room, 'p1', 1, { kind: 'move', moveIndex: 0 }, 0));
    expect(first.turn).toBe(1);
    expect(submitAction(first, 'p1', 1, { kind: 'move', moveIndex: 1 }, 0)).toMatchObject({ ok: false, error: 'already-submitted' });
  });
  it('두 행동이 모이면 엔진으로 판정하고 턴이 올라간다', () => {
    let room = battleRoom();
    room = ok(submitAction(room, 'p1', 1, { kind: 'move', moveIndex: 0 }, 100));
    room = ok(submitAction(room, 'p2', 1, { kind: 'move', moveIndex: 0 }, 200));
    expect(room.turn).toBe(2);
    expect(room.pending).toEqual([null, null]);
    expect(room.lastEvents.length).toBeGreaterThan(0);
    expect(room.deadline).toBe(200 + TURN_MS);
  });
  it('나가기: 전투 중이면 상대 승, 방 단계에서는 무승부로 끝', () => {
    const left = ok(leaveRoom(battleRoom(), 'p1'));
    expect(left).toMatchObject({ phase: 'finished', winner: 1, endReason: 'forfeit' });
    const early = ok(leaveRoom(createRoom('ABC234', 'p1', '가', 1), 'p1'));
    expect(early).toMatchObject({ phase: 'finished', winner: null });
  });
});

describe('제한시간', () => {
  it('시간이 안 됐으면 그대로', () => {
    const room = battleRoom();
    expect(tick(room, TURN_MS - 1)).toBe(room);
  });
  it('팀 고르기: 안 낸 쪽이 진다 / 둘 다 안 내면 무승부', () => {
    let room = ok(joinRoom(createRoom('ABC234', 'p1', '가', 1), 'p2', '나', 0));
    room = ok(submitTeam(room, 'p2', teamOf([1, 2, 3]), data, 1));
    expect(tick(room, TEAM_MS)).toMatchObject({ phase: 'finished', winner: 1, endReason: 'timeout' });
    const none = ok(joinRoom(createRoom('ABC234', 'p1', '가', 1), 'p2', '나', 0));
    expect(tick(none, TEAM_MS)).toMatchObject({ phase: 'finished', winner: null });
  });
  it('연결된 쪽이 시간을 넘기면 자동으로 쉬고 턴이 넘어간다', () => {
    let room = battleRoom();
    room = ok(submitAction(room, 'p1', 1, { kind: 'move', moveIndex: 0 }, 0));
    const next = tick(room, TURN_MS);
    expect(next.turn).toBe(2);
    expect(next.phase).toBe('battle');
    expect(next.seats[1]?.misses).toBe(1);
    expect(next.seats[0]?.misses).toBe(0);
  });
  it('연속 3번 넘기면 기권패, 행동하면 횟수가 0으로 돌아간다', () => {
    let room = battleRoom();
    let now = 0;
    for (let i = 0; i < MAX_MISSES - 1; i += 1) {
      room = ok(submitAction(room, 'p1', room.turn, { kind: 'move', moveIndex: 0 }, now));
      now += TURN_MS;
      room = tick(room, now);
      expect(room.phase).toBe('battle');
    }
    expect(room.seats[1]?.misses).toBe(MAX_MISSES - 1);
    const reset = ok(submitAction(room, 'p2', room.turn, { kind: 'move', moveIndex: 0 }, now));
    expect(reset.seats[1]?.misses).toBe(0);
    let doomed = room;
    for (let i = 0; i < 1; i += 1) {
      doomed = ok(submitAction(doomed, 'p1', doomed.turn, { kind: 'move', moveIndex: 0 }, now));
      now += TURN_MS;
      doomed = tick(doomed, now);
    }
    expect(doomed).toMatchObject({ phase: 'finished', winner: 0, endReason: 'timeout' });
  });
  it('끊긴 쪽은 제한시간이 지나면 진다', () => {
    let room = battleRoom();
    room = ok(setConnected(room, 'p2', false));
    expect(tick(room, TURN_MS - 1).phase).toBe('battle');
    expect(tick(room, TURN_MS)).toMatchObject({ phase: 'finished', winner: 0, endReason: 'disconnect' });
  });
  it('재접속하면 현재 상태를 그대로 받는다', () => {
    let room = battleRoom();
    room = ok(submitAction(room, 'p1', 1, { kind: 'move', moveIndex: 0 }, 0));
    const before = viewFor(room, 0);
    room = ok(setConnected(room, 'p1', false));
    room = ok(setConnected(room, 'p1', true));
    expect(viewFor(room, 0)).toEqual(before);
    expect(viewFor(room, 0).you.submitted).toBe(true);
  });
});

describe('공개 상태 필터', () => {
  it('상대가 낸 행동, 기술, 능력치, 난수 상태, 안 나온 오디는 보이지 않는다', () => {
    let room = battleRoom();
    room = ok(submitAction(room, 'p2', 1, { kind: 'move', moveIndex: 2 }, 0));
    const view = viewFor(room, 0);
    const json = JSON.stringify(view);
    expect(json).not.toContain('rngState');
    expect(json).not.toContain('moveIndex');
    expect(view.foe.submitted).toBe(true); // 냈다는 사실만 보인다
    expect(view.you.submitted).toBe(false);
    expect(view.foe.team[0]).not.toBeNull();
    expect(view.foe.team[1]).toBeNull();
    expect(view.foe.team[2]).toBeNull();
    const foeFirst = view.foe.team[0] as unknown as Record<string, unknown>;
    expect(foeFirst.moves).toBeUndefined();
    expect(foeFirst.stats).toBeUndefined();
    expect(foeFirst.hp).toBeUndefined();
    expect(view.you.team[0].moves.length).toBeGreaterThan(0);
    expect(view.you.team[0].maxHp).toBeGreaterThan(0);
  });
  it('두 자리의 시점이 서로 반대다', () => {
    const room = battleRoom();
    const a = viewFor(room, 0);
    const b = viewFor(room, 1);
    expect(a.you.team[0].speciesId).toBe(b.foe.team[0]?.speciesId);
    expect(b.you.team[0].speciesId).toBe(a.foe.team[0]?.speciesId);
    expect(seatOf(room, 'p2')).toBe(1);
  });
});

describe('Elo', () => {
  it('같은 점수끼리는 이기면 +16, 지면 -16 (K=32)', () => {
    expect(eloUpdate(1000, 1000, 1)).toEqual([1016, 984]);
    expect(eloUpdate(1000, 1000, 0)).toEqual([984, 1016]);
    expect(eloUpdate(1000, 1000, 0.5)).toEqual([1000, 1000]);
  });
  it('약한 쪽이 이기면 더 많이 오른다', () => {
    const [low, high] = eloUpdate(800, 1200, 1);
    expect(low - 800).toBeGreaterThan(16);
    expect(1200 - high).toBeGreaterThan(16);
    expect(expectedScore(1200, 800)).toBeGreaterThan(0.9);
  });
  it('점수 총합이 보존된다(반올림 오차 1 이내)', () => {
    const [a, b] = eloUpdate(1337, 1011, 1);
    expect(Math.abs(a + b - 1337 - 1011)).toBeLessThanOrEqual(1);
  });
});

describe('두 클라이언트 통합', () => {
  function makeWorld(seed: number) {
    const rng = createRng(seed);
    const clock = { now: 0 };
    const server = new GameServer({ ...data, rng: rng.next, now: () => clock.now });
    const network = createMemoryNetwork(server);
    const a = new OnlineClient('alice', network.connect('alice'));
    const b = new OnlineClient('bob', network.connect('bob'));
    return { server, network, a, b, clock, rng };
  }

  /** 클라이언트가 볼 수 있는 상태만으로 행동을 고른다 */
  function pickAction(client: OnlineClient, rng: () => number) {
    const view = client.view;
    if (!view || !view.you.needsAction) return false;
    const me = view.you.team[view.you.active];
    if (view.you.mustSwitch || me.fainted) {
      const target = view.you.team.findIndex((mon, i) => !mon.fainted && i !== view.you.active);
      client.act({ kind: 'switch', teamIndex: target });
    } else {
      client.act({ kind: 'move', moveIndex: Math.floor(rng() * me.moves.length) });
    }
    return true;
  }

  it('방 만들기 → 참가 → 팀 제출 → 끝까지 싸워 승자가 정해진다', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const { a, b, rng } = makeWorld(seed);
      a.create('앨리스');
      const code = a.view?.code ?? '';
      expect(code).toHaveLength(CODE_LENGTH);
      b.join(code.toLowerCase(), '밥'); // 소문자로 쳐도 된다
      expect(b.view?.phase).toBe('teams');
      a.submitTeam(teamOf([1, 2, 3], 25));
      b.submitTeam(teamOf([42, 43, 45], 25));
      expect(a.view?.phase).toBe('battle');
      let guard = 0;
      while (a.view?.phase === 'battle' && guard < 400) {
        pickAction(a, rng.next);
        pickAction(b, rng.next);
        guard += 1;
      }
      expect(a.view?.phase, `시드 ${seed}`).toBe('finished');
      expect(b.view?.phase).toBe('finished');
      expect(a.view?.winner).not.toBeNull();
      expect(a.view?.winner).toBe(b.view?.winner);
      expect(a.view?.endReason).toBe('ko');
      expect(a.error).toBeNull();
    }
  });

  it('같은 시드면 같은 결과(재현 가능)', () => {
    const play = () => {
      const { a, b, rng } = makeWorld(7);
      a.create('A');
      b.join(a.view?.code ?? '', 'B');
      a.submitTeam(teamOf([1, 2, 3], 25));
      b.submitTeam(teamOf([42, 43, 45], 25));
      let guard = 0;
      while (a.view?.phase === 'battle' && guard < 400) {
        pickAction(a, rng.next);
        pickAction(b, rng.next);
        guard += 1;
      }
      return [a.view?.winner, a.view?.turn];
    };
    expect(play()).toEqual(play());
  });

  it('없는 방 코드, 잘못된 팀은 오류를 돌려준다', () => {
    const { a, b } = makeWorld(3);
    b.join('ZZZZZZ', '밥');
    expect(b.error).toContain('no-room');
    a.create('앨리스');
    b.join(a.view?.code ?? '', '밥');
    b.submitTeam(teamOf([1, 2], 25));
    expect(b.error).toContain('invalid-team');
  });

  it('제한시간 처리가 서버 tick으로 전달된다', () => {
    const { a, b, network, clock } = makeWorld(5);
    a.create('A');
    b.join(a.view?.code ?? '', 'B');
    a.submitTeam(teamOf([1, 2, 3], 25));
    b.submitTeam(teamOf([42, 43, 45], 25));
    a.act({ kind: 'move', moveIndex: 0 });
    clock.now = TURN_MS + 1;
    network.tick();
    expect(a.view?.turn).toBe(2);
    expect(b.view?.turn).toBe(2);
    network.disconnect('bob');
    expect(a.view?.connected).toEqual([true, false]);
    clock.now += TURN_MS + 1;
    network.tick();
    expect(a.view).toMatchObject({ phase: 'finished', winner: 0, endReason: 'disconnect' });
  });

  it('재접속하면 방 코드로 현재 상태를 다시 받는다', () => {
    const { a, b, network } = makeWorld(9);
    a.create('A');
    b.join(a.view?.code ?? '', 'B');
    a.submitTeam(teamOf([1, 2, 3], 25));
    b.submitTeam(teamOf([42, 43, 45], 25));
    const code = a.view?.code ?? '';
    network.disconnect('alice');
    expect(b.view?.connected).toEqual([false, true]);
    const fresh = new OnlineClient('alice', network.connect('alice'));
    fresh.reconnect(code);
    expect(fresh.view?.phase).toBe('battle');
    expect(fresh.view?.you.team).toHaveLength(3);
    expect(b.view?.connected).toEqual([true, true]);
  });
});

describe('로컬 서버(BroadcastChannel) 어댑터', () => {
  it('두 버스가 방을 만들고 참가해 상태를 받는다', async () => {
    const rng = createRng(11);
    const name = `test-${rng.int(1, 1e9)}`;
    const busA = createLocalBus('alice', () => new GameServer({ ...data, rng: rng.next, now: () => 0, replyUnknownRoom: false }), name, 60_000);
    const busB = createLocalBus('bob', () => new GameServer({ ...data, rng: rng.next, now: () => 0, replyUnknownRoom: false }), name, 60_000);
    const a = new OnlineClient('alice', busA.transport);
    const b = new OnlineClient('bob', busB.transport);
    a.create('A');
    expect(busA.hosting).toBe(true);
    const code = a.view?.code ?? '';
    b.join(code, 'B');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(b.view?.phase).toBe('teams');
    expect(a.view?.phase).toBe('teams');
    expect(busB.hosting).toBe(false);
    busA.dispose();
    busB.dispose();
  });
});
