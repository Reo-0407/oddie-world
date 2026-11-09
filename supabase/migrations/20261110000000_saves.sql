-- 계정별 클라우드 저장. 본인 행만 읽고 쓸 수 있다(RLS). 새 표를 자동 노출하지 않는 프로젝트라 권한은 명시적으로 준다.
-- 여러 번 실행해도 안전하다.

create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  -- 서버에서도 크기를 막는다(200KB). 클라이언트 검사와 같은 값.
  constraint saves_data_size check (octet_length(data::text) <= 204800)
);

alter table public.saves enable row level security;

-- updated_at은 클라이언트가 못 속이게 서버 시계로 채운다
create or replace function public.saves_touch() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saves_touch on public.saves;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.saves_touch();

revoke all on public.saves from anon, authenticated;
grant select, insert, update, delete on public.saves to authenticated;
grant all on public.saves to service_role;

drop policy if exists "saves_select_own" on public.saves;
drop policy if exists "saves_insert_own" on public.saves;
drop policy if exists "saves_update_own" on public.saves;
drop policy if exists "saves_delete_own" on public.saves;

create policy "saves_select_own" on public.saves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "saves_insert_own" on public.saves for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "saves_update_own" on public.saves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saves_delete_own" on public.saves for delete to authenticated
  using ((select auth.uid()) = user_id);
