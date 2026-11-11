# 오디 월드 2D 구현 계획

스펙: `docs/superpowers/specs/2026-11-11-oddie-world-2d-design.md` (먼저 읽는다).
공통 규칙: TypeScript strict, 테스트는 vitest(순수 로직만), `npm run build`(tsc + vite)가 통과해야 한다. 임포트에 `.ts/.tsx` 확장자. 한국어 UI 문구, 잡는 도구 이름은 「로프」. 커밋은 하지 않는다(진행자가 한다).

## Task 1 — 2D 월드 코어
- `src/game/save.ts`: `src/world/save.ts`를 옮기고 v5(스펙의 필드). 옛 v1~v4 저장은 `map:'town', x,y`=마을 시작점, facing 'down', badges/beaten/flags 빈 배열, respawn=마을 센터 앞. 기존 import 경로(`../world/save.ts`)를 모두 `../game/save.ts`로 바꾼다. 기존 save 테스트도 옮겨 통과시킨다.
- `src/overworld/tiles.ts`: 타일 enum(문자 한 글자 ↔ 종류), `isWalkable`, `isGrass`(풀숲), `isDoor`, 타일 그리기 함수 `drawTile(ctx, tile, x, y, frame, region)`. 스펙의 타일 목록을 전부 코드로 그린다. 지붕은 색을 받는다.
- `src/overworld/maps/town.ts`, `route1.ts`(초원 1번 길), `house.ts`(안: 센터, 상점, 연구소, 일반 집 네 종류의 작은 실내), `index.ts`(맵 id → 맵). 맵 형식: `{ id, name, region, rows: string[], warps: {x,y,to:{map,x,y,facing}}[], npcs: Npc[], signs: {x,y,text}[], music?: never }`. 바깥 지도는 Task 3에서 100×100으로 커지므로 지금은 마을(30×24)+1번 길만 만들고, 두 지도는 가장자리 워프로 이어진다.
- `src/overworld/world.ts`(순수, 테스트 필수): `canStep(map, npcs, x, y)`, `step(state, dir)` → 새 위치/워프/풀숲 조우 여부(난수 주입), `facingTile(state)`, `npcInSight(npc, player)`(4칸), `interactTarget(map, state)` → npc/sign/null.
- `src/overworld/sprites.ts`: 플레이어(6색, 4방향, 걷기 2프레임)와 NPC(종류별 색) 그리기. `src/overworld/render.ts`: 카메라, 타일 레이어, NPC, 플레이어, 말풍선 "!". 정수 배율, `devicePixelRatio` 반영.
- `src/ui/GameView.tsx`: 캔버스 + 키보드/터치 십자키 + A/B 버튼 + `Dialog.tsx`(한 글자씩, 다음/선택지). 간판·NPC 말걸기 동작. 조우/트레이너 전투는 콜백 `onEncounter(species, level, region)`, `onTrainer(npc)`로만 알린다(Task 2가 받는다).
- `src/App.tsx`: WorldView 대신 GameView. 3D 코드는 아직 지우지 않는다(Task 4).
완료 기준: 마을과 1번 길을 걸어 다니고, 집에 들어갔다 나오고, 간판을 읽고, 풀숲에서 조우 콜백이 콘솔에 찍힌다. 테스트 통과, build 통과.

## Task 2 — 포켓몬 고식 실시간 전투와 조우
- 스펙 끝의 "전투를 포켓몬 고처럼" 절을 그대로 구현한다. 기존 턴제 `useBattle`/`BattleOverlay`는 오프라인에서 쓰지 않는다(온라인 OnlineScreen은 그대로).
- `src/battle/realtime.ts`(순수, 테스트): 실시간 전투 상태와 `tick(state, dtMs, input, rng)` — 기본 공격 쿨타임, 에너지, 필살기, 상대 AI 간격·예고, 피하기 판정, 교체 쿨타임, 승패. 피해는 `src/engine/damage.ts` 재사용.
- `src/battle/throw.ts`(순수, 테스트): 원 크기 주기, 던진 결과(빗나감/Nice/Great/Excellent), 포획률 = `catchChance(rarity, 0, status, rope)` × 보너스(상한 0.95), 도망 확률.
- `src/ui/BattleScreen.tsx`, `src/ui/CatchScreen.tsx`: 화면과 입력(탭, 쓸기, 키보드). 결과 정산은 `settleBattle`.
- `src/overworld/encounters.ts`(테스트): 구역별 레벨, `rollWild`, 트레이너 팀 타입.
- GameView 연결, 지면 respawn, 도감 5종 보상.
완료 기준: 1번 길 풀숲에서 실시간으로 싸우고 휙 던져 잡고, 트레이너 1명과 싸워 이기면 다시 안 싸운다.

## Task 3 — 세계 콘텐츠
- 바깥 지도 100×100: 네 구역, 마을 4개, 길 4개, 문지기 4명, 챔피언의 전당. 각 마을 건물 실내(센터·상점·체육관, 연구소는 오디 마을만). 체육관 실내는 우두머리까지 트레이너 1~2명.
- 트레이너 NPC 11명 + 체육관 우두머리 4명 + 챔피언, 팀/레벨은 스펙. 배지·문지기 가림 로직(world.ts에 `blockedBy(npc, save)`), 센터 회복·부활 지점, 상점 패널(shop.ts), 연구소 스타터 선택(StarterScreen 재사용)과 'starter' 플래그, 첫 대화(연구소 가라고 안내).
- 엔딩: 챔피언 승리 후 크레딧 화면 + 'champion' 플래그.
완료 기준: 처음부터 끝(챔피언)까지 막힘 없이 갈 수 있다(개발용 치트 `window.__oddie.give()`로 배지·레벨 올리기 허용).

## Task 4 — 정리와 폰
- `src/world/`, 3D UI 파일, `public/models`, `public/characters`, three 의존성 제거. `DexOverlay`의 `world/regions.ts` 의존은 `src/overworld/regions.ts`로 옮긴다(regionWeights/blendHex 등 3D 전용은 버린다).
- 폰 세로/가로 레이아웃, 십자키 크기, 전투 버튼 크기 48px 이상. `index.html` 뷰포트. 메뉴(B): 도감, 팀 보기(순서 바꾸기), 가방, 저장 상태(계정/게스트), 친구 대전, 로그아웃.
- README/메모 갱신. 테스트·build 통과.
