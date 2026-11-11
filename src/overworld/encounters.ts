import { SPECIES } from '../data/index.ts';
import { pickSpeciesForRegion, type RegionId } from '../world/regions.ts';

/** 구역별 야생 오디 레벨 범위 */
export const WILD_LEVELS: Record<RegionId, [number, number]> = {
  meadow: [3, 6], desert: [10, 14], snow: [17, 22], volcano: [25, 30],
};
const CANDIDATES = SPECIES.map((s) => ({ id: s.id, types: s.types }));

export interface WildRoll { speciesId: number; level: number; region: RegionId }

export function rollWild(region: RegionId, rand: () => number): WildRoll {
  const [lo, hi] = WILD_LEVELS[region];
  return { speciesId: pickSpeciesForRegion(region, CANDIDATES, rand), level: lo + Math.floor(rand() * (hi - lo + 1)), region };
}

export interface TrainerTeamMember { speciesId: number; level: number }

export interface Trainer {
  /** 지도 NPC의 id와 같다 */
  id: string;
  name: string;
  team: TrainerTeamMember[];
  /** 이기면 받는 코인 */
  reward: number;
  lines: { before: string; after: string };
  /** 관장: 이기면 받는 배지 id */
  badge?: RegionId;
  /** 챔피언: 이기면 엔딩 */
  champion?: boolean;
}

/** 배지 id(구역) → 이름 */
export const BADGE_NAMES: Record<RegionId, string> = { meadow: '초원 배지', desert: '사막 배지', snow: '설원 배지', volcano: '화산 배지' };
export const BADGE_ORDER: RegionId[] = ['meadow', 'desert', 'snow', 'volcano'];

type Mon = [speciesId: number, level: number];
const t = (id: string, name: string, mons: Mon[], reward: number, before: string, after: string, extra: Partial<Trainer> = {}): Trainer =>
  ({ id, name, team: mons.map(([speciesId, level]) => ({ speciesId, level })), reward, lines: { before, after }, ...extra });
/** 관장 팀 레벨 = 그 구역 길 야생 최고 레벨 + 3 */
const leaderLevel = (r: RegionId) => WILD_LEVELS[r][1] + 3;
const leader = (r: RegionId, name: string, species: number[], after: string) =>
  t(`leader-${r}`, name, species.map((id) => [id, leaderLevel(r)] as Mon), 500 + BADGE_ORDER.indexOf(r) * 400, '', after, { badge: r });

export const TRAINERS: Record<string, Trainer> = {
  'route1-kid': {
    id: 'route1-kid',
    name: '꼬마 트레이너',
    // 1번 Pippo(풀), 그리고 초원 타입 하나 더
    team: [{ speciesId: 1, level: 5 }, { speciesId: 2, level: 7 }],
    reward: 120,
    lines: { before: '나랑 승부하자!', after: '으앙, 졌다… 너 정말 세구나!' },
  },
  ...Object.fromEntries([
    t('route1-lass', '꽃 소녀', [[4, 6], [57, 7]], 140, '내 오디들이랑 놀아 줘!', '다음엔 꼭 이길 거야!'),
    t('gym-meadow-1', '정원사', [[1, 7], [55, 7]], 180, '관장님께 가려면 나부터!', '꽃처럼 활짝 졌다…'),
    leader('meadow', '초원 관장 새싹', [7, 5, 9], '훌륭해! 초원 배지는 네 거야.'),
    t('route2-hiker', '사막 등산가', [[13, 11], [15, 12]], 260, '사막 한가운데서 승부다!', '물… 물 좀…'),
    t('route2-camper', '캠핑족', [[14, 12], [16, 12], [18, 13]], 300, '내 텐트 앞을 지나가려면 이겨야지!', '캠핑은 역시 쉬는 게 최고야.'),
    t('route2-ranger', '사막 순찰대', [[20, 14]], 300, '순찰 중!', '좋아, 통과!'),
    t('gym-desert-1', '모래 소년', [[19, 14]], 320, '모래 폭풍처럼!', '모래가 눈에 들어갔어…'),
    t('gym-desert-2', '탐험가', [[13, 14], [20, 15]], 360, '피라미드보다 단단하다!', '내 보물 지도가…'),
    leader('desert', '사막 관장 모래', [17, 21, 22], '너의 열정이 사막보다 뜨겁구나. 사막 배지를 가져가!'),
    t('route3-skier', '스키어', [[26, 18], [28, 18]], 420, '내 스키보다 빠를 수 있어?', '넘어져 버렸다…'),
    t('route3-diver', '얼음 낚시꾼', [[27, 19], [30, 20]], 440, '오디로 승부다!', '오늘은 허탕이군.'),
    t('route3-climber', '설산 등반가', [[32, 21], [31, 20], [33, 22]], 480, '몸 좀 풀자!', '너야말로 진짜 산사나이구나.'),
    t('gym-snow-1', '스케이터', [[29, 21]], 480, '얼음 위에서는 내가 최고야!', '미끄러졌다…'),
    t('gym-snow-2', '설산 등반가', [[31, 22], [33, 22]], 520, '정상까지 가려면!', '눈사태 같은 기세였어.'),
    leader('snow', '설원 관장 서리', [34, 35, 36], '얼음이 녹아 버렸어. 설원 배지를 받아.'),
    t('route4-firebreather', '불 뿜는 곡예사', [[40, 26], [42, 27]], 600, '내 불꽃 쇼!', '불이 꺼져 버렸네…'),
    t('route4-miner', '광부', [[41, 27], [43, 28], [44, 28]], 640, '곡괭이로 단련한 오디다!', '일찍 퇴근해야겠다.'),
    t('route4-veteran', '노련한 트레이너', [[45, 29], [47, 30]], 700, '덤벼라!', '챔피언도 노려 볼 만하겠어.'),
    t('gym-volcano-1', '불꽃 소녀', [[46, 29]], 700, '내 불꽃은 꺼지지 않아!', '불씨만 남았다…'),
    t('gym-volcano-2', '용암 광부', [[50, 30], [44, 30]], 760, '용암 속에서 캐낸 힘!', '곡괭이가 부러졌다.'),
    leader('volcano', '화산 관장 불꽃', [48, 49, 51], '네 불꽃이 더 뜨거웠어. 화산 배지다!'),
    t('champion', '챔피언 하늘', [[134, 32], [119, 33], [141, 33], [37, 34], [53, 35]], 5000, '', '오늘부터 네가 새 챔피언이야!', { champion: true }),
  ].map((tr) => [tr.id, tr])),
};

export const trainerById = (id: string): Trainer | undefined => TRAINERS[id];
