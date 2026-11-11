import { speciesById } from '../data/index.ts';
import { dexMilestoneReward, markCaught } from '../game/dex.ts';
import { highestLevel } from '../game/owned.ts';
import { settleBattle } from '../game/rewards.ts';
import { START_LEVEL, type Ropes, type SaveData } from '../game/save.ts';

/** 오프라인 전투가 끝난 뒤 저장을 고친다. 돌려주는 lines는 월드 대화 상자에 보여 줄 문구 */
export interface Settled { save: SaveData; lines: string[] }

type Foe = { speciesId: number; level: number };

const levelLines = (ups: { name: string; to: number; newMoves: string[] }[]) => ups.map((u) =>
  `${u.name}의 레벨이 ${u.to}(으)로 올랐다!${u.newMoves.length ? ` 새 기술: ${u.newMoves.join(', ')}` : ''}`);

/** 이겼다: 쓰러뜨린 오디마다 경험치. 야생은 코인도, 트레이너는 reward만 받는다 */
export function settleWin(save: SaveData, alive: boolean[], foes: Foe[], trainer?: { id: string; reward: number }): Settled {
  let team = save.team;
  let exp = 0;
  let coins = 0;
  const ups: { name: string; from: number; to: number; newMoves: string[] }[] = [];
  for (const f of foes) {
    const r = settleBattle({ outcome: 'won', team, box: save.box, alive, wildSpeciesId: f.speciesId, wildLevel: f.level });
    team = r.team;
    exp += r.exp;
    coins += r.coins;
    for (const u of r.levelUps) {
      const prev = ups.find((p) => p.name === u.name && p.to === u.from);
      if (prev) { prev.to = u.to; prev.newMoves.push(...u.newMoves); } else ups.push({ ...u, newMoves: [...u.newMoves] });
    }
  }
  if (trainer) coins = trainer.reward;
  const next: SaveData = {
    ...save, team, coins: save.coins + coins, playerLevel: highestLevel(team, START_LEVEL),
    beaten: trainer && !save.beaten.includes(trainer.id) ? [...save.beaten, trainer.id] : save.beaten,
  };
  return { save: next, lines: [`경험치 +${exp}, 코인 +${coins}`, ...levelLines(ups)] };
}

/** 잡았다: 팀(꽉 차면 박스)에 넣고 도감에 적는다. 5종마다 도감 보상 */
export function settleCatch(save: SaveData, foe: Foe, ropes: Ropes): Settled {
  const r = settleBattle({ outcome: 'caught', team: save.team, box: save.box, alive: [], wildSpeciesId: foe.speciesId, wildLevel: foe.level });
  const next: SaveData = { ...save, team: r.team, box: r.box, ropes, dex: markCaught(save.dex, foe.speciesId) };
  next.playerLevel = highestLevel(next.team, START_LEVEL);
  const name = speciesById(foe.speciesId).name;
  const lines = [`${name}을(를) 잡았다!${r.caught?.toBox ? ' 팀이 꽉 차서 박스로 보냈다.' : ''}`];
  const bonus = dexMilestoneReward(save.dex.caught.length, next.dex.caught.length);
  if (bonus) {
    next.coins += bonus.coins;
    next.ropes = { basic: next.ropes.basic + bonus.ropes, sturdy: next.ropes.sturdy + bonus.sturdy };
    lines.push(`도감 ${next.dex.caught.length}종 달성! 코인 +${bonus.coins}, 로프 +${bonus.ropes}, 튼튼한 로프 +${bonus.sturdy}`);
  }
  return { save: next, lines };
}

/** 졌다: 부활 지점으로, 코인 절반을 잃는다(팀 체력은 저장하지 않으니 따로 회복할 것이 없다) */
export function settleLoss(save: SaveData): Settled {
  const lost = Math.floor(save.coins / 2);
  return {
    save: { ...save, coins: save.coins - lost, map: save.respawn.map, x: save.respawn.x, y: save.respawn.y, facing: 'down' },
    lines: ['눈앞이 깜깜해졌다…', lost > 0 ? `코인 ${lost}개를 잃었다. 오디들은 모두 회복했다.` : '오디들은 모두 회복했다.'],
  };
}
