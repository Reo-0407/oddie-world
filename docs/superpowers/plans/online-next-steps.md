# 친구 대전: Supabase 인터넷 연결 (2026-11-09 구현함)

인터넷 대전이 동작한다. 서버 권위 방식이고, 방 로직은 `src/online/`의 순수 TS를 그대로 Edge Function에서 쓴다.

## 구조

- **계정**: 아이디+비밀번호(가짜 이메일 `u<글자별 4자리 hex>@oddie.invalid`, `src/online/account.ts`)와 게스트(익명 로그인). 게스트가 가입하면 `updateUser`로 같은 사용자를 계정으로 바꿔 랭킹을 이어 간다. 클라우드 저장은 `saves` 표(RLS로 본인 행만, 200KB CHECK), `npm run smoke:auth`로 확인한다. 아래는 대전 서버 쪽 설명이다. 이전 설명: 사용자 id(JWT의 sub)가 playerId다. 클라이언트가 보낸 playerId는 서버가 덮어쓴다. 세션은 localStorage(`oddie-online-auth`)에 남는다.
- **전달**: 클라이언트는 함수 호출(`supabase.functions.invoke('online')`)로 메시지를 보내고 응답으로 자기 몫을 받는다. 상대 몫은 서버가 Realtime Broadcast REST로 상대의 개인 채널 `player:{비밀값}`에 보낸다. 비밀값은 브라우저가 만든 32자 hex(`oddie-online-secret`)이고 요청마다 함께 보내 서버가 `player_channels`에 저장한다. 상대의 비밀값은 서버만 안다.
- **방 상태**: `rooms(code, room jsonb, version)`. 요청 하나 = 방 하나 읽기 → 만료 처리(`tick`) → 로직 한 번 → 저장 → broadcast. 동시 요청은 `version` 비교 저장(낙관적 잠금)으로 가리고 충돌하면 다시 읽어 처리한다(최대 5번).
- **제한시간**: (a) 같은 방에 요청이 올 때마다 먼저 처리, (b) 클라이언트가 deadline 1.5초 뒤 `hello`를 보내 만료 처리를 부탁한다. pg_cron은 쓰지 않는다.
- **끊김 감지**: 클라이언트가 10초마다 `hello`를 보낸다. 서버는 요청마다 `lastSeen`을 갱신하고, 35초 넘게 신호가 없는 사람을 끊긴 것으로 본다. 끊긴 사람은 제한시간이 지나면 기권패, 돌아오면(아무 요청이나) 연결됨으로 돌아온다.
- **랭킹**: 방이 `finished`가 되면 `record_match`(SQL 함수)가 `matches.room_code` 유니크로 한 번만 기록하고 점수 변화량(Elo K=32)을 더한다. 전투가 시작된 판만 기록한다. 조회는 읽기 전용 함수 `top_ratings(n)`, `my_rating()`이고 표는 클라이언트가 직접 못 읽는다.
- **보안**: 표는 RLS 켜짐 + 정책 없음 + service role만 권한(anon/authenticated 권한 회수). 방 코드 추측은 사용자별 1분에 8번 실패까지(`guess_limits`). 팀 검사는 기존 `validate.ts`. 상대 쪽 지난 턴 사건의 체력/피해량은 퍼센트로 바꿔 보낸다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `supabase/migrations/*.sql` | 표, RLS, 권한, `record_match`, `top_ratings`, `my_rating` |
| `supabase/functions/online/` | Edge Function(`index.ts`)과 Supabase 저장소(`stores.ts`) |
| `src/online/edgeHandler.ts` | 요청 한 번을 처리하는 순수 어댑터(저장소 주입, 테스트됨) |
| `src/online/rateLimit.ts`, `ranking.ts` | 속도 제한, 전적/점수 계산(순수) |
| `src/online/supabaseTransport.ts` | 브라우저 Transport(익명 로그인, 개인 채널, 10초 hello, 재접속, 랭킹 조회) |
| `src/ui/OnlineScreen.tsx` | 연결 방식 선택(인터넷/같은 브라우저 탭), 랭킹, 재접속 |
| `scripts/sync-functions.ts` | 서버 로직을 `supabase/functions/_shared/`로 복사(생성물, git 무시) |
| `scripts/deploy-functions.ts`, `apply-migrations.ts`, `smoke-online.ts`, `env.ts` | 배포, 마이그레이션 적용, 스모크 테스트 |

## 명령

```
npm run db:migrate        # supabase/migrations/*.sql 적용 (Management API, Docker 불필요)
npm run functions:deploy  # 서버 로직 복사 + online 함수 배포
npm run smoke:online      # 익명 사용자 두 명으로 실제 create → join → 전투 → 랭킹 확인
```

모두 프로젝트 루트 `.env.local`의 `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`(스모크는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`)를 읽는다. 토큰은 코드나 문서에 쓰지 않는다. 클라이언트에 들어간 것은 공개해도 되는 주소와 publishable key뿐이다(`src/online/supabaseConfig.ts`).

## 남은 일

- 같은 브라우저의 두 탭은 같은 익명 사용자라 서로 대전할 수 없다(인터넷 모드). 한 기기에서 테스트하려면 다른 브라우저/시크릿 창을 쓰거나 「같은 브라우저 탭」 모드를 쓴다.
- 게스트(익명)는 브라우저 데이터를 지우면 점수가 사라진다. 계정을 만들면 영구가 된다.
- 전투 화면은 아직 간단한 2D 패널이다(3D `BattleOverlay` 재사용은 숨겨진 정보 때문에 `RoomView`용 화면이 따로 필요).
- 오래된 방 정리는 방을 만들 때 가끔(5%) 하루 지난 방을 지우는 방식이다. 방이 많아지면 pg_cron이나 예약 함수로 바꾼다.
- Realtime 채널이 비공개가 아니다. 비밀값이 채널 이름이라 추측은 불가능하지만, 더 강하게 하려면 Realtime Authorization(비공개 채널 + RLS 정책)으로 옮긴다.
- 속도 제한은 join/hello의 방 코드 실패만 센다. 함수 호출 자체의 남용은 Supabase 기본 제한에 맡긴다.
- 스모크가 만든 시험 기록은 삭제해 두었다. 랭킹 표를 비우려면 `ratings`, `matches`를 지우면 된다.
