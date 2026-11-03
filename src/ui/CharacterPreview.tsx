import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildCharacter, CHARACTERS, disposeObject, loadCharacterModel } from '../world/characters.ts';

/** WebGL 컨텍스트 하나로 선택된 캐릭터만 천천히 돌려 보여 준다 */
export function CharacterPreview({ index }: { index: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const swapRef = useRef<(i: number) => void>(() => {});
  indexRef.current = index;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL이 없으면 미리보기 없이 이름 카드만 쓴다
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.0, 4.2);
    camera.lookAt(0, 0.8, 0);
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a8a80', 2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(3, 5, 4);
    scene.add(sun);

    const stage = new THREE.Group();
    scene.add(stage);
    let current: THREE.Object3D | null = null;
    let disposed = false;
    const cache = new Map<number, THREE.Object3D>();

    const show = (i: number) => {
      if (current) stage.remove(current);
      current = null;
      const cached = cache.get(i);
      if (cached) {
        current = cached;
        stage.add(cached);
        return;
      }
      const look = CHARACTERS[i] ?? CHARACTERS[0];
      void loadCharacterModel(look).then((model) => {
        if (disposed) return;
        const object = model ?? buildCharacter(look);
        cache.set(i, object);
        if (indexRef.current === i) {
          if (current) stage.remove(current);
          current = object;
          stage.add(object);
        }
      });
    };
    swapRef.current = show;
    show(indexRef.current);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      stage.rotation.y = time / 1000 * 0.8;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const object of cache.values()) disposeObject(object);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { swapRef.current(index); }, [index]);

  return <div className="character-preview" ref={containerRef} />;
}
