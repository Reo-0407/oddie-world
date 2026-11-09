-- 친구 대전(인터넷) 표들. 모두 service role(Edge Function)만 읽고 쓴다.
-- 클라이언트는 표를 직접 못 건드리고, 랭킹은 아래 읽기 전용 함수로만 본다.
-- 여러 번 실행해도 안전하도록 if not exists / create or replace를 쓴다.

create table if not exists public.rooms (
  code text primary key,
  room jsonb not null,
  -- 동시에 같은 방을 고치는 요청을 가리는 번호 (낙관적 잠금: version이 같을 때만 저장)
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 사용자마다 서버만 아는 개인 채널 비밀값. 채널 이름 = player:{secret}
create table if not exists public.player_channels (
  user_id uuid primary key,
  secret text not null,
  updated_at timestamptz not null default now()
);

-- 방 코드 추측 속도 제한: 1분 창 안에서 실패 횟수
create table if not exists public.guess_limits (
  user_id uuid primary key,
  window_start bigint not null,
  fails integer not null default 0
);

create table if not exists public.ratings (
  user_id uuid primary key,
  name text not null,
  rating integer not null default 1000,
  games integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  room_code text primary key, -- 방 하나당 한 번만 기록(중복 갱신 방지)
  player_a uuid not null,
  player_b uuid not null,
  winner uuid,
  loser uuid,
  draw boolean not null default false,
  reason text not null,
  played_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.player_channels enable row level security;
alter table public.guess_limits enable row level security;
alter table public.ratings enable row level security;
alter table public.matches enable row level security;
-- 정책을 하나도 만들지 않는다: service role만 접근(RLS를 우회)하고 anon/authenticated는 아무것도 못 한다.
revoke all on public.rooms, public.player_channels, public.guess_limits, public.ratings, public.matches from anon, authenticated;

-- 판 결과를 정확히 한 번만 기록하고 점수 변화량(delta)을 더한다.
-- matches.room_code가 이미 있으면 아무것도 안 하고 false를 돌려준다.
create or replace function public.record_match(
  p_room_code text,
  p_player_a uuid, p_player_b uuid,
  p_name_a text, p_name_b text,
  p_winner uuid, p_loser uuid, p_draw boolean, p_reason text,
  p_delta_a integer, p_delta_b integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  insert into public.matches (room_code, player_a, player_b, winner, loser, draw, reason)
  values (p_room_code, p_player_a, p_player_b, p_winner, p_loser, p_draw, p_reason)
  on conflict (room_code) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  insert into public.ratings (user_id, name, rating, games, updated_at)
  values (p_player_a, p_name_a, 1000 + p_delta_a, 1, now())
  on conflict (user_id) do update
    set rating = public.ratings.rating + p_delta_a,
        games = public.ratings.games + 1,
        name = excluded.name,
        updated_at = now();
  insert into public.ratings (user_id, name, rating, games, updated_at)
  values (p_player_b, p_name_b, 1000 + p_delta_b, 1, now())
  on conflict (user_id) do update
    set rating = public.ratings.rating + p_delta_b,
        games = public.ratings.games + 1,
        name = excluded.name,
        updated_at = now();
  return true;
end;
$$;

revoke all on function public.record_match(text, uuid, uuid, text, text, uuid, uuid, boolean, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_match(text, uuid, uuid, text, text, uuid, uuid, boolean, text, integer, integer) to service_role;

-- 랭킹 상위 n명 (읽기 전용). user_id는 내보내지 않는다.
create or replace function public.top_ratings(n integer default 20)
returns table (name text, rating integer, games integer)
language sql
security definer
set search_path = public
stable
as $$
  select r.name, r.rating, r.games
  from public.ratings r
  order by r.rating desc, r.games desc, r.updated_at asc
  limit least(greatest(n, 1), 100);
$$;

-- 내 점수
create or replace function public.my_rating()
returns table (name text, rating integer, games integer)
language sql
security definer
set search_path = public
stable
as $$
  select r.name, r.rating, r.games from public.ratings r where r.user_id = auth.uid();
$$;

revoke all on function public.top_ratings(integer) from public;
revoke all on function public.my_rating() from public;
grant execute on function public.top_ratings(integer) to anon, authenticated;
grant execute on function public.my_rating() to authenticated;
