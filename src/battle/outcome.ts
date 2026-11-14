import { speciesById } from '../data/index.ts';
import { dexMilestoneReward, markCaught, markShiny } from '../game/dex.ts';
import { comboBonus, nextCombo } from '../game/fun.ts';
import { addCandy, catchCandy, RARE_CANDY_NAME } from '../game/candy.ts';
import { RAID_COINS, REMATCH_RARE_CANDY, isoWeek } from '../game/postgame.ts';
import { highestLevel } from '../game/owned.ts';
import { advanceQuests, questText, rewardText, type QuestCtx, type QuestEvent } from '../game/quests.ts';
import { grantExp, settleBattle } from '../game/rewards.ts';
import { START_LEVEL, type Ropes, type SaveData } from '../game/save.ts';
import { BADGE_NAMES, STRONG_REWARD, TRAINERS, type Trainer } from '../overworld/encounters.ts';
import { MAPS, getMap, type HiddenItem } from '../overworld/maps/index.ts';
import { itemFlag } from '../overworld/world.ts';
import { ROD_FLAG } from '../overworld/fishing.ts';

/** 오프라인 전투가 끝난 뒤 저장을 고친다. 돌려주는 lines는 월드 대화 상자에 보여 줄 문구 */
export interface Settled { save: SaveData; lines: string[] }

type Foe = { speciesId: number; level: number; shiny?: boolean; strong?: boolean };
type Up = { name: string; from?: number; to: number; newMoves: string[] };

const levelLines = (ups: Up[]) => ups.map((u) =>
  `${u.name}의 레벨이 ${u.to}(으)로 올랐다!${u.newMoves.length ? ` 새 기술: ${u.newMoves.join(', ')}` : ''}`);

/** 이겼다: 쓰러뜨린 오디마다 경험치. 야생은 코인도, 트레이너는 reward만 받는다 */
export function settleWin(save: SaveData, alive: boolean[], foes: Foe[], trainer?: { id: string; reward: number }): Settled {
  let team = save.team;
  let exp = 0;
  let coins = 0;
  const ups: Up[] = [];
  for (const f of foes) {
    const r = settleBattle({
      outcome: 'won', team, box: save.box, alive, wildSpeciesId: f.speciesId, wildLevel: f.level, rewardScale: f.strong ? STRONG_REWARD : 1,
    });
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
  // 야생은 무엇을 쓰러뜨려서 경험치를 받았는지 먼저 말한다(잡지 않아도 경험치는 받는다)
  const head = !trainer && foes.length === 1
    ? `${speciesById(foes[0].speciesId).name}을(를) 쓰러뜨렸다! 경험치 +${exp} · 코인 +${coins}`
    : `경험치 +${exp}, 코인 +${coins}`;
  return { save: next, lines: [head, ...levelLines(ups)] };
}

/** 잡았다: 팀(꽉 차면 박스)에 넣고 도감에 적는다. 5종마다 도감 보상, 같은 종을 연속으로 잡으면 보너스. 경험치는 이길 때 이미 받았으니 다시 주지 않는다 */
export function settleCatch(save: SaveData, foe: Foe, ropes: Ropes): Settled & { isNew: boolean; combo: number } {
  const r = settleBattle({ outcome: 'caught', team: save.team, box: save.box, alive: [], wildSpeciesId: foe.speciesId, wildLevel: foe.level, wildShiny: foe.shiny });
  const isNew = !save.dex.caught.includes(foe.speciesId);
  const combo = nextCombo(save.combo, foe.speciesId);
  const next: SaveData = {
    ...save, team: r.team, box: r.box, ropes, combo,
    dex: foe.shiny ? markShiny(save.dex, foe.speciesId) : markCaught(save.dex, foe.speciesId),
  };
  const name = speciesById(foe.speciesId).name;
  const lines = [`${foe.shiny ? '✨ 반짝이 ' : ''}${name}을(를) 잡았다!${isNew ? ' 도감에 새로 등록!' : ''}${r.caught?.toBox ? ' 팀이 꽉 차서 박스로 보냈다.' : ''}`];
  const candy = catchCandy(combo.count);
  Object.assign(next, { candy: addCandy(next, foe.speciesId, candy).candy });
  lines.push(`${name} 사탕 +${candy}`);
  const bonus = comboBonus(combo.count);
  if (bonus) {
    next.coins += bonus.coins;
    const g = grantExp(next.team, 0, bonus.exp);
    next.team = g.team;
    lines.push(`${name} ${combo.count}연속 잡기! 보너스 코인 +${bonus.coins}, 경험치 +${bonus.exp}`);
    if (g.levelUp) lines.push(...levelLines([g.levelUp]));
  }
  next.playerLevel = highestLevel(next.team, START_LEVEL);
  const dexBonus = dexMilestoneReward(save.dex.caught.length, next.dex.caught.length);
  if (dexBonus) {
    next.coins += dexBonus.coins;
    next.ropes = { basic: next.ropes.basic + dexBonus.ropes, sturdy: next.ropes.sturdy + dexBonus.sturdy };
    lines.push(`도감 ${next.dex.caught.length}종 달성! 코인 +${dexBonus.coins}, 로프 +${dexBonus.ropes}, 튼튼한 로프 +${dexBonus.sturdy}`);
  }
  return { save: next, lines, isNew, combo: combo.count };
}

/** 졌다: 부활 지점으로, 코인 절반을 잃는다(팀 체력은 저장하지 않으니 따로 회복할 것이 없다) */
export function settleLoss(save: SaveData): Settled {
  const lost = Math.floor(save.coins / 2);
  return {
    save: { ...save, coins: save.coins - lost, map: save.respawn.map, x: save.respawn.x, y: save.respawn.y, facing: 'down' },
    lines: ['눈앞이 깜깜해졌다…', lost > 0 ? `코인 ${lost}개를 잃었다. 오디들은 모두 회복했다.` : '오디들은 모두 회복했다.'],
  };
}

/** 트레이너를 이겼다: 경험치·보상, 퀘스트, 배지, 챔피언(처음 이기면 champion = true: 엔딩을 보여 준다) */
export function settleTrainer(save: SaveData, alive: boolean[], tr: Trainer): Settled & { champion: boolean } {
  const s = settleWin(save, alive, tr.team, tr);
  const q = questsAfter(s.save, { kind: 'beatTrainer' });
  const lines = [tr.lines.after, ...s.lines, ...q.lines];
  let next = q.save;
  if (tr.badge && !next.badges.includes(tr.badge)) {
    next = { ...next, badges: [...next.badges, tr.badge] };
    lines.push(`${BADGE_NAMES[tr.badge]}를 받았다!`);
  }
  const champion = !!tr.champion && !next.flags.includes('champion');
  if (champion) next = { ...next, flags: [...next.flags, 'champion'] };
  return { save: next, lines, champion };
}

/** 관장 재도전을 이겼다: 큰 코인과 이상한 사탕, 오늘은 끝 */
export function settleRematch(save: SaveData, alive: boolean[], tr: Trainer, today: string): Settled {
  const s = settleWin(save, alive, tr.team, tr);
  const q = questsAfter(s.save, { kind: 'beatTrainer' });
  const next: SaveData = {
    ...q.save, rareCandy: (q.save.rareCandy ?? 0) + REMATCH_RARE_CANDY, rematch: { ...q.save.rematch, [tr.id]: today },
  };
  return { save: next, lines: [tr.lines.after, ...s.lines, `${RARE_CANDY_NAME} +${REMATCH_RARE_CANDY}`, ...q.lines] };
}

/** 레이드 보스를 쓰러뜨렸다: 경험치·코인, 이번 주는 끝(잡기는 황금 로프로 따로) */
export function settleRaidWin(save: SaveData, alive: boolean[], boss: Foe, today: string): Settled {
  const s = settleWin(save, alive, [boss]);
  return {
    save: { ...s.save, coins: s.save.coins + RAID_COINS, raid: { week: isoWeek(today) } },
    lines: [`레이드 보스 ${speciesById(boss.speciesId).name}을(를) 쓰러뜨렸다!`, ...s.lines.slice(1), `레이드 보상 코인 +${RAID_COINS}`],
  };
}

const GIFT_NAME: Record<HiddenItem['gift'], string> = { rope: '로프', sturdy: '튼튼한 로프', potion: '회복약', coins: '코인' };

/** 숨은 물건을 주웠다(이미 주운 것이면 그대로) */
export function collectItem(save: SaveData, it: HiddenItem): Settled {
  if (save.flags.includes(itemFlag(it.id))) return { save, lines: [] };
  const next: SaveData = { ...save, flags: [...save.flags, itemFlag(it.id)] };
  if (it.gift === 'rope') next.ropes = { ...save.ropes, basic: save.ropes.basic + it.n };
  else if (it.gift === 'sturdy') next.ropes = { ...save.ropes, sturdy: save.ropes.sturdy + it.n };
  else if (it.gift === 'potion') next.potions = save.potions + it.n;
  else next.coins = save.coins + it.n;
  const q = questsAfter(next, { kind: 'findItem' });
  return { save: q.save, lines: [`반짝이는 곳에서 ${GIFT_NAME[it.gift]} ${it.n}개를 주웠다!`, ...q.lines] };
}

const ALL_ITEMS = Object.values(MAPS).flatMap((m) => m.items ?? []);
const TRAINER_IDS = Object.keys(TRAINERS);

/** 지금 저장 기준 퀘스트 재료: 지금 구역, 남은 트레이너·숨은 물건 */
export function questCtx(save: SaveData): QuestCtx {
  return {
    region: getMap(save.map)?.region ?? 'meadow',
    trainersLeft: TRAINER_IDS.filter((id) => !save.beaten.includes(id)).length,
    itemsLeft: ALL_ITEMS.filter((i) => !save.flags.includes(itemFlag(i.id))).length,
    hasRod: save.flags.includes(ROD_FLAG),
  };
}

/** 퀘스트 진행: 끝난 퀘스트의 보상을 주고 "퀘스트 완료!" 문구를 돌려준다 */
export function questsAfter(save: SaveData, ev: QuestEvent, rand: () => number = Math.random): Settled {
  if (save.team.length === 0) return { save, lines: [] };
  const { state, completed } = advanceQuests(save.quests, ev, questCtx(save), rand);
  const next: SaveData = { ...save, quests: state };
  const lines: string[] = [];
  for (const q of completed) {
    next.coins += q.reward.coins;
    next.ropes = { basic: next.ropes.basic + q.reward.basic, sturdy: next.ropes.sturdy + q.reward.sturdy };
    next.potions += q.reward.potions;
    lines.push(`퀘스트 완료! 「${questText(q)}」 ${rewardText(q.reward)}`);
  }
  return { save: next, lines };
}
