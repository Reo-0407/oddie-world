import { speciesById } from '../data/index.ts';
import { OddieArt } from './OddieArt.tsx';

const STARTERS = [1, 42, 107];

export function StarterScreen({ onPick }: { onPick: (speciesId: number) => void }) {
  return (
    <main className="screen">
      <h1>함께할 오디를 골라줘!</h1>
      <div className="starters">
        {STARTERS.map((id) => {
          const species = speciesById(id);
          return (
            <button key={id} className="starter" onClick={() => onPick(id)}>
              <OddieArt speciesId={id} name={species.name} types={species.types} size={112} />
              {species.name}
            </button>
          );
        })}
      </div>
    </main>
  );
}
