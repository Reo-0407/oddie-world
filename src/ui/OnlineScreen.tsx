import { useEffect, useReducer, useState } from 'react';
import { MOVES, SPECIES, speciesById } from '../data/index.ts';
import type { BattleEvent } from '../engine/types.ts';
import { createBattlePokemon } from '../game/factory.ts';
import type { OwnedOddie } from '../game/owned.ts';
import { OnlineClient } from '../online/client.ts';
import { createLocalBus } from '../online/localServer.ts';
import type { RoomView, TeamSpec } from '../online/protocol.ts';
import { GameServer } from '../online/server.ts';
import { SUPABASE_CONFIGURED } from '../online/supabaseConfig.ts';
import {
  createSupabaseConnection, fetchMyRating, fetchRanking, savedRoomCode, type RankingRow,
} from '../online/supabaseTransport.ts';
import type { Transport } from '../online/transport.ts';
import { MAX_LEVEL, TEAM_SIZE } from '../online/validate.ts';
import { eventMessage } from './messages.ts';

interface Props {
  name: string;
  /** 로그인한 계정의 아이디를 이름으로 쓴다(바꿀 수 없다) */
  lockName?: boolean;
  /** 내 팀과 박스: 여기서 3마리를 고른다 */
  owned: OwnedOddie[];
  onClose: () => void;
}

const END_TEXT = { ko: '쓰러뜨렸다', timeout: '시간 초과', forfeit: '기권', disconnect: '연결이 끊김' } as const;

/** 메시지는 "내가 0번 쪽"이라고 보고 만들어져 있어서, 1번 자리면 쪽을 뒤집는다 */
function flip(event: BattleEvent): BattleEvent {
  return 'side' in event ? ({ ...event, side: event.side === 0 ? 1 : 0 } as BattleEvent) : event;
}

function toTeamSpec(picked: OwnedOddie[]): TeamSpec {
  return picked.map((oddie) => {
    const level = Math.min(oddie.level, MAX_LEVEL);
    const pokemon = createBattlePokemon(speciesById(oddie.speciesId), level, MOVES);
    return { speciesId: oddie.speciesId, level, moveIds: pokemon.moves.map((move) => move.id) };
  });
}

type Mode = 'internet' | 'local';

/**
 * 친구 대전. 기본은 인터넷(Supabase 서버). 설정이 없거나 연결에 실패하면 같은 브라우저의 다른 탭끼리 하는
 * 로컬 모드로 바꿀 수 있다. 어느 쪽이든 화면은 OnlineClient만 본다.
 */
export function OnlineScreen({ name, lockName = false, owned, onClose }: Props) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [nameInput, setNameInput] = useState(name);
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [submittedTeam, setSubmittedTeam] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [client, setClient] = useState<OnlineClient | null>(null);
  const [mode, setMode] = useState<Mode>(SUPABASE_CONFIGURED ? 'internet' : 'local');
  const [ranking, setRanking] = useState<RankingRow[] | null>(null);
  const [myRating, setMyRating] = useState<RankingRow | null>(null);
  const [showRanking, setShowRanking] = useState(false);

  // StrictMode에서 효과가 두 번 돌아도 안전하도록 통로와 클라이언트는 효과 안에서 만들고 거기서 정리한다
  useEffect(() => {
    let transport: Transport;
    let disposeTransport: () => void;
    let playerId = 'me'; // 인터넷 모드에서는 서버가 로그인 정보로 덮어쓴다
    if (mode === 'internet') {
      const connection = createSupabaseConnection();
      transport = connection.transport;
      disposeTransport = connection.dispose;
    } else {
      playerId = crypto.randomUUID(); // 통로와 클라이언트가 같은 id를 써야 메시지가 맞게 전달된다
      const bus = createLocalBus(
        playerId,
        () => new GameServer({
          species: SPECIES, moves: MOVES, rng: Math.random, now: () => Date.now(), replyUnknownRoom: false,
        }),
      );
      transport = bus.transport;
      disposeTransport = bus.dispose;
    }
    const created = new OnlineClient(playerId, transport);
    const off = created.subscribe(rerender);
    setClient(created);
    setSubmittedTeam(false);
    setPicked([]);
    // 새로고침했다면 저장해 둔 방으로 다시 들어간다
    const saved = mode === 'internet' ? savedRoomCode() : null;
    if (saved) created.reconnect(saved);
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      off();
      clearInterval(clock);
      created.leave();
      created.dispose();
      disposeTransport();
    };
  }, [mode]);

  // 대전이 끝나면 내 점수를 가져온다 (서버가 기록한 뒤라 잠깐 기다린다)
  const finished = client?.view?.phase === 'finished';
  useEffect(() => {
    if (mode !== 'internet' || !finished) return;
    const timer = setTimeout(() => { fetchMyRating().then(setMyRating).catch(() => setMyRating(null)); }, 800);
    return () => clearTimeout(timer);
  }, [mode, finished]);

  const openRanking = () => {
    setShowRanking(true);
    setRanking(null);
    fetchRanking(20).then(setRanking).catch(() => setRanking([]));
  };

  const view: RoomView | null = client?.view ?? null;
  const candidates = owned.filter((oddie) => oddie.level >= 1);

  const joinRoom = () => {
    setNotice(null);
    client?.join(code, nameInput.trim() || name);
    setTimeout(() => {
      if (!client?.view && !client?.error) setNotice('방을 찾을 수 없어요. 같은 브라우저의 다른 탭에서 만든 방만 들어갈 수 있어요.');
      rerender();
    }, 1500);
  };

  const togglePick = (index: number) => {
    setPicked((current) => current.includes(index)
      ? current.filter((i) => i !== index)
      : current.length < TEAM_SIZE ? [...current, index] : current);
  };

  let body;
  if (!view) {
    body = (
      <>
        {SUPABASE_CONFIGURED && (
          <div className="menu-row" role="group" aria-label="연결 방식">
            <button className={mode === 'internet' ? 'selected' : ''} aria-pressed={mode === 'internet'} onClick={() => setMode('internet')}>인터넷</button>
            <button className={mode === 'local' ? 'selected' : ''} aria-pressed={mode === 'local'} onClick={() => setMode('local')}>같은 브라우저 탭</button>
          </div>
        )}
        <label className="name-field">
          이름
          <input value={nameInput} maxLength={12} readOnly={lockName} onChange={(event) => setNameInput(event.target.value)} />
        </label>
        <button className="wide" onClick={() => client?.create(nameInput.trim() || name)}>방 만들기</button>
        <label className="name-field">
          방 코드로 참가
          <input value={code} maxLength={6} placeholder="6자리 코드" onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </label>
        <button className="wide" disabled={code.trim().length !== 6} onClick={joinRoom}>참가</button>
        {mode === 'internet' ? (
          <>
            <p className="online-note">인터넷으로 어디서든 친구와 대전해요. 방을 만들고 코드를 알려 주세요.</p>
            <button className="wide" onClick={openRanking}>랭킹 보기</button>
            {showRanking && (
              <div className="ranking" aria-live="polite">
                {ranking === null ? <p className="online-note">불러오는 중…</p> : ranking.length === 0
                  ? <p className="online-note">아직 기록이 없어요.</p>
                  : <ol>{ranking.map((row, index) => <li key={index}>{row.name} · {row.rating}점 ({row.games}판)</li>)}</ol>}
              </div>
            )}
          </>
        ) : (
          <p className="online-note">같은 브라우저의 다른 탭끼리만 대전할 수 있어요. 한 탭에서 방을 만들고, 다른 탭에서 코드를 입력하세요.</p>
        )}
      </>
    );
  } else if (view.phase === 'waiting') {
    body = (
      <>
        <p>친구에게 이 코드를 알려 주세요</p>
        <p className="room-code">{view.code}</p>
        <p className="online-note">기다리는 중…</p>
      </>
    );
  } else if (view.phase === 'teams') {
    body = (
      <>
        <p>방 {view.code} · {view.names[0]} vs {view.names[1] ?? '…'}</p>
        <p>대전에 나갈 오디 {TEAM_SIZE}마리를 골라 주세요 ({picked.length}/{TEAM_SIZE})</p>
        {submittedTeam ? <p className="online-note">상대가 팀을 고르는 중…</p> : (
          <>
            <div className="team">
              {candidates.map((oddie, index) => (
                <button
                  key={index}
                  className={picked.includes(index) ? 'selected' : ''}
                  aria-pressed={picked.includes(index)}
                  onClick={() => togglePick(index)}
                >
                  {speciesById(oddie.speciesId).name} Lv.{Math.min(oddie.level, MAX_LEVEL)}
                </button>
              ))}
            </div>
            <button
              className="wide"
              disabled={picked.length !== TEAM_SIZE}
              onClick={() => { client?.submitTeam(toTeamSpec(picked.map((i) => candidates[i]))); setSubmittedTeam(true); }}
            >
              이 팀으로 준비
            </button>
            {candidates.length < TEAM_SIZE && <p className="online-note">오디가 {TEAM_SIZE}마리 이상 있어야 해요. 월드에서 더 잡아 오세요.</p>}
          </>
        )}
      </>
    );
  } else {
    const me = view.you.team[view.you.active];
    const foe = view.foe.team[view.foe.active];
    const seconds = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : null;
    const lines = view.lastEvents
      .map((event) => eventMessage(view.seat === 0 ? event : flip(event)))
      .filter((text): text is string => text !== null);
    body = (
      <>
        <div className="online-plate">
          <strong>{foe ? `${foe.name} Lv.${foe.level}` : '상대'}</strong>
          {foe && <div className="hp-bar"><div className={`hp-fill ${foe.hpPct < 25 ? 'low' : ''}`} style={{ width: `${foe.hpPct}%` }} /></div>}
          <small>{view.names[view.seat === 0 ? 1 : 0]} · 오디 {view.foe.team.filter((mon) => mon?.fainted).length}/{TEAM_SIZE} 쓰러짐</small>
        </div>
        <div className="online-plate">
          <strong>{me?.name} Lv.{me?.level}</strong>
          {me && <div className="hp-bar"><div className={`hp-fill ${(me.hp / me.maxHp) < 0.25 ? 'low' : ''}`} style={{ width: `${(me.hp / me.maxHp) * 100}%` }} /></div>}
          <small>{me?.hp} / {me?.maxHp}</small>
        </div>
        <div className="message" aria-live="polite">
          {view.phase === 'finished'
            ? (view.winner === null ? '무승부' : view.winner === view.seat ? '이겼다!' : '졌다…') + ` (${view.endReason ? END_TEXT[view.endReason] : ''})`
            : lines.length > 0 ? lines.join(' ') : '대전 시작!'}
        </div>
        {view.phase === 'finished' && mode === 'internet' && myRating && (
          <p className="online-note">내 점수 {myRating.rating}점 ({myRating.games}판)</p>
        )}
        {view.phase === 'battle' && (
          <>
            {seconds !== null && <p className="online-note">남은 시간 {seconds}초{view.connected[view.seat === 0 ? 1 : 0] ? '' : ' · 상대 연결 끊김'}</p>}
            {view.you.submitted && <p className="online-note">상대의 행동을 기다리는 중…</p>}
            {view.you.needsAction && (
              <>
                {!view.you.mustSwitch && !me.fainted && (
                  <div className="moves">
                    {me.moves.map((move, moveIndex) => (
                      <button key={move.id} className="move" onClick={() => client?.act({ kind: 'move', moveIndex })}>
                        {move.name}<small>{move.power > 0 ? `위력 ${move.power}` : '변화'}</small>
                      </button>
                    ))}
                  </div>
                )}
                <div className="team">
                  {view.you.team.map((mon, teamIndex) => teamIndex !== view.you.active && !mon.fainted && (
                    <button key={teamIndex} onClick={() => client?.act({ kind: 'switch', teamIndex })}>
                      {view.you.mustSwitch ? '내보내기' : '교체'}: {mon.name} ({mon.hp}/{mon.maxHp})
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <main className="screen online">
      <h1>친구 대전</h1>
      {body}
      {mode === 'internet' && client?.error?.includes('network') && (
        <button className="wide" onClick={() => setMode('local')}>인터넷 연결이 안 돼요: 같은 브라우저 탭 모드로 바꾸기</button>
      )}
      {(client?.error || notice) && <p className="online-error" role="alert">{notice ?? client?.error}</p>}
      <button className="wide" onClick={onClose}>{view?.phase === 'finished' ? '나가기' : '돌아가기'}</button>
    </main>
  );
}
