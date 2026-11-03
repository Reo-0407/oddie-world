import { MOVES, speciesById } from '../data/index.ts';
import { applyExp, coinReward, gainExp } from './growth.ts';
import { addCaught, type OwnedOddie } from './owned.ts';

export type BattleOutcome = 'won' | 'lost' | 'caught';

export interface LevelUp {
  name: string;
  from: number;
  to: number;
  newMoves: string[];
}

export interface BattleReport {
  outcome: BattleOutcome;
  exp: number;
  coins: number;
  levelUps: LevelUp[];
  team: OwnedOddie[];
  box: OwnedOddie[];
  /** 잡은 오디 이름 (박스로 갔는지 포함) */
  caught: { name: string; toBox: boolean } | null;
}

interface SettleInput {
  outcome: BattleOutcome;
  team: OwnedOddie[];
  box: OwnedOddie[];
  /** team과 같은 순서. 전투가 끝났을 때 서 있는 오디 */
  alive: boolean[];
  wildSpeciesId: number;
  wildLevel: number;
}

/** 전투 결과를 정산한다: 이기면 살아 있는 팀원이 경험치, 코인 지급. 잡으면 팀/박스에 추가 */
export function settleBattle(input: SettleInput): BattleReport {
  const wild = speciesById(input.wildSpeciesId);
  const report: BattleReport = {
    outcome: input.outcome, exp: 0, coins: 0, levelUps: [],
    team: input.team.map((oddie) => ({ ...oddie })), box: input.box, caught: null,
  };
  if (input.outcome === 'won') {
    report.exp = gainExp(input.wildLevel, wild.rarity);
    report.coins = coinReward(input.wildLevel, wild.rarity);
    report.team = input.team.map((oddie, index) => {
      if (!input.alive[index]) return { ...oddie };
      const species = speciesById(oddie.speciesId);
      const result = applyExp(oddie.level, oddie.exp, report.exp, species.learnset);
      if (result.level > oddie.level) {
        report.levelUps.push({
          name: species.name,
          from: oddie.level,
          to: result.level,
          newMoves: result.newMoveIds.map((id) => MOVES[id]?.name ?? `기술 ${id}`),
        });
      }
      return { ...oddie, level: result.level, exp: result.exp };
    });
  }
  if (input.outcome === 'caught') {
    const added = addCaught(report.team, report.box, { speciesId: wild.id, level: input.wildLevel, exp: 0 });
    report.team = added.team;
    report.box = added.box;
    report.caught = { name: wild.name, toBox: added.toBox };
  }
  return report;
}
