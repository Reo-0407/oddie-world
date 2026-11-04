import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseAiAction, chooseAiSwitch } from '../engine/ai.ts';
import { activeOf, resolveForcedSwitch, resolveTurn } from '../engine/turn.ts';
import type { Action, BattleEvent, BattleState, SideIndex, TurnResult } from '../engine/types.ts';
import type { RopeSequence } from '../game/capture.ts';
import { eventMessage } from './messages.ts';

const EVENT_DELAY_MS = 900;

/** 재생 중 화면에 보이는 값. 재생이 끝나면 전투 상태에서 다시 맞춘다 */
interface Shown {
  active: [number, number];
  hp: [number, number];
}

function shownFrom(state: BattleState): Shown {
  return {
    active: [state.sides[0].active, state.sides[1].active],
    hp: [activeOf(state, 0).hp, activeOf(state, 1).hp],
  };
}

function applyToShown(shown: Shown, event: BattleEvent): Shown {
  const next: Shown = { active: [...shown.active], hp: [...shown.hp] };
  if (event.t === 'switch') {
    next.active[event.side] = event.teamIndex;
    next.hp[event.side] = event.hp;
  }
  if (
    event.t === 'damage' || event.t === 'heal' || event.t === 'statusDamage' ||
    event.t === 'recoil' || event.t === 'confusionHit' || event.t === 'delayedHit'
  ) {
    // 흡수와 회복의 hp는 그 이벤트 side의 값이다
    next.hp[event.side] = event.hp;
  }
  return next;
}

export interface BattleHooks {
  /** 이벤트가 재생될 때마다 (3D 연출용) */
  onEvent?: (event: BattleEvent) => void;
  /** 로프 던지기 3D 연출. 잡혔으면 true. 없으면 잠깐 기다리기만 한다 */
  playRope?: (seq: RopeSequence) => Promise<boolean>;
}

export function useBattle(initial: BattleState, hooks: BattleHooks = {}) {
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const unmounted = useRef(false);
  const [state, setState] = useState(initial);
  const [shown, setShown] = useState(() => shownFrom(initial));
  const [message, setMessage] = useState('어떻게 할까?');
  const [playing, setPlaying] = useState(false);
  const [caught, setCaught] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      clearTimeout(timer.current);
    };
  }, []);

  /** 이벤트를 순서대로 보여주고 끝나면 onDone을 부른다 */
  const play = useCallback((events: BattleEvent[], final: BattleState, onDone: () => void) => {
    setPlaying(true);
    let index = 0;
    const step = () => {
      if (index >= events.length) {
        setState(final);
        setShown(shownFrom(final));
        setPlaying(false);
        onDone();
        return;
      }
      const event = events[index++];
      hooksRef.current.onEvent?.(event);
      setShown((current) => applyToShown(current, event));
      const text = eventMessage(event);
      if (text === null) {
        step();
        return;
      }
      setMessage(text);
      timer.current = setTimeout(step, EVENT_DELAY_MS);
    };
    step();
  }, []);

  /** NPC가 쓰러졌으면 교체까지 이어서 재생한다 */
  const finishTurn = useCallback((result: TurnResult) => {
    play(result.events, result.state, () => {
      if (result.state.winner !== null) return;
      if (result.state.pendingSwitch[1]) {
        const swap = resolveForcedSwitch(result.state, 1, chooseAiSwitch(result.state, 1));
        play(swap.events, swap.state, () => {
          setMessage(swap.state.pendingSwitch[0] ? '다음 오디를 골라줘!' : '어떻게 할까?');
        });
        return;
      }
      setMessage(result.state.pendingSwitch[0] ? '다음 오디를 골라줘!' : '어떻게 할까?');
    });
  }, [play]);

  const act = useCallback((action: Action) => {
    finishTurn(resolveTurn(state, [action, chooseAiAction(state, 1)]));
  }, [finishTurn, state]);

  const forceSwitch = useCallback((side: SideIndex, teamIndex: number) => {
    finishTurn(resolveForcedSwitch(state, side, teamIndex));
  }, [finishTurn, state]);

  /** 로프 던지기: 3D 연출이 끝나면 결과를 낸다. 성공이면 포획으로 끝, 실패면 상대가 한 턴 행동한다 */
  const throwRope = useCallback((seq: RopeSequence) => {
    const wildName = activeOf(state, 1).name;
    setPlaying(true);
    setMessage('로프를 던졌다!');
    const animation = hooksRef.current.playRope
      ? hooksRef.current.playRope(seq)
      : new Promise<boolean>((resolve) => { timer.current = setTimeout(() => resolve(seq.success), EVENT_DELAY_MS); });
    void animation.then((success) => {
      if (unmounted.current) return;
      if (success) {
        setMessage(`${wildName}을(를) 잡았다!`);
        setCaught(true);
        setPlaying(false);
        return;
      }
      setMessage('로프가 풀려 버렸다!');
      timer.current = setTimeout(() => {
        finishTurn(resolveTurn(state, [{ kind: 'pass' }, chooseAiAction(state, 1)]));
      }, EVENT_DELAY_MS);
    });
  }, [finishTurn, state]);

  return { state, shown, message, playing, caught, act, forceSwitch, throwRope };
}
