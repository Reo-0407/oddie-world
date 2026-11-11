import { useRef, useState } from 'react';
import { AuthScreen, ConflictDialog, LookPicker } from './ui/AuthScreen.tsx';
import { Credits } from './ui/Credits.tsx';
import { OnlineScreen } from './ui/OnlineScreen.tsx';
import { useAccountFlow } from './ui/useAccountFlow.ts';
import { GameView, type EncounterInfo } from './ui/GameView.tsx';
import { BattleScreen } from './ui/BattleScreen.tsx';
import { CatchScreen } from './ui/CatchScreen.tsx';
import { markSeen } from './game/dex.ts';
import { newSave, START_LEVEL, type SaveData } from './game/save.ts';
import { settleCatch, settleLoss, settleWin } from './battle/outcome.ts';
import type { RtResult } from './battle/realtime.ts';
import { BADGE_NAMES, BADGE_ORDER, trainerById, type Trainer } from './overworld/encounters.ts';
import { getMap } from './overworld/maps/index.ts';
import type { Status } from './engine/types.ts';
import type { RegionId } from './overworld/regions.ts';
import './ui/app.css';

type Foe = { speciesId: number; level: number };
type Fight =
  | { stage: 'fight'; kind: 'wild'; region: RegionId; foe: Foe }
  | { stage: 'fight'; kind: 'trainer'; region: RegionId; trainer: Trainer }
  | { stage: 'catch'; region: RegionId; foe: Foe; status: Status | null; lines: string[] };

type Message = { speaker?: string; pages: string[] } | null;

export default function App() {
  const flow = useAccountFlow();
  const { data, account, update } = flow;
  const [online, setOnline] = useState(false);
  const [fight, setFight] = useState<Fight | null>(null);
  const [message, setMessage] = useState<Message>(null);
  /** 전투가 끝날 때마다 월드를 새로 그린다(결과 대화를 띄우고, 진 경우 부활 지점에서 시작) */
  const [worldKey, setWorldKey] = useState(0);
  const [pickLook, setPickLook] = useState(0);
  const [credits, setCredits] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const save = (next: SaveData) => { dataRef.current = next; update(next); };
  const backToWorld = (msg: Message) => {
    setFight(null);
    setMessage(msg && msg.pages.length ? msg : null);
    setWorldKey((k) => k + 1);
  };

  const onEncounter = (info: EncounterInfo) => {
    const d = dataRef.current;
    if (!d || d.team.length === 0) return; // 스타터가 없으면 조우도 없다
    save({ ...d, dex: markSeen(d.dex, info.speciesId) });
    setFight({ stage: 'fight', kind: 'wild', region: info.region, foe: { speciesId: info.speciesId, level: info.level } });
  };

  // 개발 중 콘솔에서 전투·배지·순간이동을 바로 해 볼 수 있게 (배포 빌드에는 없다)
  if (import.meta.env.DEV) {
    const w = window as unknown as { __encounter?: typeof onEncounter; __oddie?: unknown };
    w.__encounter = onEncounter;
    w.__oddie = {
      give(badges: string[] = BADGE_ORDER, level?: number) {
        const d = dataRef.current;
        if (!d) return;
        let team = d.team.length ? d.team : [{ speciesId: 1, level: START_LEVEL, exp: 0 }];
        if (level) team = team.map((o) => ({ ...o, level, exp: 0 }));
        save({
          ...d, team, playerLevel: Math.max(...team.map((o) => o.level)),
          badges: [...new Set([...d.badges, ...badges])], flags: d.flags.includes('starter') ? d.flags : [...d.flags, 'starter'],
        });
        backToWorld(null);
      },
      warp(map: string, x: number, y: number) {
        const d = dataRef.current;
        if (!d || !getMap(map)) return false;
        save({ ...d, map, x, y });
        backToWorld(null);
        return true;
      },
    };
  }

  const onTrainer = (id: string) => {
    const d = dataRef.current;
    const trainer = trainerById(id);
    if (!d || !trainer || d.team.length === 0) return;
    save({ ...d, dex: trainer.team.reduce((dex, m) => markSeen(dex, m.speciesId), d.dex) });
    setFight({ stage: 'fight', kind: 'trainer', region: getMap(d.map)?.region ?? 'meadow', trainer });
  };

  const onBattleEnd = (result: RtResult, alive: boolean[], foeStatus: Status | null) => {
    const d = dataRef.current;
    if (!d || !fight || fight.stage !== 'fight') return;
    if (result === 'fled') return backToWorld(null);
    if (result === 'lost') {
      const s = settleLoss(d);
      save(s.save);
      return backToWorld({ pages: s.lines });
    }
    if (fight.kind === 'trainer') {
      const tr = fight.trainer;
      const s = settleWin(d, alive, tr.team, tr);
      const pages = [tr.lines.after, ...s.lines];
      let next = s.save;
      if (tr.badge && !next.badges.includes(tr.badge)) {
        next = { ...next, badges: [...next.badges, tr.badge] };
        pages.push(`${BADGE_NAMES[tr.badge]}를 받았다!`);
      }
      if (tr.champion && !next.flags.includes('champion')) {
        next = { ...next, flags: [...next.flags, 'champion'] };
        setCredits(true);
      }
      save(next);
      return backToWorld({ speaker: tr.name, pages });
    }
    const s = settleWin(d, alive, [fight.foe]);
    save(s.save);
    if (s.save.ropes.basic + s.save.ropes.sturdy > 0) {
      setFight({ stage: 'catch', region: fight.region, foe: fight.foe, status: foeStatus, lines: s.lines });
    } else {
      backToWorld({ pages: [...s.lines, '로프가 없어서 잡을 수 없었다…'] });
    }
  };

  const onCatchEnd = (caught: boolean, ropes: SaveData['ropes']) => {
    const d = dataRef.current;
    if (!d || !fight || fight.stage !== 'catch') return;
    if (caught) {
      const s = settleCatch(d, fight.foe, ropes);
      save(s.save);
      return backToWorld({ pages: [...fight.lines, ...s.lines] });
    }
    save({ ...d, ropes });
    backToWorld({ pages: fight.lines });
  };

  let screen;
  if (credits) {
    screen = <Credits onClose={() => setCredits(false)} />;
  } else if (flow.phase === 'booting') {
    screen = <main className="screen"><p className="online-note">불러오는 중…</p></main>;
  } else if (flow.phase === 'auth' || (!data && !account)) {
    screen = (
      <AuthScreen
        onLogin={(who) => { void flow.login(who); }}
        onSignedUp={(who, look) => { void flow.signup(who, look); }}
        onCancel={flow.authCancelable ? flow.cancelAuth : undefined}
      />
    );
  } else if (!data) {
    // 계정은 있는데 저장이 없다(처음부터 / 다른 기기에서 지움): 캐릭터만 다시 고른다
    screen = (
      <main className="screen auth">
        <h1>캐릭터를 골라 줘!</h1>
        <LookPicker value={pickLook} onChange={setPickLook} />
        <button className="wide" onClick={() => update(newSave(account!.username, pickLook))}>시작하기</button>
      </main>
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
  } else if (fight?.stage === 'fight') {
    screen = (
      <BattleScreen
        kind={fight.kind}
        region={fight.region}
        team={data.team}
        foes={fight.kind === 'wild' ? [fight.foe] : fight.trainer.team}
        trainerName={fight.kind === 'trainer' ? fight.trainer.name : undefined}
        onEnd={onBattleEnd}
      />
    );
  } else if (fight?.stage === 'catch') {
    screen = (
      <CatchScreen
        speciesId={fight.foe.speciesId} level={fight.foe.level} region={fight.region} status={fight.status}
        ropes={data.ropes} onEnd={onCatchEnd}
      />
    );
  } else {
    screen = (
      <GameView
        key={worldKey}
        data={data}
        onData={update}
        onEncounter={onEncounter}
        onTrainer={onTrainer}
        message={message}
        menu={{
          accountName: account?.username ?? null,
          onOnline: () => { setMessage(null); setOnline(true); },
          onLogout: () => { void flow.logout(); },
          onLogin: flow.openAuth,
          onRestart: () => {
            const keep = { name: data.name, look: data.characterIndex };
            flow.restart();
            update(newSave(keep.name, keep.look));
          },
        }}
      />
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
    </>
  );
}
