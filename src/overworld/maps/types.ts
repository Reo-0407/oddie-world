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
