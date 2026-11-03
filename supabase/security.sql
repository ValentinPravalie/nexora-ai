-- ELVORAQ AI: execută acest script integral în Supabase SQL Editor.
-- Protejează conversațiile și activează limitarea persistentă a cererilor API.

begin;

alter table public.chats enable row level security;
alter table public.chats force row level security;

revoke all on table public.chats from anon;
grant select, insert, update, delete on table public.chats to authenticated;

drop policy if exists "Users can view own chats" on public.chats;
drop policy if exists "Users can create own chats" on public.chats;
drop policy if exists "Users can update own chats" on public.chats;
drop policy if exists "Users can delete own chats" on public.chats;

create policy "Users can view own chats"
on public.chats for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own chats"
on public.chats for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own chats"
on public.chats for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own chats"
on public.chats for delete to authenticated
using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'default',
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, bucket)
);

alter table private.api_rate_limits add column if not exists bucket text not null default 'default';
alter table private.api_rate_limits drop constraint if exists api_rate_limits_pkey;
alter table private.api_rate_limits add constraint api_rate_limits_pkey primary key (user_id, bucket);

revoke all on table private.api_rate_limits from public, anon, authenticated;
alter table private.api_rate_limits enable row level security;
alter table private.api_rate_limits force row level security;

drop function if exists public.consume_api_rate_limit(integer);

create or replace function public.consume_api_rate_limit(p_limit integer default 12, p_bucket text default 'default')
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_bucket text := left(coalesce(p_bucket, 'default'), 80);
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 60));
begin
  if v_user_id is null then
    return false;
  end if;

  insert into private.api_rate_limits (user_id, bucket, window_started_at, request_count)
  values (v_user_id, v_bucket, pg_catalog.now(), 1)
  on conflict (user_id, bucket) do update
  set
    window_started_at = case
      when private.api_rate_limits.window_started_at < pg_catalog.now() - interval '1 minute'
      then pg_catalog.now()
      else private.api_rate_limits.window_started_at
    end,
    request_count = case
      when private.api_rate_limits.window_started_at < pg_catalog.now() - interval '1 minute'
      then 1
      else private.api_rate_limits.request_count + 1
    end
  returning request_count into v_count;

  return v_count <= v_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(integer, text) from public, anon;
grant execute on function public.consume_api_rate_limit(integer, text) to authenticated;

commit;
