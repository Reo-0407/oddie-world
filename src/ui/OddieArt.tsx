import type { TypeName } from '../engine/types.ts';

const COLORS: Record<TypeName, string> = {
  normal: '#b8b8a8', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8',
  fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac',
};

export function typeColor(type: TypeName): string {
  return COLORS[type];
}

interface Props {
  name: string;
  types: TypeName[];
  size?: number;
}

/** 3D 모델이 오기 전의 임시 그림. 타입 색 카드에 이름 앞 두 글자를 보여 준다 */
export function OddieArt({ name, types, size = 96 }: Props) {
  const first = typeColor(types[0]);
  const second = typeColor(types[1] ?? types[0]);
  return (
    <div
      className="oddie-art"
      role="img"
      aria-label={name}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${first}, ${second})` }}
    >
      {name.slice(0, 2)}
    </div>
  );
}
