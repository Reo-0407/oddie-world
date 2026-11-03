import * as THREE from 'three';

export interface CharacterLook {
  label: string;
  body: string; // 옷 색
  hair: string; // 머리 색
  skin: string;
}

/** 캐릭터 4종: 몸색/머리색만 다른 로우폴리 인간형 */
export const CHARACTERS: readonly CharacterLook[] = [
  { label: '빨강 모자', body: '#d94f3d', hair: '#3a2a20', skin: '#f2c9a0' },
  { label: '파랑 바람막이', body: '#3b82d6', hair: '#e0b040', skin: '#e8b88e' },
  { label: '초록 탐험가', body: '#3bb273', hair: '#1f1f26', skin: '#f6d3b0' },
  { label: '보라 마법사', body: '#8a5cd0', hair: '#c8d0d8', skin: '#d9a77c' },
];

/** 원시 도형으로 조립한 인간형. 발이 y=0, 키 약 1.4 */
export function buildCharacter(look: CharacterLook): THREE.Group {
  const group = new THREE.Group();
  const mat = (color: string) => new THREE.MeshLambertMaterial({ color, flatShading: true });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), mat('#3b3f4a'));
  legs.position.y = 0.25;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.32), mat(look.body));
  torso.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), mat(look.skin));
  head.position.y = 1.2;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(look.hair),
  );
  hair.position.y = 1.24;
  hair.rotation.x = -0.2;
  const armGeometry = new THREE.BoxGeometry(0.14, 0.5, 0.16);
  const left = new THREE.Mesh(armGeometry, mat(look.body));
  left.position.set(-0.36, 0.78, 0);
  const right = new THREE.Mesh(armGeometry, mat(look.body));
  right.position.set(0.36, 0.78, 0);

  group.add(legs, torso, head, hair, left, right);
  return group;
}

/** 장면 그래프의 지오메트리/재질/텍스처를 모두 해제 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}
