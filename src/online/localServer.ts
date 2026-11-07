import type { ClientMessage, ServerMessage } from './protocol.ts';
import type { GameServer, Outbound } from './server.ts';
import type { Transport } from './transport.ts';

/*
 * 같은 브라우저의 두 탭이 대전하는 임시 서버. 방을 만든 탭이 방 로직(GameServer)을 메모리에서 돌리고,
 * 다른 탭은 BroadcastChannel로 메시지를 보낸다. 나중에 Supabase 어댑터가 같은 Transport 인터페이스로 대신한다.
 * (브라우저 전용이라 setInterval을 써도 된다. 방 로직 쪽은 순수하다.)
 */

type Wire =
  | { k: 'c'; message: ClientMessage }
  | { k: 's'; to: string; message: ServerMessage };

export interface LocalBus {
  transport: Transport;
  /** 이 탭이 방 로직을 돌리고 있는지 */
  readonly hosting: boolean;
  dispose(): void;
}

export function createLocalBus(
  playerId: string, makeServer: () => GameServer, channelName = 'oddie-world-online', tickMs = 1000,
): LocalBus {
  const channel = new BroadcastChannel(channelName);
  const handlers = new Set<(message: ServerMessage) => void>();
  let server: GameServer | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const dispatch = (outbound: Outbound[]) => {
    for (const { to, message } of outbound) {
      if (to === playerId) for (const handler of [...handlers]) handler(message);
      else channel.postMessage({ k: 's', to, message } satisfies Wire);
    }
  };

  channel.onmessage = (event: MessageEvent<Wire>) => {
    const wire = event.data;
    if (wire.k === 'c' && server) dispatch(server.handle(wire.message));
    if (wire.k === 's' && wire.to === playerId) for (const handler of [...handlers]) handler(wire.message);
  };

  const host = () => {
    if (server) return;
    server = makeServer();
    timer = setInterval(() => { if (server) dispatch(server.tick()); }, tickMs);
  };

  return {
    get hosting() { return server !== null; },
    transport: {
      send(message) {
        if (message.t === 'create') host();
        if (server) dispatch(server.handle(message));
        else channel.postMessage({ k: 'c', message } satisfies Wire);
      },
      onMessage(handler) {
        handlers.add(handler);
        return () => { handlers.delete(handler); };
      },
    },
    dispose() {
      if (timer) clearInterval(timer);
      channel.close();
      handlers.clear();
    },
  };
}
