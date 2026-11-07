# 친구 대전: Supabase에 연결할 때 남은 일

2026-11-07 기준. 서버 없이 가능한 부분은 `src/online/`에 끝나 있다. 같은 브라우저의 두 탭에서 방 만들기, 코드로 참가, 팀 3마리 고르기, 끝까지 대전이 된다(화면은 월드의 「친구 대전」 버튼).

## 이미 있는 것

| 파일 | 하는 일 |
|---|---|
| `protocol.ts` | 클라이언트/서버 메시지와 공개 상태(`RoomView`) 타입 |
| `validate.ts` | 팀 검사(3마리, 레벨 1~50, 배울 수 있는 기술 4개 이하, 중복 없음)와 전투용 팀 만들기 |
| `room.ts` | 방 상태 머신(대기, 팀 고르기, 전투, 종료), 제한시간 60초, 끊김 처리, 공개 상태 필터 `viewFor` |
| `server.ts` | `GameServer`: 메시지를 받아 "누구에게 무엇을 보낼지" 목록만 돌려준다. 네트워크를 모른다 |
| `client.ts` | `OnlineClient`: 화면이 보는 상태와 보내기 함수 |
| `transport.ts` | `Transport { send, onMessage }`: 통로 인터페이스 |
| `localServer.ts`, `memoryTransport.ts` | BroadcastChannel 통로(두 탭)와 메모리 통로(테스트) |
| `elo.ts` | Elo 계산(K=32). 아직 어디서도 부르지 않는다 |

방 로직(`room.ts`, `server.ts`, `validate.ts`, `elo.ts`)은 `Math.random`과 `Date`를 쓰지 않는다. 시계와 난수는 밖에서 넣는다.

## 남은 일 (순서대로)

1. **Supabase 프로젝트와 계정.** 이메일 가입(실제 메일은 받지 않는 방식, 기획서 5장), 로그인. 로그인한 사용자 id를 `playerId`로 쓴다. 지금은 탭마다 임의 UUID다.
2. **Supabase Realtime 어댑터.** `Transport`를 구현한다. 방 코드마다 채널 하나(`room:{code}`)를 쓰고, `send`는 서버로 보내고 `onMessage`는 자기 `playerId` 앞으로 온 메시지만 받는다. 클라이언트 코드(`OnlineClient`, `OnlineScreen`)는 바꿀 필요가 없다.
3. **Edge Function(Deno).** `GameServer`를 그대로 올린다. 함수 한 번 호출 = `handle(message)` 한 번이다. 해야 할 일:
   - 방 상태를 메모리 대신 DB 테이블(`rooms`, `room` JSON 한 칸이면 충분)에 읽고 쓴다. `room.ts`의 `Room`은 JSON으로 그대로 저장된다(함수나 Map이 없다).
   - `Outbound` 목록을 Realtime 채널로 내보낸다.
   - `rng`는 `crypto.getRandomValues`로, `now`는 `Date.now`로 넣는다.
   - `tick()`은 Edge Function을 주기적으로 부르거나(pg_cron 1분 + 클라이언트가 만료 시각에 한 번 더 부르기), 행동을 받을 때마다 같은 방의 시간초과를 먼저 처리하는 방식으로 대신한다. 제한시간 60초는 `deadline`(서버 시계)으로 이미 방에 들어 있다.
   - 같은 방에 동시에 요청이 오면 겹쳐 쓰지 않게 행 잠금(`select ... for update`)을 쓴다.
4. **끊김 감지.** Realtime Presence로 `setConnected(false/true)` 호출(`GameServer.disconnect`, `hello`). 끊긴 쪽은 제한시간이 지나면 기권패가 된다.
5. **랭킹 테이블.** `ratings(user_id, rating default 1000, games, updated_at)`와 `matches(room, winner, loser, reason, played_at)`. 방이 `finished`가 되면 Edge Function이 `eloUpdate`로 점수를 갱신한다(승자가 없으면 0.5점). 한 판에 한 번만 갱신되게 `matches.room`에 유니크 키를 둔다. 랭킹 화면은 `ratings` 상위 N명 조회.
6. **보안.** 클라이언트가 보낸 `playerId`를 믿지 말고 Supabase 인증 토큰에서 꺼낸 id를 쓴다. 방 코드를 맞히는 시도에는 속도 제한을 둔다. `viewFor`가 상대 행동, 기술, 능력치, 난수 상태를 이미 빼 주지만, `lastEvents`에는 지난 턴 사건이 그대로 들어 있어 상대 체력 숫자가 보인다. 숫자까지 숨기려면 이벤트를 비율로 바꿔 보낸다.
7. **화면 다듬기.** 지금은 간단한 2D 패널이다. 기획서대로 월드의 3D 전투 장면(`BattleOverlay`)을 재사용하려면 `OnlineScreen`의 행동 선택부를 그쪽 메뉴로 바꾸고 `RoomView`를 `BattleState`처럼 그려야 한다(상대의 숨겨진 정보 때문에 `useBattle`은 그대로 못 쓴다). 재접속용으로 방 코드를 `localStorage`에 저장해 두었다가 `reconnect(code)`를 부르는 것도 아직 안 했다.
8. **로컬 서버 정리.** 인터넷 대전이 되면 `localServer.ts`는 오프라인 연습용으로 남기거나 지운다.

## 알아 둘 것

- 팀은 월드에서 잡은 오디(레벨 50까지 잘라서)로 낸다. 기술은 `createBattlePokemon`이 고르는 기본 4개다. 기술 직접 고르기는 `TeamMemberSpec.moveIds`를 채우는 화면만 있으면 된다(검사는 이미 한다).
- 시간 초과 규칙: 연결된 쪽이 60초 안에 행동하지 않으면 자동으로 쉬고(쓰러진 뒤라면 첫 살아 있는 오디 교체), 연속 3번이면 기권패. 끊긴 쪽은 60초가 지나면 기권패. 팀 고르기는 120초, 안 낸 쪽이 진다.
