import type { ClientMessage, ServerMessage } from './protocol.ts';

/**
 * 클라이언트가 서버와 이야기하는 통로. 지금은 같은 브라우저의 BroadcastChannel(localServer.ts)이고,
 * 나중에 Supabase Realtime 어댑터로 바꿔 끼운다. 방 로직은 이 인터페이스를 모른다.
 */
export interface Transport {
  send(message: ClientMessage): void;
  /** 서버가 이 클라이언트에게 보낸 메시지를 받는다. 돌려주는 함수를 부르면 구독을 끊는다 */
  onMessage(handler: (message: ServerMessage) => void): () => void;
}
