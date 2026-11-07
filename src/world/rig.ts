import * as THREE from 'three';
import { classifyBone, type BonePart, type BoneSide } from './rigNames.ts';

/** 애니메이션이 없는 캐릭터 GLB를 뼈 회전만으로 움직인다: 팔을 내린 기본 자세, 걸을 때 팔다리 흔들기 */
export interface CharacterRig {
  /** phase: 걸음 위상(라디안). strength: 0이면 기본 자세, 1이면 걷는 중 */
  setPose(phase: number, strength: number): void;
}

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const ARM_DROP = 1.2; // T자에서 팔을 내리는 각도(라디안, 약 69도)
const ARM_SWING = 0.6;
const LEG_SWING = 0.7;

interface Limb {
  bone: THREE.Object3D;
  base: THREE.Quaternion;
  axis: THREE.Vector3;
  /** 걸음 파동에 곱하는 값: 앞으로 가는 방향 × 좌우 반대 위상 */
  gain: number;
}

/**
 * 뼈를 이름 패턴으로 찾아 방향을 스스로 알아낸다(모델마다 뼈 축이 달라도 되도록 시험 회전을 해 본다).
 * 필요한 뼈를 못 찾으면 null을 돌려주고, 호출한 쪽은 자세를 건드리지 않는다.
 */
export function buildRig(root: THREE.Object3D): CharacterRig | null {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    if (!(object as THREE.Bone).isBone) return;
    const kind = classifyBone(object.name);
    if (kind) bones.set(`${kind.part}${kind.side}`, object);
  });
  const get = (part: BonePart, side: BoneSide) => bones.get(`${part}${side}`);
  const sides: BoneSide[] = ['L', 'R'];
  if (sides.some((side) => !get('upperArm', side) || !get('upperLeg', side))) return null;

  const position = new THREE.Vector3();
  /** 뼈 하나를 root 기준 좌표로 */
  const where = (bone: THREE.Object3D) => {
    root.updateMatrixWorld(true);
    return root.worldToLocal(bone.getWorldPosition(position)).clone();
  };

  /** bone을 axis 둘레로 angle만큼 돌렸을 때 probe가 어디로 가는지 보고, 원래대로 되돌린다 */
  const trial = (bone: THREE.Object3D, probe: THREE.Object3D, axis: THREE.Vector3, angle: number) => {
    const saved = bone.quaternion.clone();
    bone.rotateOnAxis(axis, angle);
    const result = where(probe);
    bone.quaternion.copy(saved);
    return result;
  };

  const limbs: Limb[] = [];
  for (const side of sides) {
    const arm = get('upperArm', side)!;
    const armProbe = get('hand', side) ?? get('lowerArm', side) ?? arm.children[0];
    if (armProbe) {
      // 손이 가장 많이 내려가는 축과 방향으로 팔을 내린다
      let best = { axis: AXES[2], sign: 1, y: Infinity };
      for (const axis of AXES) {
        for (const sign of [1, -1]) {
          const y = trial(arm, armProbe, axis, sign * ARM_DROP).y;
          if (y < best.y) best = { axis, sign, y };
        }
      }
      arm.rotateOnAxis(best.axis, best.sign * ARM_DROP);
    }
    limbs.push(swingLimb(arm, armProbe, ARM_SWING, side === 'L' ? 1 : -1, trial));

    const leg = get('upperLeg', side)!;
    const legProbe = get('lowerLeg', side) ?? get('foot', side) ?? leg.children[0];
    limbs.push(swingLimb(leg, legProbe, LEG_SWING, side === 'L' ? -1 : 1, trial));
  }

  const swing = new THREE.Quaternion();
  return {
    setPose(phase, strength) {
      const wave = Math.sin(phase) * strength;
      for (const limb of limbs) {
        swing.setFromAxisAngle(limb.axis, limb.gain * wave);
        limb.bone.quaternion.copy(limb.base).multiply(swing);
      }
    },
  };
}

/** 앞뒤(+z)로 가장 크게 움직이는 축을 찾아, 양의 파동이 앞으로 가도록 부호를 정한다 */
function swingLimb(
  bone: THREE.Object3D,
  probe: THREE.Object3D | undefined,
  amplitude: number,
  phaseSign: number,
  trial: (bone: THREE.Object3D, probe: THREE.Object3D, axis: THREE.Vector3, angle: number) => THREE.Vector3,
): Limb {
  const base = bone.quaternion.clone();
  let axis = AXES[0];
  let forward = 1;
  if (probe) {
    const rest = trial(bone, probe, AXES[0], 0);
    let bestShift = 0;
    for (const candidate of AXES) {
      const shift = trial(bone, probe, candidate, 0.5).z - rest.z;
      if (Math.abs(shift) > Math.abs(bestShift)) {
        bestShift = shift;
        axis = candidate;
        forward = Math.sign(shift) || 1;
      }
    }
  }
  return { bone, base, axis: axis.clone(), gain: forward * amplitude * phaseSign };
}
