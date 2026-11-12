import { useState } from 'react';
import { MOVES, SPECIES } from '../data/index.ts';
import type { Rarity, Species } from '../data/types.ts';
import type { StatKey, TypeName } from '../engine/types.ts';
import { dexProgress, dexStatus, type Dex } from '../game/dex.ts';
import { REGION_IDS, REGIONS, speciesWeight } from '../overworld/regions.ts';
import { moveDetail } from './moveText.ts';
import { OddieArt, typeColor } from './OddieArt.tsx';

export const TYPE_NAMES: Record<TypeName, string> = {
  normal: '노말', fire: '불꽃', water: '물', electric: '전기', grass: '풀', ice: '얼음', fighting: '격투', poison: '독',
  ground: '땅', flying: '비행', psychic: '에스퍼', bug: '벌레', rock: '바위', ghost: '고스트', dragon: '드래곤',
  dark: '악', steel: '강철', fairy: '페어리',
};

const RARITY_NAMES: Record<Rarity, string> = {
  Common: '흔함', Rare: '희귀', Epic: '영웅', Legendary: '전설', Secret: '비밀', '???': '???',
};

const STAT_LABELS: [StatKey | 'hp', string][] = [
  ['hp', '체력'], ['atk', '공격'], ['def', '방어'], ['spa', '특공'], ['spd', '특방'], ['spe', '속도'],
];

const number = (id: number) => `No.${String(id).padStart(3, '0')}`;

/** 종의 타입이 잘 나오는 구역들(가중치가 1보다 큰 곳). 하나도 없으면 빈 목록 */
export function habitatsOf(species: Pick<Species, 'types'>): string[] {
  return REGION_IDS
    .map((id) => ({ id, weight: speciesWeight(id, species.types) }))
    .filter((row) => row.weight > 1)
    .sort((a, b) => b.weight - a.weight)
    .map((row) => REGIONS[row.id].name);
}

function Detail({ species, caught, onBack }: { species: Species; caught: boolean; onBack: () => void }) {
  const signature = MOVES[species.signatureMoveId];
  const habitats = habitatsOf(species);
  return (
    <div className="dex-detail">
      <div className="dex-detail-head">
        <span className="dex-art" style={caught ? undefined : { filter: 'brightness(0)' }}>
          <OddieArt speciesId={species.id} name={species.name} types={species.types} size={96} />
        </span>
        <div>
          <strong>{species.name}</strong>
          <div className="dex-no">{number(species.id)}</div>
          <div className="type-chips">
            {species.types.map((type) => (
              <span key={type} className="type-chip" style={{ background: typeColor(type) }}>{TYPE_NAMES[type]}</span>
            ))}
          </div>
          <div>희귀도 {RARITY_NAMES[species.rarity]}</div>
        </div>
      </div>
      <p>
        <strong>서식 구역</strong>{' '}
        {habitats.length > 0 ? habitats.join(', ') : '어느 구역에서나 비슷하게 나와요'}
      </p>
      {caught ? (
        <>
          <div className="dex-stats">
            {STAT_LABELS.map(([key, label]) => (
              <div key={key} className="dex-stat">
                <span>{label}</span>
                <div className="dex-bar"><div style={{ width: `${Math.min(100, (species.baseStats[key] / 150) * 100)}%` }} /></div>
                <span>{species.baseStats[key]}</span>
              </div>
            ))}
          </div>
          {signature && (
            <div className="dex-signature">
              <strong>★ 고유 기술: {signature.name}</strong>
              {moveDetail(signature).map((line) => <div key={line} className="dex-line">{line}</div>)}
            </div>
          )}
        </>
      ) : (
        <p className="online-note">잡으면 능력치와 고유 기술을 볼 수 있어요.</p>
      )}
      <button className="wide" onClick={onBack}>목록으로</button>
    </div>
  );
}

interface Props {
  dex: Dex;
  onClose: () => void;
}

/** 오디 도감: 번호순 격자. 잡은 종은 그림과 이름, 만난 종은 실루엣과 이름, 못 본 종은 ??? */
export function DexOverlay({ dex, onClose }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const progress = dexProgress(dex, SPECIES.length);
  const picked = selected === null ? null : SPECIES.find((s) => s.id === selected) ?? null;
  const pickedStatus = picked ? dexStatus(dex, picked.id) : 'unknown';

  return (
    <div className="panel-overlay" role="dialog" aria-label="오디 도감">
      <div className="panel dex-panel">
        <h2>오디 도감</h2>
        <p className="coins">
          잡은 <strong>{progress.caught}</strong> / 만난 <strong>{progress.seen}</strong> / 전체 {progress.total}
          {!!dex.shinyCaught?.length && <> · ✨ 반짝이 <strong>{dex.shinyCaught.length}</strong></>}
        </p>
        {picked && pickedStatus !== 'unknown' ? (
          <Detail species={picked} caught={pickedStatus === 'caught'} onBack={() => setSelected(null)} />
        ) : (
          <>
            {picked && <p className="note">아직 만나지 못한 오디예요.</p>}
            <div className="dex-grid">
              {SPECIES.map((species) => {
                const status = dexStatus(dex, species.id);
                return (
                  <button
                    key={species.id}
                    className={`dex-cell dex-${status}`}
                    aria-label={status === 'unknown' ? `${number(species.id)} ???` : `${number(species.id)} ${species.name}`}
                    onClick={() => setSelected(species.id)}
                  >
                    <span className="dex-no">{number(species.id)}</span>
                    {dex.shinyCaught?.includes(species.id) && <span className="dex-shiny" aria-label="반짝이로 잡음">✨</span>}
                    {status === 'unknown' ? (
                      <span className="dex-unknown">?</span>
                    ) : (
                      <span className="dex-art" style={status === 'seen' ? { filter: 'brightness(0)' } : undefined}>
                        <OddieArt speciesId={species.id} name={species.name} types={species.types} size={52} />
                      </span>
                    )}
                    <span className="dex-name">{status === 'unknown' ? '???' : species.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <button className="wide" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
