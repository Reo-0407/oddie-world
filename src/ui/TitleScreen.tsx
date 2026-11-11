import { useEffect, useRef } from 'react';
import { PLAYER_LOOKS, drawCharacter } from '../overworld/sprites.ts';
import { TILE, drawTile, parseRows } from '../overworld/tiles.ts';
import { thumbUrl } from './OddieArt.tsx';
import { SoundToggle } from './SoundToggle.tsx';

const TREES = parseRows(['TTTTTTTTTTTTTTTTTTTT']);
const GROUND = parseRows([
  '..f....f..."""..f...',
  '::::::::::::::::::::',
  '.."""..f.....""..f..',
  '""""..""""f..""""...',
]);
const W = 20 * TILE;

/** 줄 하나를 한 번만 그려 둔다(타일 그리기는 월드와 같은 함수) */
function strip(rows: number[][]) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = rows.length * TILE;
  const c = cv.getContext('2d')!;
  rows.forEach((row, y) => row.forEach((t, x) => drawTile(c, t, x * TILE, y * TILE, 0, 'meadow', (x * 7 + y * 13) % 17)));
  return cv;
}

/** 타이틀·로그인 뒤에서 천천히 흘러가는 초원(구름·나무·풀숲, 걷는 주인공) */
export function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const c = canvas.getContext('2d')!;
    const trees = strip(TREES);
    const ground = strip(GROUND);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      const scale = Math.max(1, Math.round(canvas.clientHeight / 260));
      const w = Math.ceil(canvas.clientWidth / scale);
      const h = Math.ceil(canvas.clientHeight / scale);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      c.imageSmoothingEnabled = false;
      const t = still ? 0 : (now - t0) / 1000;
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#6ec6f0');
      sky.addColorStop(0.7, '#cdeefc');
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      // 구름
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i += 1) {
        const cx = ((i * 157 - t * (6 + i)) % (w + 120) + w + 120) % (w + 120) - 60;
        const cy = 18 + i * 17;
        for (const [dx, dy, r] of [[0, 0, 12], [14, 4, 10], [-14, 4, 9], [6, -6, 9]]) {
          c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); c.fill();
        }
      }
      // 먼 언덕
      c.fillStyle = '#8fd07a';
      const base = h - GROUND.length * TILE - TILE;
      for (let x = -40; x < w + 80; x += 80) {
        const ox = x - ((t * 10) % 80);
        c.beginPath(); c.ellipse(ox, base + 10, 60, 30, 0, Math.PI, 0); c.fill();
      }
      const blit = (img: HTMLCanvasElement, speed: number, y: number) => {
        const off = Math.floor((t * speed) % W);
        for (let x = -off; x < w; x += W) c.drawImage(img, x, y);
      };
      blit(trees, 18, base);
      blit(ground, 36, h - GROUND.length * TILE);
      const frame = still ? 0 : 1 + (Math.floor(t * 6) % 2);
      drawCharacter(c, PLAYER_LOOKS[0], 'right', frame, Math.floor(w * 0.3), h - 3 * TILE);
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onResize = () => { if (still) raf = requestAnimationFrame(draw); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={ref} className="title-bg" aria-hidden />;
}

const MONS = [1, 42, 107, 4, 25, 60].filter((id) => thumbUrl(id)).slice(0, 5);

/** 첫 화면: 로고 + 「터치해서 시작」. 이 터치가 소리도 켠다 */
export function TitleScreen({ onStart }: { onStart(): void }) {
  const live = useRef(onStart);
  live.current = onStart;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (['Enter', 'Space', 'KeyZ'].includes(e.code)) { e.preventDefault(); live.current(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <main className="title" onClick={onStart}>
      <TitleBackdrop />
      <div className="title-mons" aria-hidden>
        {MONS.map((id, i) => <img key={id} src={thumbUrl(id)!} alt="" style={{ '--i': i } as React.CSSProperties} />)}
      </div>
      <h1 className="logo" aria-label="오디 월드"><span>오디</span><span>월드</span></h1>
      <p className="logo-sub">오디들과 떠나는 모험</p>
      <p className="title-press">터치해서 시작</p>
      <SoundToggle className="corner" />
      <p className="title-credit">「Catch an Oddie」 캐릭터 · 학교 활동 게임</p>
    </main>
  );
}
