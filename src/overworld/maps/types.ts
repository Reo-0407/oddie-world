import type { RegionId } from '../../world/regions.ts';
import type { Facing } from '../../game/save.ts';

export type Dir = Facing;

export interface NpcLook {
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
  hat?: string;
}

export interface Npc {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Dir;
  look: NpcLook;
  lines: string[];
  /** 말을 다 하면 고르게 하는 질문 */
  choice?: { options: string[]; replies: string[][] };
  /** 트레이너: 바라보는 방향으로 sight칸 안에 들어오면 싸움을 건다 */
  trainer?: { sight: number; before: string[]; after: string[] };
  /** 오디 센터 간호사(회복), 상점 점원(상점 창), 박사(스타터) */
  role?: 'nurse' | 'clerk' | 'professor';
  /** 문지기: badges(전부)와 flag가 있어야 aside 칸으로 비켜선다. 막고 있을 때는 lines를 말한다 */
  gate?: { badges?: string[]; flag?: string; aside: { x: number; y: number }; open: string[] };
  /** 이 플래그가 있으면 lines 대신 말한다 */
  linesIf?: { flag: string; lines: string[] };
}

export interface Warp {
  x: number;
  y: number;
  to: { map: string; x: number; y: number; facing: Dir };
}

export interface Sign {
  x: number;
  y: number;
  text: string;
}

export interface MapData {
  id: string;
  name: string;
  region: RegionId;
  rows: string[];
  warps: Warp[];
  npcs: Npc[];
  signs: Sign[];
}
