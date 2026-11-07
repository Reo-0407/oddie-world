import type { Action } from '../engine/types.ts';
import type { ClientMessage, RoomView, ServerMessage, TeamSpec } from './protocol.ts';
import type { Transport } from './transport.ts';

/** 한 플레이어 쪽 상태를 들고 서버와 이야기한다. 화면(React)은 이 객체만 본다 */
export class OnlineClient {
  view: RoomView | null = null;
  error: string | null = null;
  private listeners = new Set<() => void>();
  private off: () => void;

  constructor(readonly playerId: string, private transport: Transport) {
    this.off = transport.onMessage((message) => this.receive(message));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private receive(message: ServerMessage) {
    if (message.t === 'state') {
      this.view = message.view;
      this.error = null;
    } else {
      this.error = message.detail ? `${message.reason}: ${message.detail}` : message.reason;
    }
    for (const listener of [...this.listeners]) listener();
  }

  private send(message: ClientMessage) { this.transport.send(message); }

  create(name: string) { this.send({ t: 'create', playerId: this.playerId, name }); }
  join(code: string, name: string) { this.send({ t: 'join', playerId: this.playerId, name, code }); }
  submitTeam(team: TeamSpec) {
    if (this.view) this.send({ t: 'team', playerId: this.playerId, code: this.view.code, team });
  }
  act(action: Action) {
    if (this.view) this.send({ t: 'action', playerId: this.playerId, code: this.view.code, turn: this.view.turn, action });
  }
  /** 재접속: 방 코드로 현재 상태를 다시 받는다 */
  reconnect(code: string) { this.send({ t: 'hello', playerId: this.playerId, code }); }
  leave() {
    if (this.view) this.send({ t: 'leave', playerId: this.playerId, code: this.view.code });
  }
  dispose() {
    this.off();
    this.listeners.clear();
  }
}
