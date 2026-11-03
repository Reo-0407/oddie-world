import { useState } from 'react';
import { CHARACTERS } from '../world/characters.ts';
import { CharacterPreview } from './CharacterPreview.tsx';

interface Props {
  initialName?: string;
  onDone: (name: string, characterIndex: number) => void;
}

export function CharacterScreen({ initialName = '', onDone }: Props) {
  const [name, setName] = useState(initialName);
  const [index, setIndex] = useState(0);
  const trimmed = name.trim();
  return (
    <main className="screen">
      <h1>나는 누구일까?</h1>
      <label className="name-field">
        이름
        <input
          value={name}
          maxLength={12}
          placeholder="이름을 적어줘"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <CharacterPreview index={index} />
      <div className="characters">
        {CHARACTERS.map((look, i) => (
          <button
            key={look.label}
            className={`character${i === index ? ' selected' : ''}`}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            {look.label}
          </button>
        ))}
      </div>
      <button className="wide" disabled={trimmed === ''} onClick={() => onDone(trimmed, index)}>
        다음
      </button>
    </main>
  );
}
