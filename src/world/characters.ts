import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface CharacterLook {
  label: string;
  file: string; // public/characters/ 안의 GLB 파일 이름
  body: string; // GLB를 못 불러올 때 쓰는 대체 인간형의 옷 색
  hair: string;
  skin: string;
}

/** 캐릭터 6종 (GLB). 순서가 저장 번호이므로 바꾸지 말고 뒤에만 추가한다 */
export const CHARACTERS: readonly CharacterLook[] = [
  { label: '모험가', file: 'adventurer.glb', body: '#d94f3d', hair: '#3a2a20', skin: '#f2c9a0' },
  { label: '캐주얼', file: 'casual.glb', body: '#3b82d6', hair: '#e0b040', skin: '#e8b88e' },
  { label: '농부', file: 'farmer.glb', body: '#3bb273', hair: '#1f1f26', skin: '#f6d3b0' },
  { label: '펑크', file: 'punk.glb', body: '#8a5cd0', hair: '#c8d0d8', skin: '#d9a77c' },
  { label: '해변', file: 'beach.glb', body: '#f0a030', hair: '#5a3a20', skin: '#e8b88e' },
  { label: '왕', file: 'king.glb', body: '#c0392b', hair: '#d8d8d8', skin: '#f2c9a0' },
];

export const PLAYER_HEIGHT = 1.6;

export function characterUrl(look: CharacterLook): string {
  return `${import.meta.env.BASE_URL}characters/${look.file}`;
}

/** GLB를 불러와 높이를 맞추고 발을 y=0, 가운데를 x/z=0에 둔 그룹을 돌려준다. 실패하면 null */
export async function loadCharacterModel(look: CharacterLook, height = PLAYER_HEIGHT): Promise<THREE.Group | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync(characterUrl(look));
    const wrapper = new THREE.Group();
    wrapper.add(gltf.scene);
    const size = new THREE.Box3().setFromObject(wrapper).getSize(new THREE.Vector3());
    if (size.y > 0) gltf.scene.scale.setScalar(height / size.y);
    const fitted = new THREE.Box3().setFromObject(wrapper);
    const center = fitted.getCenter(new THREE.Vector3());
    gltf.scene.position.set(-center.x, -fitted.min.y, -center.z);
    return wrapper;
  } catch {
    return null;
  }
}

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
