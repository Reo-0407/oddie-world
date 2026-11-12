import { describe, expect, it } from 'vitest';
import { collectItem, questsAfter, settleCatch, settleLoss, settleTrainer, settleWin } from '../battle/outcome.ts';
import { activeOf, aliveMine, createRealtime, energyCost, tick, type AiTier, type RtResult } from '../battle/realtime.ts';
import { createRng } from '../engine/rng.ts';
import { BADGE_ORDER, TRAINERS, type Trainer } from '../overworld/encounters.ts';
import { MAPS } from '../overworld/maps/index.ts';
import type { MapData, Npc } from '../overworld/maps/types.ts';
import {
  DELTA, canStep, interactTarget, placeNpcs, progressOf, spawnOf, stepPlayer, type Dir, type PlayerState, type Progress,
} from '../overworld/world.ts';
import { nurseGivesRopes } from './fun.ts';
import { LAB_ROPES, START_ROPES, TOWN_RESPAWN, TOWN_START, newSave, parseSave, takeStarter, type SaveData } from './save.ts';

/**
 * 머리로만 하는 한 판: 새 저장 → 스타터 → 배지 순서대로 모든 지도 → 챔피언.
 * 걷기는 world.ts의 stepPlayer로 BFS, 트레이너 전투는 실시간 전투 시뮬레이터, 정산은 App과 같은 outcome.ts 함수를 쓴다.
 */

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const key = (s: { map: string; x: number; y: number }) => `${s.map}:${s.x},${s.y}`;

/** 시작 칸에서 걸어서 갈 수 있는 칸과, 그 그래프를 거꾸로 따라 시작 칸으로 돌아올 수 있는 칸 */
function explore(p: Progress, start: { map: string; x: number; y: number } = TOWN_START) {
  const seen = new Map<string, PlayerState>();
  const back = new Map<string, string[]>(); // 도착 칸 → 출발 칸들
  const queue: PlayerState[] = [{ ...start, facing: 'down' }];
  while (queue.length) {
    const s = queue.pop()!;
    if (seen.has(key(s))) continue;
    seen.set(key(s), s);
    const m = MAPS[s.map];
    const npcs = placeNpcs(m, p);
    for (const d of DIRS) {
      const r = stepPlayer({ ...s, facing: d }, d, m, npcs, () => 1, (id) => MAPS[id]);
      if (!r.moved) continue;
      const to = key(r.state);
      back.set(to, [...(back.get(to) ?? []), key(s)]);
      queue.push(r.state);
    }
  }
  // 거꾸로 BFS: 어디서든 시작 칸으로 돌아올 수 있나(한 번 들어가면 못 나오는 곳이 없나)
  const home = new Set<string>([key(start)]);
  const q2 = [key(start)];
  while (q2.length) for (const from of back.get(q2.pop()!) ?? []) if (!home.has(from)) { home.add(from); q2.push(from); }
  return { seen, home };
}
const mapsOf = (seen: Map<string, unknown>) => new Set([...seen.keys()].map((k) => k.split(':')[0]));

/** 이 NPC에게 말을 걸 수 있는 칸(바라보는 방향 포함). 없으면 null */
function talkSpot(m: MapData, npc: Npc, p: Progress, seen: Map<string, PlayerState>): PlayerState | null {
  const npcs = placeNpcs(m, p);
  for (const s of seen.values()) {
    if (s.map !== m.id) continue;
    for (const d of DIRS) {
      const t = interactTarget(m, npcs, { ...s, facing: d });
      if (t?.type === 'npc' && t.npc.id === npc.id) return { ...s, facing: d };
    }
  }
  return null;
}

const findNpc = (pred: (n: Npc) => boolean) => {
  for (const m of Object.values(MAPS)) { const n = m.npcs.find(pred); if (n) return { map: m, npc: n }; }
  throw new Error('NPC 없음');
};

/** 실시간 전투를 끝까지: 늘 기본 공격, 필살기가 차면 쓰고, 빨간 ! 때 피한다 */
function simulate(team: SaveData['team'], foes: { speciesId: number; level: number }[], kind: 'wild' | 'trainer', ai: AiTier, seed: number) {
  const rng = createRng(seed);
  let s = createRealtime(kind, team, foes, 0, ai);
  for (let t = 0; t < 30 * 60_000 && !s.result; t += 50) {
    const me = activeOf(s, 'me');
    const ready = me.charged.findIndex((m) => me.energy >= energyCost(m));
    s = tick(s, 50, { fast: true, ...(ready >= 0 ? { charged: ready } : {}), ...(s.telegraph && s.telegraph.ms < 400 ? { dodge: true } : {}) }, rng);
    if (!s.result && activeOf(s, 'me').mon.hp <= 0) {
      const next = s.me.findIndex((f) => f.mon.hp > 0);
      if (next >= 0) s = tick(s, 0, { switchTo: next }, rng);
    }
  }
  return { result: s.result as RtResult | null, alive: aliveMine(s) };
}

/** 저장 → 문자열 → 저장이 그대로인가(매 단계) */
function roundtrip(save: SaveData): SaveData {
  const back = parseSave(JSON.stringify(save));
  expect(back).toEqual(save);
  return back!;
}

const tierOf = (tr: Trainer): AiTier => (tr.champion ? 'champion' : tr.badge ? 'leader' : 'trainer');
/** 그 트레이너를 넉넉히 이길 수 있게 키운 팀(필드에서 열심히 키웠다고 치고) */
const grind = (save: SaveData, level: number): SaveData => ({
  ...save, team: save.team.map((o) => ({ ...o, level: Math.max(o.level, level), exp: 0 })),
});

describe('처음부터 끝까지 한 판', () => {
  it('새 저장 → 스타터 → 배지 4개 → 모든 지도 → 챔피언, 매 단계 저장이 그대로 읽힌다', () => {
    let save = roundtrip(newSave('테스트', 2));
    let seed = 1;

    // 1) 스타터 전: 마을과 연구소만
    let world = explore(progressOf(save));
    expect(mapsOf(world.seen).has('route1')).toBe(false);
    const prof = findNpc((n) => n.role === 'professor');
    expect(talkSpot(prof.map, prof.npc, progressOf(save), world.seen), '박사에게 말을 걸 수 있다').not.toBeNull();

    // 2) 스타터: 두 번 눌러도 한 마리, 로프를 받는다
    save = takeStarter(save, 1)!;
    expect(takeStarter(save, 42)).toBeNull();
    expect(save.team).toHaveLength(1);
    expect(save.ropes.basic).toBe(START_ROPES.basic + LAB_ROPES);
    expect(save.flags).toContain('starter');
    save = roundtrip(save);
    // 팀을 둘 더(풀숲에서 잡았다고 치고): 잡기 정산을 그대로 거친다
    for (const id of [42, 107]) {
      save = settleWin(save, save.team.map(() => true), [{ speciesId: id, level: 5 }]).save;
      const c = settleCatch(save, { speciesId: id, level: 5 }, { ...save.ropes, basic: save.ropes.basic - 1 });
      expect(c.isNew).toBe(true);
      save = questsAfter(c.save, { kind: 'catch', types: [] }).save;
      save = roundtrip(save);
    }
    expect(save.team).toHaveLength(3);
    expect(save.dex.caught).toEqual(expect.arrayContaining([1, 42, 107]));

    // 3) 배지 순서대로: 그 구역 트레이너를 모두 이기고 관장을 이기면 다음 구역이 열린다
    const regionTrainers = (badge: string) => Object.values(TRAINERS).filter((tr) => {
      const m = Object.values(MAPS).find((mm) => mm.npcs.some((n) => n.id === tr.id))!;
      return m.region === badge && !tr.champion;
    });
    for (const [i, badge] of BADGE_ORDER.entries()) {
      world = explore(progressOf(save));
      expect([...world.seen.keys()].every((k) => world.home.has(k)), `${badge}: 들어가면 못 나오는 칸이 없다`).toBe(true);
      const list = regionTrainers(badge).sort((a, b) => Number(!!a.badge) - Number(!!b.badge)); // 관장은 마지막
      for (const tr of list) {
        const at = findNpc((n) => n.id === tr.id);
        expect(talkSpot(at.map, at.npc, progressOf(save), world.seen), `${tr.id}에게 갈 수 있다`).not.toBeNull();
        const top = Math.max(...tr.team.map((m) => m.level));
        save = grind(save, top + 6);
        const r = simulate(save.team, tr.team, 'trainer', tierOf(tr), (seed += 1));
        expect(r.result, `${tr.id} 전투`).toBe('won');
        const coins = save.coins;
        const s = settleTrainer(save, r.alive, tr);
        expect(s.save.beaten).toContain(tr.id);
        expect(s.save.coins).toBeGreaterThanOrEqual(coins + tr.reward);
        // 같은 트레이너를 또 정산해도 배지·이긴 목록이 늘지 않는다
        expect(settleTrainer(s.save, r.alive, tr).save.beaten.filter((id) => id === tr.id)).toHaveLength(1);
        save = roundtrip(s.save);
      }
      expect(save.badges).toEqual(BADGE_ORDER.slice(0, i + 1));
    }

    // 4) 배지 4개: 모든 지도, 전당까지
    world = explore(progressOf(save));
    expect([...mapsOf(world.seen)].sort()).toEqual(Object.keys(MAPS).sort());
    expect([...world.seen.keys()].every((k) => world.home.has(k)), '어디서든 마을로 돌아올 수 있다').toBe(true);

    // 5) 숨은 물건을 모두 줍고, 두 번 주울 수는 없다
    for (const m of Object.values(MAPS)) {
      for (const it of m.items ?? []) {
        expect(world.seen.has(`${m.id}:${it.x},${it.y}`), `${it.id}에 갈 수 있다`).toBe(true);
        const before = save;
        save = collectItem(save, it).save;
        expect(save.flags).toContain(`item:${it.id}`);
        expect(collectItem(save, it).save).toBe(save);
        expect(save.coins + save.ropes.basic + save.ropes.sturdy + save.potions)
          .toBeGreaterThan(before.coins + before.ropes.basic + before.ropes.sturdy + before.potions);
      }
    }
    save = roundtrip(save);

    // 6) 퀘스트 하나 끝내기: 야생을 이기다 보면 winWild/catch 퀘스트가 끝난다
    const done = save.quests?.done ?? 0;
    for (let k = 0; k < 40 && (save.quests?.done ?? 0) === done; k += 1) {
      save = settleWin(save, save.team.map(() => true), [{ speciesId: 4, level: 20 }]).save;
      save = questsAfter(save, { kind: 'winWild' }, createRng(k).next).save;
      save = questsAfter(save, { kind: 'excellent', n: 1 }, createRng(k).next).save;
      save = questsAfter(save, { kind: 'catch', types: ['fire'] }, createRng(k).next).save;
    }
    expect(save.quests!.done).toBeGreaterThan(done);
    expect(save.quests!.list).toHaveLength(3);
    save = roundtrip(save);

    // 7) 챔피언: 전당에서 이기면 엔딩 한 번
    const champ = TRAINERS.champion;
    const at = findNpc((n) => n.id === champ.id);
    expect(talkSpot(at.map, at.npc, progressOf(save), world.seen)).not.toBeNull();
    save = grind(save, 42);
    const r = simulate(save.team, champ.team, 'trainer', 'champion', 777);
    expect(r.result).toBe('won');
    const end = settleTrainer(save, r.alive, champ);
    expect(end.champion).toBe(true);
    expect(settleTrainer(end.save, r.alive, champ).champion).toBe(false);
    save = roundtrip(end.save);
    expect(save.flags).toContain('champion');

    // 8) 져도 갇히지 않는다: 부활 지점에 설 수 있고, 로프가 없으면 간호사가 준다
    const lost = settleLoss({ ...save, respawn: { ...TOWN_RESPAWN } });
    const p = spawnOf(lost.save, lost.save.respawn, TOWN_START, (id) => MAPS[id], progressOf(lost.save));
    expect(p).toMatchObject({ map: TOWN_RESPAWN.map, x: TOWN_RESPAWN.x, y: TOWN_RESPAWN.y });
    expect(nurseGivesRopes({ basic: 0, sturdy: 0 }, false)).toBe(true);
    roundtrip(lost.save);
  });

  it('부활 지점(모든 오디 센터 앞)은 걸을 수 있고, 거기서 센터로 들어갈 수 있다', () => {
    const p: Progress = { badges: BADGE_ORDER, flags: ['starter'] };
    for (const m of Object.values(MAPS)) {
      if (!m.npcs.some((n) => n.role === 'nurse')) continue;
      const w = m.warps[0];
      const out = MAPS[w.to.map];
      expect(canStep(out, placeNpcs(out, p), w.to.x, w.to.y), m.id).toBe(true);
      const up = { x: w.to.x - DELTA[w.to.facing].dx, y: w.to.y - DELTA[w.to.facing].dy };
      expect(out.warps.some((o) => o.to.map === m.id && Math.abs(o.x - up.x) + Math.abs(o.y - up.y) <= 1), `${m.id} 문`).toBe(true);
    }
  });
});
