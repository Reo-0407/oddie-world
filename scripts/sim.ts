/**
 * AI 대 AI 자동 대전 시뮬레이션. 3대3, 레벨 30과 40, 시드 고정.
 * 확인하는 것: 오류(예외), 무한 전투(턴 상한 초과), 재생 불일치(같은 시드 두 번이 다름), 역할/등급별 승률.
 * 실행: npm run sim [판수=8000]
 */
import { MOVES, SPECIES, speciesById } from '../src/data/index.ts';
import { chooseAiAction, chooseAiSwitch } from '../src/engine/ai.ts';
import { createRng } from '../src/engine/rng.ts';
import { activeOf, resolveForcedSwitch, resolveTurn } from '../src/engine/turn.ts';
import type { BattleState } from '../src/engine/types.ts';
import { createBattle, createBattlePokemon } from '../src/game/factory.ts';

const GAMES = Number(process.argv[2] ?? 8000);
const TURN_LIMIT = 400;
const LEVELS = [30, 40];

interface Outcome {
  winner: 0 | 1 | null;
  turns: number;
  digest: string;
  error: string | null;
  teams: [number[], number[]];
}

function pickTeams(game: number): [number[], number[]] {
  const rng = createRng(game * 7919 + 13);
  const pick = (): number[] => {
    const ids: number[] = [];
    while (ids.length < 3) {
      const id = SPECIES[rng.int(0, SPECIES.length - 1)].id;
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  return [pick(), pick()];
}

/** 고유 기술 사용률: 효과 종류별로 (쓴 횟수, 쓸 수 있었던 횟수) */
const signatureUse = new Map<string, [number, number]>();
function noteSignature(state: BattleState, side: 0 | 1, moveIndex: number) {
  const pokemon = activeOf(state, side);
  const signatureId = speciesById(pokemon.speciesId).signatureMoveId;
  const index = pokemon.moves.findIndex((m) => m.id === signatureId);
  if (index < 0) return;
  const move = pokemon.moves[index];
  const key = move.priority > 0 ? 'pri' : move.effects[0]?.kind ?? (move.category === 'status' ? 'status' : 'plain');
  const entry = signatureUse.get(key) ?? [0, 0];
  entry[1] += 1;
  if (index === moveIndex) entry[0] += 1;
  signatureUse.set(key, entry);
}

function play(game: number, record = false): Outcome {
  const teams = pickTeams(game);
  const level = LEVELS[game % LEVELS.length];
  const build = (ids: number[]) => ids.map((id) => createBattlePokemon(speciesById(id), level, MOVES));
  let state: BattleState = createBattle(build(teams[0]), build(teams[1]), game + 1);
  let turns = 0;
  let digest = '';
  try {
    while (state.winner === null && turns < TURN_LIMIT) {
      const actions = [chooseAiAction(state, 0), chooseAiAction(state, 1)] as const;
      if (record) {
        for (const side of [0, 1] as const) {
          const action = actions[side];
          if (action.kind === 'move') noteSignature(state, side, action.moveIndex);
        }
      }
      const result = resolveTurn(state, [actions[0], actions[1]]);
      state = result.state;
      digest += `${result.events.length}:${state.rngState};`;
      turns += 1;
      for (const side of [0, 1] as const) {
        if (state.winner === null && state.pendingSwitch[side]) {
          const next = chooseAiSwitch(state, side);
          if (next < 0) throw new Error('교체할 오디가 없는데 교체를 요구함');
          const swap = resolveForcedSwitch(state, side, next);
          state = swap.state;
          digest += `s${swap.events.length}:${state.rngState};`;
        }
      }
    }
  } catch (error) {
    return { winner: null, turns, digest, error: String(error), teams };
  }
  return { winner: state.winner, turns, digest, error: null, teams };
}

let errors = 0;
let endless = 0;
let mismatches = 0;
let turnSum = 0;
const roleWins = new Map<string, [number, number]>();
const rarityWins = new Map<string, [number, number]>();
const bump = (map: Map<string, [number, number]>, key: string, won: boolean) => {
  const entry = map.get(key) ?? [0, 0];
  entry[1] += 1;
  if (won) entry[0] += 1;
  map.set(key, entry);
};

for (let game = 0; game < GAMES; game += 1) {
  const first = play(game, true);
  const second = play(game);
  if (first.error || second.error) {
    errors += 1;
    if (errors <= 5) console.log(`오류 #${game}: ${first.error ?? second.error}`);
    continue;
  }
  if (first.winner === null) {
    endless += 1;
    if (endless <= 5) console.log(`무한전투 #${game}: 팀 ${first.teams[0].join(',')} vs ${first.teams[1].join(',')}`);
    continue;
  }
  if (first.winner !== second.winner || first.turns !== second.turns || first.digest !== second.digest) mismatches += 1;
  turnSum += first.turns;
  for (const side of [0, 1] as const) {
    for (const id of first.teams[side]) {
      const species = speciesById(id);
      const won = first.winner === side;
      bump(roleWins, species.role, won);
      bump(rarityWins, species.rarity, won);
    }
  }
}

const table = (map: Map<string, [number, number]>) =>
  [...map.entries()]
    .map(([key, [wins, total]]) => ({ key, rate: (wins / total) * 100, total }))
    .sort((a, b) => b.rate - a.rate)
    .map((row) => `${row.key} ${row.rate.toFixed(1)}%`)
    .join(', ');

const usage = [...signatureUse.entries()].map(([k, [u, n]]) => `${k} ${((u / n) * 100).toFixed(0)}%`).join(', ');
const rates = [...roleWins.values()].map(([w, t]) => (w / t) * 100);
console.log(`판수 ${GAMES} | 오류 ${errors} | 무한전투 ${endless} | 재생불일치 ${mismatches} | 평균 ${(turnSum / Math.max(1, GAMES)).toFixed(1)}턴`);
console.log(`역할별: ${table(roleWins)}`);
console.log(`고유 기술 사용률(효과별): ${usage}`);
console.log(`등급별: ${table(rarityWins)}`);
console.log(`역할 승률 범위: ${Math.min(...rates).toFixed(1)}% ~ ${Math.max(...rates).toFixed(1)}%`);
if (errors > 0 || endless > 0 || mismatches > 0) process.exitCode = 1;
