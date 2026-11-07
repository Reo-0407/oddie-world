import type { ClientMessage, ServerMessage } from './protocol.ts';
import type { GameServer, Outbound } from './server.ts';
import type { Transport } from './transport.ts';

/** 서버와 같은 프로세스에서 바로 메시지를 전달하는 통로 (테스트와 한 탭 연습용) */
export function createMemoryNetwork(server: GameServer) {
  const handlers = new Map<string, Set<(message: ServerMessage) => void>>();
  const deliver = (outbound: Outbound[]) => {
    for (const { to, message } of outbound) for (const handler of handlers.get(to) ?? []) handler(message);
  };
  return {
    connect(playerId: string): Transport {
      return {
        send: (message: ClientMessage) => deliver(server.handle(message)),
        onMessage: (handler) => {
          const set = handlers.get(playerId) ?? new Set();
          set.add(handler);
          handlers.set(playerId, set);
          return () => { set.delete(handler); };
        },
      };
    },
    /** 제한시간 처리를 한 번 돌린다 */
    tick: () => deliver(server.tick()),
    disconnect: (playerId: string) => deliver(server.disconnect(playerId)),
  };
}
