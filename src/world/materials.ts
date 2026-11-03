import * as THREE from 'three';

// glTF는 metallicFactor가 없으면 1(금속)로 읽혀서 환경맵이 없는 장면에서 까맣게 나온다.
export function matte(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.metalness = 0;
        material.roughness = Math.max(material.roughness, 0.8);
      }
    }
  });
}
