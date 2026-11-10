import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { speciesById } from '../data/index.ts';
import { typeColor } from '../ui/OddieArt.tsx';
import { modelUrl } from './spawns.ts';

export const MODEL_HEIGHT = 1.2;

/** 오디 GLB를 종마다 한 번만 불러오고 높이를 맞춘 뒤, 필요한 만큼 복제해 준다. 못 불러오면 타입 색 구체 */
export class OddieModels {
  private loader = new GLTFLoader();
  private templates = new Map<number, Promise<THREE.Object3D | null>>();
  private extras: { dispose(): void }[] = [];

  private load(speciesId: number): Promise<THREE.Object3D | null> {
    let pending = this.templates.get(speciesId);
    if (!pending) {
      pending = this.loader.loadAsync(modelUrl(speciesId)).then((gltf) => {
        // 어두운 PBR 재질을 밝고 부드럽게: 금속성 제거, 텍스처를 약하게 스스로 빛나게
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const m = material as THREE.MeshStandardMaterial;
            if (!m.isMeshStandardMaterial) continue;
            m.metalness = 0;
            m.roughness = 1;
            if (m.map) { m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = m.map; m.emissiveIntensity = 0.5; }
          }
        });
        const wrapper = new THREE.Group();
        wrapper.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(wrapper);
        const size = box.getSize(new THREE.Vector3());
        const scale = size.y > 0
          ? Math.min(MODEL_HEIGHT / size.y, 2 / Math.max(size.x, size.z, 0.001))
          : 1;
        gltf.scene.scale.setScalar(scale);
        const fitted = new THREE.Box3().setFromObject(wrapper);
        const center = fitted.getCenter(new THREE.Vector3());
        gltf.scene.position.set(-center.x, -fitted.min.y, -center.z);
        return wrapper as THREE.Object3D;
      }).catch(() => null);
      this.templates.set(speciesId, pending);
    }
    return pending;
  }

  async create(speciesId: number): Promise<THREE.Object3D> {
    const template = await this.load(speciesId);
    if (template) return cloneSkinned(template);
    const geometry = new THREE.SphereGeometry(MODEL_HEIGHT / 2, 12, 10);
    const material = new THREE.MeshLambertMaterial({ color: typeColor(speciesById(speciesId).types[0]) });
    this.extras.push(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = MODEL_HEIGHT / 2;
    return mesh;
  }

  dispose(disposeObject: (root: THREE.Object3D) => void): void {
    for (const pending of this.templates.values()) {
      void pending.then((template) => { if (template) disposeObject(template); });
    }
    for (const item of this.extras) item.dispose();
    this.extras = [];
  }
}
