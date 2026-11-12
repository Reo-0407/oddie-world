import { describe, expect, it } from 'vitest';
import { speciesById } from '../data/index.ts';
import { REGIONS } from './regions.ts';
import { MAPS, OUTDOORS } from './maps/index.ts';
import type { MapData } from './maps/types.ts';
import { BADGE_ORDER, TRAINERS, WILD_LEVELS } from './encounters.ts';
import { isWalkable } from './tiles.ts';
import { DELTA, canStep, exitOf, npcInSight, gateOpen, mapHeight, mapWidth, npcLines, placeNpcs, progressOf, stepPlayer, tileAt, type Progress } from './world.ts';

const all = Object.values(MAPS);
const walk = (m: MapData, x: number, y: number) => { const t = tileAt(m, x, y); return t !== undefined && isWalkable(t); };
const ALL_BADGES: Progress = { badges: BADGE_ORDER, flags: ['starter'] };
const NOTHING: Progress = { badges: [], flags: [] };

describe('모든 지도', () => {
  it('줄 길이가 같고 비어 있지 않다', () => {
    for (const m of all) {
      expect(m.rows.length, m.id).toBeGreaterThan(3);
      expect(new Set(m.rows.map((r) => r.length)).size, m.id).toBe(1);
    }
  });
  it('워프는 지도 안 걸을 수 있는 칸이고, 도착 칸도 지도 안 걸을 수 있는 칸(워프 아님)', () => {
    for (const m of all) {
      for (const w of m.warps) {
        expect(walk(m, w.x, w.y), `${m.id} warp ${w.x},${w.y}`).toBe(true);
        const d = MAPS[w.to.map];
        expect(d, `${m.id} -> ${w.to.map}`).toBeDefined();
        expect(w.to.x >= 0 && w.to.y >= 0 && w.to.x < mapWidth(d) && w.to.y < mapHeight(d)).toBe(true);
        expect(walk(d, w.to.x, w.to.y), `${m.id} -> ${w.to.map} ${w.to.x},${w.to.y}`).toBe(true);
        expect(d.warps.some((o) => o.x === w.to.x && o.y === w.to.y), `${m.id} -> ${w.to.map} lands on warp`).toBe(false);
      }
    }
  });
  it('NPC(비켜선 문지기 포함)는 걸을 수 있는 칸에, 간판은 간판 타일에', () => {
    for (const m of all) {
      for (const n of m.npcs) {
        expect(walk(m, n.x, n.y), `${m.id} ${n.id}`).toBe(true);
        if (n.gate) expect(walk(m, n.gate.aside.x, n.gate.aside.y), `${m.id} ${n.id} aside`).toBe(true);
      }
      for (const s of m.signs) expect(m.rows[s.y][s.x], `${m.id} sign`).toBe('Y');
    }
  });
  it('NPC id는 겹치지 않고, 트레이너 NPC는 모두 TRAINERS에 있고 TRAINERS는 모두 지도에 있다', () => {
    const npcs = all.flatMap((m) => m.npcs);
    expect(new Set(npcs.map((n) => n.id)).size).toBe(npcs.length);
    const trainers = npcs.filter((n) => n.trainer).map((n) => n.id);
    for (const id of trainers) expect(TRAINERS[id]?.id, id).toBe(id);
    expect(new Set(trainers)).toEqual(new Set(Object.keys(TRAINERS)));
  });
  it('네 구역 바깥 지도가 모두 있다', () => {
    expect(new Set(OUTDOORS.map((m) => m.region))).toEqual(new Set(['meadow', 'desert', 'snow', 'volcano']));
  });
});

/** 마을 시작점에서 걸어서 갈 수 있는 "지도:x,y" */
function reachable(p: Progress) {
  const seen = new Set<string>();
  const queue = [{ map: 'town', x: 6, y: 9 }];
  const dirs = ['up', 'down', 'left', 'right'] as const;
  while (queue.length) {
    const s = queue.pop()!;
    const k = `${s.map}:${s.x},${s.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const m = MAPS[s.map];
    const npcs = placeNpcs(m, p);
    for (const d of dirs) {
      const r = stepPlayer({ ...s, facing: d }, d, m, npcs, () => 1, (id) => MAPS[id]);
      if (r.moved) queue.push({ map: r.state.map, x: r.state.x, y: r.state.y });
    }
  }
  return seen;
}
const mapsOf = (seen: Set<string>) => new Set([...seen].map((k) => k.split(':')[0]));

describe('세계가 이어져 있다', () => {
  const full = reachable(ALL_BADGES);
  it('배지 네 개면 모든 지도에 갈 수 있다', () => {
    expect([...mapsOf(full)].sort()).toEqual(Object.keys(MAPS).sort());
  });
  it('트레이너·관장·챔피언·간호사·점원 옆에 설 수 있다', () => {
    for (const m of all) {
      for (const n of m.npcs.filter((o) => o.trainer || o.role)) {
        // 카운터 너머(2칸 아래)에서 말을 거는 간호사·점원 포함
        const near = [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2]].some(([dx, dy]) => full.has(`${m.id}:${n.x + dx},${n.y + dy}`));
        expect(near, n.id).toBe(true);
      }
    }
  });
  it('스타터가 없으면 마을 밖으로 못 나간다', () => {
    const none = mapsOf(reachable(NOTHING));
    expect(none.has('route1')).toBe(false);
    expect(none.has('forest')).toBe(false);
    expect(none.has('lab')).toBe(true);
  });
  it('배지 순서대로만 다음 구역이 열린다', () => {
    const at = (badges: string[]) => mapsOf(reachable({ badges, flags: ['starter'] }));
    expect(at([]).has('route1')).toBe(true);
    expect(at([]).has('route2')).toBe(false);
    expect(at([]).has('route3')).toBe(false);
    expect(at(['meadow']).has('desert-town')).toBe(true);
    expect(at(['meadow']).has('route3')).toBe(false);
    expect(at(['meadow', 'desert']).has('snow-town')).toBe(true);
    expect(at(['meadow', 'desert']).has('route4')).toBe(false);
    expect(at(['meadow', 'desert', 'snow']).has('volcano-town')).toBe(true);
    expect(at(['meadow', 'desert', 'snow']).has('hall')).toBe(false);
  });
});

describe('도착 칸과 시야', () => {
  const full = reachable(ALL_BADGES);
  it('워프 도착 칸은 어떤 NPC 자리(문지기가 막을 때·비켜설 때 모두)와도 겹치지 않는다', () => {
    for (const m of all) {
      for (const w of m.warps) {
        const d = MAPS[w.to.map];
        for (const n of d.npcs) {
          expect(n.x === w.to.x && n.y === w.to.y, `${m.id} -> ${d.id} lands on ${n.id}`).toBe(false);
          if (n.gate) expect(n.gate.aside.x === w.to.x && n.gate.aside.y === w.to.y, `${m.id} -> ${d.id} lands on ${n.id} aside`).toBe(false);
        }
      }
    }
  });
  it('도착하면 바라보는 칸이 걸을 수 있는 칸이다(나오자마자 바위를 보지 않는다)', () => {
    for (const m of all) {
      for (const w of m.warps) {
        const d = MAPS[w.to.map];
        const { dx, dy } = DELTA[w.to.facing];
        const nx = w.to.x + dx, ny = w.to.y + dy;
        // 지도 가장자리 출구(밖을 보고 도착)는 빼고, 그 밖은 앞 칸이 열려 있어야 한다
        if (nx < 0 || ny < 0 || nx >= mapWidth(d) || ny >= mapHeight(d)) continue;
        expect(walk(d, nx, ny), `${m.id} -> ${d.id} ${w.to.x},${w.to.y} facing ${w.to.facing}`).toBe(true);
      }
    }
  });
  it('바깥 지도의 건물 워프는 문 칸이다', () => {
    for (const m of OUTDOORS) for (const w of m.warps) if (!OUTDOORS.some((o) => o.id === w.to.map)) expect(m.rows[w.y][w.x], `${m.id} ${w.to.map}`).toBe('D');
  });
  it('모든 NPC 옆에 설 수 있다', () => {
    for (const m of all) {
      for (const n of m.npcs.filter((o) => !o.gate)) {
        const near = [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2]].some(([dx, dy]) => full.has(`${m.id}:${n.x + dx},${n.y + dy}`));
        expect(near, n.id).toBe(true);
      }
    }
  });
  it('트레이너 시야 안에 플레이어가 걸어 들어갈 수 있는 칸이 있다(길을 지킨다)', () => {
    for (const m of all) {
      const npcs = placeNpcs(m, ALL_BADGES);
      const blocked = (x: number, y: number) => !canStep(m, npcs, x, y);
      for (const n of m.npcs.filter((o) => o.trainer && o.trainer.sight > 0)) {
        const seen = [...full].filter((k) => k.startsWith(`${m.id}:`)).some((k) => {
          const [x, y] = k.split(':')[1].split(',').map(Number);
          return npcInSight(n, { x, y }, n.trainer!.sight, blocked);
        });
        expect(seen, n.id).toBe(true);
      }
    }
  });
});

describe('문지기', () => {
  const gate = MAPS.route1.npcs.find((n) => n.id === 'gate-desert')!;
  it('배지가 없으면 막고, 있으면 비켜선다', () => {
    expect(gateOpen(gate, NOTHING)).toBe(false);
    expect(gateOpen(gate, { badges: ['meadow'], flags: [] })).toBe(true);
    expect(placeNpcs(MAPS.route1, NOTHING).find((n) => n.id === gate.id)).toMatchObject({ x: gate.x, y: gate.y });
    expect(placeNpcs(MAPS.route1, ALL_BADGES).find((n) => n.id === gate.id)).toMatchObject(gate.gate!.aside);
    expect(canStep(MAPS.route1, placeNpcs(MAPS.route1, NOTHING), gate.x, gate.y)).toBe(false);
    expect(canStep(MAPS.route1, placeNpcs(MAPS.route1, ALL_BADGES), gate.x, gate.y)).toBe(true);
  });
  it('막을 때는 배지 안내, 열리면 다른 말', () => {
    expect(npcLines(gate, NOTHING).join(' ')).toContain('초원 배지가 있어야 지나갈 수 있어');
    expect(npcLines(gate, ALL_BADGES)).toEqual(gate.gate!.open);
  });
  it('전당 문지기는 배지 네 개가 모두 필요하다', () => {
    const hall = MAPS['volcano-town'].npcs.find((n) => n.id === 'gate-hall')!;
    expect(gateOpen(hall, { badges: ['meadow', 'desert', 'snow'], flags: [] })).toBe(false);
    expect(gateOpen(hall, ALL_BADGES)).toBe(true);
  });
  it('팀이 있는 옛 저장은 스타터를 받은 것으로 본다', () => {
    expect(progressOf({ badges: [], flags: [], team: [{}] }).flags).toContain('starter');
    expect(progressOf({ badges: [], flags: [], team: [] }).flags).not.toContain('starter');
  });
  it('linesIf: 플래그가 있으면 다른 대사', () => {
    const prof = MAPS.lab.npcs.find((n) => n.role === 'professor')!;
    expect(npcLines(prof, NOTHING)).toEqual(prof.lines);
    expect(npcLines(prof, ALL_BADGES)).toEqual(prof.linesIf!.lines);
  });
});

describe('센터·상점', () => {
  it('마을마다 간호사와 점원이 있고, 센터 부활 지점은 센터 문 바로 아래 칸', () => {
    const pairs = all.flatMap((m) => m.npcs.map((n) => [m, n] as const));
    const nurses = pairs.filter(([, n]) => n.role === 'nurse');
    expect(nurses).toHaveLength(4);
    expect(pairs.filter(([, n]) => n.role === 'clerk')).toHaveLength(4);
    for (const [m] of nurses) {
      const out = exitOf(m)!;
      expect(walk(MAPS[out.map], out.x, out.y)).toBe(true);
      expect(MAPS[out.map].warps.some((w) => w.to.map === m.id && w.x === out.x && w.y === out.y - 1), m.id).toBe(true);
    }
  });
});

describe('트레이너 팀', () => {
  const trainers = Object.values(TRAINERS);
  it('길 트레이너 11명, 관장 4명(배지), 챔피언 1명', () => {
    expect(trainers.filter((t) => t.id.startsWith('route'))).toHaveLength(11);
    expect(trainers.filter((t) => t.badge).map((t) => t.badge).sort()).toEqual([...BADGE_ORDER].sort());
    expect(trainers.filter((t) => t.champion)).toHaveLength(1);
  });
  it('관장: 구역 타입 3마리, 레벨 = 길 야생 최고 + 3', () => {
    for (const t of trainers.filter((o) => o.badge)) {
      const r = t.badge!;
      expect(t.team).toHaveLength(3);
      const types = Object.keys(REGIONS[r].typeWeights);
      for (const m of t.team) {
        expect(m.level).toBe(WILD_LEVELS[r][1] + 3);
        expect(speciesById(m.speciesId).types.some((ty) => types.includes(ty)), `${t.id} ${m.speciesId}`).toBe(true);
      }
    }
  });
  it('챔피언: 5마리, 레벨 32~35', () => {
    const c = trainers.find((t) => t.champion)!;
    expect(c.team).toHaveLength(5);
    for (const m of c.team) { expect(m.level).toBeGreaterThanOrEqual(32); expect(m.level).toBeLessThanOrEqual(35); }
  });
  it('모든 팀은 1~5마리, 있는 종, 보상 > 0', () => {
    for (const t of trainers) {
      expect(t.team.length).toBeGreaterThanOrEqual(1);
      expect(t.team.length).toBeLessThanOrEqual(5);
      for (const m of t.team) expect(speciesById(m.speciesId).id).toBe(m.speciesId);
      expect(t.reward).toBeGreaterThan(0);
    }
  });
});

describe('숨은 물건', () => {
  const full = reachable(ALL_BADGES);
  it('걸을 수 있고 갈 수 있는 칸, NPC·워프와 겹치지 않고 id가 겹치지 않는다', () => {
    const ids = all.flatMap((m) => (m.items ?? []).map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const m of all) {
      for (const i of m.items ?? []) {
        expect(full.has(`${m.id}:${i.x},${i.y}`), i.id).toBe(true);
        expect(m.npcs.some((n) => n.x === i.x && n.y === i.y) || m.warps.some((w) => w.x === i.x && w.y === i.y), i.id).toBe(false);
      }
    }
  });
});
