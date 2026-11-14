import { useEffect, useRef, useState } from 'react';
import { AuthScreen, ConflictDialog, LookPicker } from './ui/AuthScreen.tsx';
import { Credits } from './ui/Credits.tsx';
import { OnlineScreen } from './ui/OnlineScreen.tsx';
import { useAccountFlow } from './ui/useAccountFlow.ts';
import { GameView, type EncounterInfo } from './ui/GameView.tsx';
import { BattleScreen } from './ui/BattleScreen.tsx';
import { CatchScreen } from './ui/CatchScreen.tsx';
import { TitleBackdrop, TitleScreen } from './ui/TitleScreen.tsx';
import { playMusic, sfx } from './audio/audio.ts';
import type { TrackId } from './audio/tracks.ts';
import { markSeen } from './game/dex.ts';
import { newSave, START_LEVEL, type SaveData } from './game/save.ts';
import { questsAfter, settleCatch, settleLoss, settleRaidWin, settleRematch, settleTrainer, settleWin } from './battle/outcome.ts';
import { localDay, setDayOffset } from './game/daily.ts';
import { RAID_ROPES, REMATCH_PREFIX, rematchTrainer } from './game/postgame.ts';
import { nextCombo } from './game/fun.ts';
import { setHourOverride } from './game/daytime.ts';
import { speciesById } from './data/index.ts';
import type { RtResult } from './battle/realtime.ts';
import { BADGE_ORDER, trainerById, type Trainer } from './overworld/encounters.ts';
import { getMap } from './overworld/maps/index.ts';
import type { Status } from './engine/types.ts';
import type { RegionId } from './overworld/regions.ts';
import './ui/app.css';

type Foe = { speciesId: number; level: number; shiny?: boolean; strong?: boolean };
type Fight =
  /** pre: 전투 전에 생긴 문구(낚시 퀘스트 완료 등) */
  | { stage: 'fight'; kind: 'wild'; region: RegionId; foe: Foe; pre: string[] }
  | { stage: 'fight'; kind: 'trainer'; region: RegionId; trainer: Trainer; rematch?: boolean }
  /** picks: 레이드에 데려간 팀 번호(최대 3) */
  | { stage: 'fight'; kind: 'raid'; region: RegionId; foe: Foe; picks: number[] }
  /** golden: 레이드 황금 로프 */
  | { stage: 'catch'; region: RegionId; foe: Foe; status: Status | null; lines: string[]; isNew: boolean; combo: number; golden?: number };

type Message = { speaker?: string; pages: string[] } | null;
type Wipe = { kind: 'wild' | 'trainer' | 'fade'; phase: 'in' | 'out'; key: number };
/** 화면을 덮는 데 걸리는 시간(ms). 덮인 동안 화면을 바꾸고 걷어 낸다 */
const WIPE_IN = { wild: 560, trainer: 620, fade: 320 } as const;
const WIPE_OUT = 420;

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
  const [titled, setTitled] = useState(false);
  const [wipe, setWipe] = useState<Wipe | null>(null);
  const wiping = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  /** 화면 전환: 덮고(kind별 그림) → then() → 걷어 낸다 */
  const transition = (kind: Wipe['kind'], then: () => void) => {
    if (wiping.current) return;
    wiping.current = true;
    const key = Date.now();
    setWipe({ kind, phase: 'in', key });
    window.setTimeout(() => {
      then();
      wiping.current = false;
      setWipe({ kind, phase: 'out', key });
      window.setTimeout(() => setWipe((w) => (w?.key === key ? null : w)), WIPE_OUT);
    }, WIPE_IN[kind]);
  };

  // 버튼을 누르면 작게 딸깍(메뉴 버튼처럼 따로 소리 내는 것은 data-nosfx)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button');
      if (b && !b.disabled && !b.closest('[data-nosfx]')) sfx('confirm');
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  const save = (next: SaveData) => { dataRef.current = next; update(next); };
  const backToWorld = (msg: Message) => transition('fade', () => {
    setFight(null);
    setMessage(msg && msg.pages.length ? msg : null);
    setWorldKey((k) => k + 1);
  });

  /** 전투를 시작했으면 true(false면 월드가 다시 움직인다) */
  const onEncounter = (info: EncounterInfo): boolean => {
    const d = dataRef.current;
    if (!d || d.team.length === 0 || wiping.current) return false; // 스타터가 없으면 조우도 없다
    // 낚았다: 낚시 퀘스트를 올린다(완료 문구는 전투가 끝난 뒤 보여 준다)
    const q = info.fished ? questsAfter(d, { kind: 'fish' }) : { save: d, lines: [] };
    save({ ...q.save, dex: markSeen(q.save.dex, info.speciesId) });
    const foe: Foe = { speciesId: info.speciesId, level: info.level, ...(info.shiny ? { shiny: true } : {}), ...(info.strong ? { strong: true } : {}) };
    transition('wild', () => setFight({ stage: 'fight', kind: 'wild', region: info.region, foe, pre: q.lines }));
    return true;
  };

  /** 레이드 시작: 고른 팀 번호(최대 3)와 이번 주 보스 */
  const onRaid = (picks: number[], boss: { speciesId: number; level: number }): boolean => {
    const d = dataRef.current;
    if (!d || picks.length === 0 || wiping.current) return false;
    save({ ...d, dex: markSeen(d.dex, boss.speciesId) });
    transition('trainer', () => setFight({ stage: 'fight', kind: 'raid', region: getMap(d.map)?.region ?? 'volcano', foe: boss, picks }));
    return true;
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
      /** 낮·밤 시험: __oddie.hour(22), 되돌리기 __oddie.hour(null) */
      hour(h: number | null) { setHourOverride(h); },
      /** 매일 보상 시험: __oddie.day(1) = 내일, 되돌리기 __oddie.day(0) */
      day(offset: number) { setDayOffset(offset); backToWorld(null); return localDay(); },
      /** 플래그 켜기: __oddie.flag('champion'), __oddie.flag('rod') */
      flag(f: string) {
        const d = dataRef.current;
        if (!d || d.flags.includes(f)) return;
        save({ ...d, flags: [...d.flags, f] });
        backToWorld(null);
      },
    };
  }

  const onTrainer = (id: string): boolean => {
    const d = dataRef.current;
    const rematch = id.startsWith(REMATCH_PREFIX);
    const trainer = rematch ? rematchTrainer(id.slice(REMATCH_PREFIX.length)) : trainerById(id);
    if (!d || !trainer || d.team.length === 0 || wiping.current) return false;
    save({ ...d, dex: trainer.team.reduce((dex, m) => markSeen(dex, m.speciesId), d.dex) });
    transition('trainer', () => setFight({ stage: 'fight', kind: 'trainer', region: getMap(d.map)?.region ?? 'meadow', trainer, rematch }));
    return true;
  };

  // 전투·잡기 결과는 한 번만 정산한다(두 번 눌러도 경험치·코인이 두 번 들어오지 않게). 화면을 덮는 중이면 이미 정산했다
  const onBattleEnd = (result: RtResult, alive: boolean[], foeStatus: Status | null, potionsLeft: number) => {
    const cur = dataRef.current;
    if (!cur || !fight || fight.stage !== 'fight' || wiping.current) return;
    const d = { ...cur, potions: potionsLeft }; // 전투 중 쓴 회복약
    if (fight.kind === 'raid') {
      if (result !== 'won') {
        save(d);
        return backToWorld({ speaker: '레이드 안내원', pages: [result === 'fled' ? '레이드를 그만뒀다.' : '레이드 보스를 쓰러뜨리지 못했다…', '이번 주 안이라면 언제든 다시 도전할 수 있어요!'] });
      }
      const f = fight;
      // 레이드 팀(최대 3)의 생존을 전체 팀 순서로
      const full = d.team.map((_, i) => { const k = f.picks.indexOf(i); return k >= 0 && alive[k]; });
      const s = settleRaidWin(d, full, f.foe, localDay());
      save(s.save);
      const isNew = !s.save.dex.caught.includes(f.foe.speciesId);
      const combo = nextCombo(s.save.combo, f.foe.speciesId).count;
      return transition('fade', () => setFight({
        stage: 'catch', region: f.region, foe: f.foe, status: foeStatus, isNew, combo, golden: RAID_ROPES,
        lines: [...s.lines, `황금 로프 ${RAID_ROPES}개를 받았다! 놓쳐도 도망가지 않아요.`],
      }));
    }
    if (result === 'fled') { save(d); return backToWorld(fight.kind === 'wild' && fight.pre.length ? { pages: fight.pre } : null); }
    if (result === 'escaped' && fight.kind === 'wild') {
      save(d);
      return backToWorld({ pages: ['내 오디가 쓰러졌다…', `야생 ${speciesById(fight.foe.speciesId).name}은(는) 도망가 버렸다.`, '오디들은 잠깐 쉬면 다시 힘이 나요. 레벨이 높은 오디(빨간 Lv)는 조심!', ...fight.pre] });
    }
    if (result === 'lost') {
      const s = settleLoss(d);
      save(s.save);
      return backToWorld({ pages: s.lines });
    }
    if (fight.kind === 'trainer') {
      const tr = fight.trainer;
      if (fight.rematch) {
        const s = settleRematch(d, alive, tr, localDay());
        save(s.save);
        return backToWorld({ speaker: tr.name, pages: s.lines });
      }
      const s = settleTrainer(d, alive, tr);
      save(s.save);
      if (s.champion) setCredits(true);
      return backToWorld({ speaker: tr.name, pages: s.lines });
    }
    const won = settleWin(d, alive, [fight.foe]);
    const s = questsAfter(won.save, { kind: 'winWild' });
    const lines = [...fight.pre, ...won.lines, ...s.lines];
    save(s.save);
    if (s.save.ropes.basic + s.save.ropes.sturdy > 0) {
      const f = fight;
      const isNew = !s.save.dex.caught.includes(f.foe.speciesId);
      const combo = nextCombo(s.save.combo, f.foe.speciesId).count;
      transition('fade', () => setFight({ stage: 'catch', region: f.region, foe: f.foe, status: foeStatus, lines, isNew, combo }));
    } else {
      backToWorld({ pages: [...lines, '로프가 없어! 상점이나 오디 센터에서 구해 봐'] });
    }
  };

  const onCatchEnd = (caught: boolean, ropes: SaveData['ropes'], excellent = 0) => {
    const d = dataRef.current;
    if (!d || !fight || fight.stage !== 'catch' || wiping.current) return;
    const raid = fight.golden !== undefined;
    if (raid) ropes = d.ropes; // 황금 로프만 썼다
    const ex = excellent > 0 ? questsAfter({ ...d, ropes }, { kind: 'excellent', n: excellent }) : { save: { ...d, ropes }, lines: [] };
    if (caught) {
      const s = settleCatch(ex.save, fight.foe, ropes);
      const q = questsAfter(s.save, { kind: 'catch', types: speciesById(fight.foe.speciesId).types });
      save(q.save);
      return backToWorld({ pages: [...fight.lines, ...s.lines, ...ex.lines, ...q.lines] });
    }
    save(ex.save);
    const name = speciesById(fight.foe.speciesId).name;
    backToWorld({ pages: [...fight.lines, raid ? `${name}은(는) 빛과 함께 사라졌다… 다음 주 보스를 기다려 보자!` : `${name}은(는) 도망갔다… 그래도 경험치는 받았어!`, ...ex.lines] });
  };

  // 지금 화면에 맞는 배경음악
  let music: TrackId = 'title';
  if (!titled || !data || online || flow.phase !== 'ready') music = 'title';
  else if (fight?.stage === 'fight') music = fight.kind === 'wild' ? 'wild' : fight.kind === 'raid' || fight.trainer.champion || fight.rematch ? 'champion' : 'trainer';
  else music = getMap(data.map)?.region ?? 'meadow';
  useEffect(() => { playMusic(music); }, [music]);

  /** 타이틀·로그인 화면은 흘러가는 초원 위에 */
  const scene = (body: React.ReactNode) => <div className="title-scene"><TitleBackdrop />{body}</div>;

  let screen;
  if (!titled) {
    screen = <TitleScreen onStart={() => setTitled(true)} />;
  } else if (credits) {
    screen = <Credits onClose={() => setCredits(false)} />;
  } else if (flow.phase === 'booting') {
    screen = scene(<main className="screen auth"><p className="online-note">불러오는 중…</p></main>);
  } else if (flow.phase === 'auth' || (!data && !account)) {
    screen = scene(
      <AuthScreen
        onLogin={(who) => { void flow.login(who); }}
        onSignedUp={(who, look) => { void flow.signup(who, look); }}
        onCancel={flow.authCancelable ? flow.cancelAuth : undefined}
      />,
    );
  } else if (!data) {
    // 계정은 있는데 저장이 없다(처음부터 / 다른 기기에서 지움): 캐릭터만 다시 고른다
    screen = scene(
      <main className="screen auth">
        <h1>캐릭터를 골라 줘!</h1>
        <LookPicker value={pickLook} onChange={setPickLook} />
        <button className="wide" onClick={() => update(newSave(account!.username, pickLook))}>시작하기</button>
      </main>,
    );
  } else if (flow.conflict) {
    // 어느 저장을 쓸지 고르는 동안 월드는 그리지 않는다(고른 뒤 새로 그린다)
    screen = scene(<main className="screen auth" />);
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
  } else if (fight?.stage === 'fight' && fight.kind === 'raid') {
    screen = (
      <BattleScreen
        kind="trainer" raid region={fight.region} team={fight.picks.map((i) => data.team[i]).filter(Boolean)} foes={[fight.foe]}
        trainerName="레이드 보스" ai="trainer" potions={data.potions} onEnd={onBattleEnd}
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
        ai={fight.kind === 'wild' ? 'wild' : fight.trainer.champion || fight.rematch ? 'champion' : fight.trainer.badge ? 'leader' : 'trainer'}
        shiny={fight.kind === 'wild' && !!fight.foe.shiny}
        strong={fight.kind === 'wild' && !!fight.foe.strong}
        potions={data.potions}
        onEnd={onBattleEnd}
      />
    );
  } else if (fight?.stage === 'catch') {
    screen = (
      <CatchScreen
        speciesId={fight.foe.speciesId} level={fight.foe.level} region={fight.region} status={fight.status}
        ropes={data.ropes} onEnd={onCatchEnd} shiny={!!fight.foe.shiny} isNew={fight.isNew} combo={fight.combo} team={data.team} golden={fight.golden}
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
        onRaid={onRaid}
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
            // 월드를 새로 그린다: 옛 위치·NPC 상태가 새 저장에 섞이지 않게
            setMessage(null);
            setWorldKey((k) => k + 1);
          },
        }}
      />
    );
  }

  return (
    <>
      {screen}
      {wipe && (
        <div key={wipe.key} className={`wipe wipe-${wipe.kind} ${wipe.phase}`} aria-hidden>
          {wipe.kind === 'wild' && Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
          {wipe.kind === 'trainer' && <b />}
        </div>
      )}
      {flow.cloudNote && <CloudToast key={flow.cloudNote.key} text={flow.cloudNote.text} />}
      {flow.conflict && (
        <ConflictDialog
          local={flow.conflict.local}
          cloud={flow.conflict.cloud}
          newer={flow.conflict.newer}
          onChoose={(choice) => { flow.resolveConflict(choice); setWorldKey((k) => k + 1); }}
        />
      )}
    </>
  );
}

/** 클라우드 저장 결과를 잠깐 보여 주고 사라진다 */
function CloudToast({ text }: { text: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const id = window.setTimeout(() => setOn(false), 1800); return () => window.clearTimeout(id); }, []);
  return on ? <div className="cloud-toast" role="status">{text}</div> : null;
}
