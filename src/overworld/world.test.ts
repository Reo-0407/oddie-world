import { describe, expect, it } from 'vitest';
import { MAPS } from './maps/index.ts';
import { rollWild } from './encounters.ts';
import { canStep, facingTile, hiddenItems, interactTarget, itemFlag, npcInSight, spawnOf, spawnWild, stepPlayer, tileAt, mapWidth, wildCap, wildHabitat, wildStep, type PlayerState, type WildMon } from './world.ts';
import { TOWN_RESPAWN, TOWN_START } from '../game/save.ts';
import { isGrass, isWalkable } from './tiles.ts';

const town = MAPS.town;
const route = MAPS.route1;
const at = (map: string, x: number, y: number, facing: PlayerState['facing'] = 'down'): PlayerState => ({ map, x, y, facing });
const get = (id: string) => MAPS[id];

describe('지도 데이터', () => {
  it('모든 줄 길이가 같고 크기가 맞다', () => {
    for (const m of Object.values(MAPS)) expect(new Set(m.rows.map((r) => r.length)).size, m.id).toBe(1);
    expect([mapWidth(town), town.rows.length]).toEqual([30, 27]);
    expect([mapWidth(route), route.rows.length]).toEqual([40, 16]);
  });
  it('워프 칸·도착 칸·NPC는 모두 걸을 수 있고 도착한 칸은 다시 워프가 아니다', () => {
    for (const m of Object.values(MAPS)) {
      for (const w of m.warps) {
        expect(isWalkable(tileAt(m, w.x, w.y)!), `${m.id} warp`).toBe(true);
        const dest = MAPS[w.to.map];
        expect(dest, w.to.map).toBeDefined();
        expect(isWalkable(tileAt(dest, w.to.x, w.to.y)!), `${m.id}->${w.to.map}`).toBe(true);
        expect(dest.warps.some((d) => d.x === w.to.x && d.y === w.to.y)).toBe(false);
      }
      for (const n of m.npcs) expect(isWalkable(tileAt(m, n.x, n.y)!), n.id).toBe(true);
    }
  });
  it('모든 간판 칸이 간판 타일이고 시작점이 걸을 수 있다', () => {
    for (const m of Object.values(MAPS)) for (const s of m.signs) expect(m.rows[s.y][s.x]).toBe('Y');
    expect(canStep(town, town.npcs, 6, 9)).toBe(true);
  });
});

describe('이동', () => {
  it('걸을 수 있으면 한 칸 이동하고 방향이 바뀐다', () => {
    const r = stepPlayer(at('town', 6, 9), 'right', town, [], () => 1, get);
    expect(r).toMatchObject({ moved: true, warped: false, state: { x: 7, y: 9, facing: 'right' } });
  });
  it('막히면 제자리에서 방향만 바뀐다(나무, 물, 지도 밖, NPC)', () => {
    const wall = stepPlayer(at('town', 6, 9), 'up', town, [], () => 1, get); // (6,8)은 길 -> 이동
    expect(wall.moved).toBe(true);
    const tree = stepPlayer(at('town', 1, 8), 'up', town, [], () => 1, get);
    expect(tileAt(town, 1, 7)).toBeDefined();
    expect(canStep(town, [], 19, 11)).toBe(false); // 연못
    const edge = stepPlayer(at('town', 0, 0, 'down'), 'up', town, [], () => 1, get);
    expect(edge).toMatchObject({ moved: false, state: { x: 0, y: 0, facing: 'up' } });
    const npc = stepPlayer(at('town', 5, 9), 'right', town, [{ x: 6, y: 9 }], () => 1, get);
    expect(npc).toMatchObject({ moved: false, state: { x: 5, y: 9, facing: 'right' } });
    expect(tree.state.facing).toBe('up');
  });
});

describe('워프', () => {
  it('집 문을 밟으면 안으로, 카펫을 밟으면 밖으로', () => {
    const inside = stepPlayer(at('town', 6, 8), 'up', town, [], () => 1, get);
    expect(inside).toMatchObject({ warped: true, state: { map: 'center', facing: 'up' } });
    const out = stepPlayer(at('center', 4, 6), 'down', MAPS.center, [], () => 1, get);
    expect(out).toMatchObject({ warped: true, state: { map: 'town', x: 6, y: 8, facing: 'down' } });
  });
  it('마을 오른쪽 끝에서 1번 길로 이어진다', () => {
    const r = stepPlayer(at('town', 28, 20), 'right', town, [], () => 0, get);
    expect(r).toMatchObject({ warped: true, encounter: false, state: { map: 'route1', x: 1, y: 6 } });
  });
});

describe('풀숲 조우', () => {
  const grassY = route.rows.findIndex((r) => r.includes('"'));
  const gx = route.rows[grassY].indexOf('"');
  it('풀숲 칸은 풀숲이다', () => expect(isGrass(tileAt(route, gx, grassY)!)).toBe(true));
  it('난수가 5% 미만이면 조우, 아니면 없음', () => {
    const from = at('route1', gx - 1, grassY, 'right');
    if (!canStep(route, [], gx - 1, grassY)) return;
    expect(stepPlayer(from, 'right', route, [], () => 0.04, get).encounter).toBe(true);
    expect(stepPlayer(from, 'right', route, [], () => 0.05, get).encounter).toBe(false);
  });
  it('길에서는 조우가 없다', () => {
    expect(stepPlayer(at('route1', 2, 6, 'right'), 'right', route, [], () => 0, get).encounter).toBe(false);
  });
  it('초원 야생은 1~165종, 레벨 3~6', () => {
    for (const r of [0, 0.3, 0.99]) {
      const w = rollWild('meadow', () => r);
      expect(w.speciesId).toBeGreaterThanOrEqual(1);
      expect(w.speciesId).toBeLessThanOrEqual(165);
      expect(w.level).toBeGreaterThanOrEqual(3);
      expect(w.level).toBeLessThanOrEqual(6);
    }
  });
});

describe('NPC 시야와 상호작용', () => {
  const kid = route.npcs[0];
  it('바라보는 방향 4칸 안이면 보인다', () => {
    expect(npcInSight(kid, { x: 20, y: 6 })).toBe(true);
    expect(npcInSight(kid, { x: 19, y: 6 })).toBe(false);
    expect(npcInSight(kid, { x: 25, y: 6 })).toBe(false); // 뒤쪽
    expect(npcInSight(kid, { x: 22, y: 7 })).toBe(false); // 옆줄
  });
  it('사이가 막히면 안 보인다', () => {
    expect(npcInSight(kid, { x: 21, y: 6 }, 4, (x) => x === 22)).toBe(false);
  });
  it('바라보는 칸의 NPC, 간판, 카운터 너머 NPC를 찾는다', () => {
    const girl = town.npcs[0];
    expect(interactTarget(town, town.npcs, at('town', girl.x - 1, girl.y, 'right'))).toMatchObject({ type: 'npc', npc: { id: girl.id } });
    const sign = town.signs[0];
    expect(interactTarget(town, town.npcs, at('town', sign.x, sign.y + 1, 'up'))).toMatchObject({ type: 'sign', sign: { x: sign.x } });
    const center = MAPS.center;
    expect(interactTarget(center, center.npcs, at('center', 4, 4, 'up'))).toMatchObject({ type: 'npc', npc: { id: 'center-nurse' } });
    expect(interactTarget(town, town.npcs, at('town', 6, 9, 'right'))).toBeNull();
    expect(facingTile(at('town', 3, 3, 'left'))).toEqual({ x: 2, y: 3 });
  });
});

describe('불러온 위치 검사', () => {
  const p = { badges: [], flags: ['starter'] };
  it('설 수 있는 칸이면 그대로', () => {
    expect(spawnOf(TOWN_START, TOWN_RESPAWN, TOWN_START, get, p)).toEqual(TOWN_START);
  });
  it('지도 밖이나 벽이면 부활 지점, 부활 지점도 나쁘면 시작점', () => {
    const wall = (() => {
      for (let y = 0; y < town.rows.length; y += 1) for (let x = 0; x < mapWidth(town); x += 1) if (!canStep(town, [], x, y)) return { x, y };
      throw new Error('벽 없음');
    })();
    expect(spawnOf(at('town', 999, 999), TOWN_RESPAWN, TOWN_START, get, p)).toEqual({ ...TOWN_RESPAWN, facing: 'down' });
    expect(spawnOf(at('town', wall.x, wall.y), TOWN_RESPAWN, TOWN_START, get, p)).toEqual({ ...TOWN_RESPAWN, facing: 'down' });
    expect(spawnOf(at('nowhere', 1, 1), { map: 'nowhere', x: 1, y: 1 }, TOWN_START, get, p)).toEqual(TOWN_START);
  });
});

describe('눈에 보이는 야생 오디', () => {
  const mon = (x: number, y: number, bold = false): WildMon => ({ id: 1, speciesId: 1, level: 3, x, y, facing: 'down', bold });
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
  it('풀숲이 있는 길에만 산다(마을에는 없다)', () => {
    expect(wildCap(town)).toBe(0);
    expect(wildCap(route)).toBeGreaterThanOrEqual(3);
    expect(wildCap(route)).toBeLessThanOrEqual(6);
    for (const p of wildHabitat(route)) expect(canStep(route, [], p.x, p.y)).toBe(true);
  });
  it('플레이어 가까이나 다른 오디 자리에는 나타나지 않는다', () => {
    const player = { x: 5, y: 3 };
    for (let k = 0; k < 30; k += 1) {
      const p = spawnWild(route, [{ x: 6, y: 3 }], player, Math.random)!;
      expect(Math.abs(p.x - player.x) + Math.abs(p.y - player.y)).toBeGreaterThanOrEqual(4);
      expect(p).not.toEqual({ x: 6, y: 3 });
    }
  });
  it('어슬렁거릴 때는 서식지 안 빈칸으로만 가고 다른 오디는 피한다', () => {
    const h = wildHabitat(route);
    const start = h[Math.floor(h.length / 2)];
    for (let k = 0; k < 4; k += 1) {
      const r = wildStep(mon(start.x, start.y), route, [], { x: 0, y: 0 }, seq(k / 4 + 0.01));
      if (r.moved) expect(h.some((p) => p.x === r.x && p.y === r.y)).toBe(true);
    }
    const blockedAll = [{ x: start.x + 1, y: start.y }, { x: start.x - 1, y: start.y }, { x: start.x, y: start.y + 1 }, { x: start.x, y: start.y - 1 }];
    for (let k = 0; k < 4; k += 1) expect(wildStep(mon(start.x, start.y), route, blockedAll, { x: 0, y: 0 }, seq(k / 4 + 0.01)).moved).toBe(false);
  });
  it('대담한 오디는 3칸 안의 플레이어에게 다가오고, 닿으면 전투(touch)', () => {
    const h = wildHabitat(route).find((p) => canStep(route, [], p.x + 1, p.y) && canStep(route, [], p.x + 2, p.y))!;
    const near = wildStep(mon(h.x, h.y, true), route, [], { x: h.x + 2, y: h.y }, () => 0.5);
    expect(near).toMatchObject({ moved: true, x: h.x + 1, facing: 'right' });
    expect(wildStep(mon(h.x, h.y, true), route, [], { x: h.x + 1, y: h.y }, () => 0.5)).toMatchObject({ touch: true, moved: false });
  });
  it('숨은 물건은 주우면(플래그) 사라진다', () => {
    const items = route.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(hiddenItems(route, [itemFlag(items[0].id)]).length).toBe(items.length - 1);
  });
});
