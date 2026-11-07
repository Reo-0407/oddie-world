/** 캐릭터 GLB의 뼈 이름을 읽어 어느 부위인지 알려 준다. 모델마다 이름 꼴이 조금 달라도 패턴으로 찾는다 */

export type BonePart = 'shoulder' | 'upperArm' | 'lowerArm' | 'hand' | 'upperLeg' | 'lowerLeg' | 'foot';
export type BoneSide = 'L' | 'R';

export interface BoneKind {
  part: BonePart;
  side: BoneSide;
}

/**
 * three는 "UpperArm.L"의 점을 지워 "UpperArmL"로 만들기도 하고, 다른 도구는 "upper_arm_left"처럼 쓴다.
 * 구분 글자를 모두 빼고 소문자로 맞춘 뒤 비교한다.
 */
export function classifyBone(rawName: string): BoneKind | null {
  const name = rawName.toLowerCase().replace(/[^a-z]/g, '');
  const side: BoneSide | null = /(left|l)$/.test(name) ? 'L' : /(right|r)$/.test(name) ? 'R' : null;
  if (!side) return null;
  const stem = name.replace(/(left|right|l|r)$/, '');
  const parts: [RegExp, BonePart][] = [
    [/^(shoulder|clavicle)$/, 'shoulder'],
    [/^(upperarm|uparm|arm)$/, 'upperArm'],
    [/^(lowerarm|forearm|lowarm)$/, 'lowerArm'],
    [/^hand$/, 'hand'],
    [/^(upperleg|upleg|thigh)$/, 'upperLeg'],
    [/^(lowerleg|calf|shin|lowleg)$/, 'lowerLeg'],
    [/^(foot|ankle)$/, 'foot'],
  ];
  for (const [pattern, part] of parts) if (pattern.test(stem)) return { part, side };
  return null;
}
