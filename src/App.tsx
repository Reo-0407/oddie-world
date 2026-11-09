import { useState } from 'react';
import { AuthScreen, ConflictDialog } from './ui/AuthScreen.tsx';
import { CharacterScreen } from './ui/CharacterScreen.tsx';
import { StarterScreen } from './ui/StarterScreen.tsx';
import { OnlineScreen } from './ui/OnlineScreen.tsx';
import { useAccountFlow } from './ui/useAccountFlow.ts';
import { WorldView } from './ui/WorldView.tsx';
import { newSave, START_LEVEL } from './world/save.ts';
import './ui/app.css';

export default function App() {
  const flow = useAccountFlow();
  const { data, account, update } = flow;
  const [online, setOnline] = useState(false);

  let screen;
  if (flow.phase === 'booting') {
    screen = <main className="screen"><p className="online-note">불러오는 중…</p></main>;
  } else if (flow.phase === 'auth') {
    screen = (
      <AuthScreen
        onLogin={(who) => { void flow.login(who); }}
        onGuest={flow.guest}
        onCancel={flow.authCancelable ? flow.cancelAuth : undefined}
      />
    );
  } else if (!data) {
    screen = <CharacterScreen onDone={(name, characterIndex) => update(newSave(name, characterIndex))} />;
  } else if (data.team.length === 0) {
    screen = (
      <StarterScreen
        onPick={(id) => update({ ...data, team: [{ speciesId: id, level: START_LEVEL, exp: 0 }], playerLevel: START_LEVEL })}
      />
    );
  } else if (online) {
    // 로그인했다면 대전 이름도 계정 아이디로 맞춘다(랭킹의 이름과 어긋나지 않게)
    screen = (
      <OnlineScreen
        name={account?.username ?? data.name}
        lockName={account !== null}
        owned={[...data.team, ...data.box]}
        onClose={() => setOnline(false)}
      />
    );
  } else {
    screen = (
      <>
        <WorldView data={data} onData={update} />
        <div className="world-bar">
          <span className="account-name">{account ? `아이디: ${account.username}` : '게스트'}</span>
          <button onClick={() => setOnline(true)}>친구 대전</button>
          <button onClick={flow.restart}>새로 시작</button>
          {account
            ? <button onClick={() => { void flow.logout(); }}>로그아웃</button>
            : <button onClick={flow.openAuth}>로그인/가입</button>}
        </div>
      </>
    );
  }

  return (
    <>
      {screen}
      {flow.conflict && (
        <ConflictDialog
          local={flow.conflict.local}
          cloud={flow.conflict.cloud}
          newer={flow.conflict.newer}
          onChoose={flow.resolveConflict}
        />
      )}
      <footer>「Catch an Oddie」의 캐릭터로 만든 학교 활동 게임입니다.</footer>
    </>
  );
}
