import { useState } from 'react';
import { CHARACTERS } from '../world/characters.ts';

interface Props {
  initialName?: string;
  onDone: (name: string, characterIndex: number) => void;
}

/** 색으로 구분되는 간단한 사람 모양 미리보기 */
function Figure({ body, hair, skin }: { body: string; hair: string; skin: string }) {
  return (
    <svg viewBox="0 0 60 80" width="60" height="80" aria-hidden="true">
      <rect x="20" y="50" width="20" height="26" rx="3" fill="#3b3f4a" />
      <rect x="14" y="28" width="32" height="28" rx="4" fill={body} />
      <rect x="6" y="30" width="8" height="24" rx="3" fill={body} />
      <rect x="46" y="30" width="8" height="24" rx="3" fill={body} />
      <circle cx="30" cy="18" r="12" fill={skin} />
      <path d="M17 17 A13 13 0 0 1 43 17 Z" fill={hair} />
    </svg>
  );
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
      <div className="characters">
        {CHARACTERS.map((look, i) => (
          <button
            key={look.label}
            className={`character${i === index ? ' selected' : ''}`}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <Figure body={look.body} hair={look.hair} skin={look.skin} />
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
