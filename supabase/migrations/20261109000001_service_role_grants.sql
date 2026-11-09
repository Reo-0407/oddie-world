-- 새 표를 Data API에 자동 노출하지 않는 프로젝트라서 service role(Edge Function)에게만 명시적으로 권한을 준다.
-- anon / authenticated에게는 주지 않는다(랭킹은 top_ratings, my_rating 함수로만 본다).
grant usage on schema public to service_role;
grant all on table public.rooms, public.player_channels, public.guess_limits, public.ratings, public.matches to service_role;
