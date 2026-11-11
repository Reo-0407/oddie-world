import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from '../audio/audio.ts';

/** 소리 켜기/끄기(기기에 기억) */
export function SoundToggle({ className = '' }: { className?: string }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted);
  return (
    <button
      type="button" className={`sound-toggle ${className}`} aria-pressed={!muted} aria-label={muted ? '소리 켜기' : '소리 끄기'}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
    >{muted ? '🔇' : '🔊'}</button>
  );
}
