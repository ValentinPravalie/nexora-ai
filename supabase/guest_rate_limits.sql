-- ELVORAQ AI: quota persistent pentru vizitatori fără cont.
-- Execută acest fișier separat în Supabase SQL Editor după publicarea codului.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.guest_daily_usage (
  fingerprint_hash text not null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  usage_date date not null,
  message_count integer not null default 0 check (message_count >= 0),
  primary key (fingerprint_hash, usage_date)
);

revoke all on table private.guest_daily_usage from public, anon, authenticated;
alter table private.guest_daily_usage enable row level security;
alter table private.guest_daily_usage no force row level security;

create or replace function public.consume_guest_daily_message(
  p_fingerprint_hash text,
  p_limit integer default 10
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_count integer;
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 10));
begin
  if p_fingerprint_hash is null or p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    return -1;
  end if;

  insert into private.guest_daily_usage as usage
    (fingerprint_hash, usage_date, message_count)
  values (p_fingerprint_hash, pg_catalog.current_date, 1)
  on conflict (fingerprint_hash, usage_date) do update
    set message_count = usage.message_count + 1
    where usage.message_count < v_limit
  returning message_count into v_count;

  if not found then
    return -1;
  end if;

  if pg_catalog.random() < 0.01 then
    delete from private.guest_daily_usage
    where usage_date < pg_catalog.current_date - 30;
  end if;

  return v_limit - v_count;
end;
$$;

revoke all on function public.consume_guest_daily_message(text, integer) from public, authenticated;
grant execute on function public.consume_guest_daily_message(text, integer) to anon;

commit;
