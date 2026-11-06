-- ELVORAQ AI: panou de administrator cu acces controlat pe server.
-- Rulează o singură dată în Supabase SQL Editor. Contul trebuie să existe și e-mailul să fie confirmat înainte de autentificarea ca administrator.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.elvoraq_admin_allowlist (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
revoke all on table private.elvoraq_admin_allowlist from public, anon, authenticated;
alter table private.elvoraq_admin_allowlist enable row level security;
alter table private.elvoraq_admin_allowlist no force row level security;

-- Adaugă manual e-mailul administratorului în Supabase SQL Editor, fără să îl publici în repository:
-- insert into private.elvoraq_admin_allowlist(email) values (lower('ADRESA_TA_DE_EMAIL')) on conflict (email) do nothing;

create table if not exists private.elvoraq_admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  chat_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
revoke all on table private.elvoraq_admin_audit from public, anon, authenticated;
alter table private.elvoraq_admin_audit enable row level security;
alter table private.elvoraq_admin_audit no force row level security;

create or replace function private.is_elvoraq_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, auth
as $$
  select exists (
    select 1
    from private.elvoraq_admin_allowlist a
    join auth.users u on lower(u.email) = a.email
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and lower(coalesce(auth.jwt() ->> 'email', '')) = a.email
  );
$$;
revoke all on function private.is_elvoraq_admin() from public, anon, authenticated;

create or replace function public.is_elvoraq_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select private.is_elvoraq_admin();
$$;
revoke all on function public.is_elvoraq_admin() from public, anon;
grant execute on function public.is_elvoraq_admin() to authenticated;

create or replace function public.admin_list_conversations()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_result jsonb;
begin
  if not private.is_elvoraq_admin() then
    raise exception 'Acces interzis.' using errcode = '42501';
  end if;

  insert into private.elvoraq_admin_audit(admin_user_id, action, details)
  values (v_admin, 'list_conversations', jsonb_build_object('scope', 'all'));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'user_id', c.user_id,
        'user_email', u.email,
        'title', c.title,
        'messages', c.messages,
        'updated_at', c.updated_at
      ) order by c.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.chats c
  left join auth.users u on u.id = c.user_id;

  return v_result;
end;
$$;
revoke all on function public.admin_list_conversations() from public, anon;
grant execute on function public.admin_list_conversations() to authenticated;

create or replace function public.admin_reply_to_conversation(p_chat_id uuid, p_content text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_email text;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if not private.is_elvoraq_admin() then
    raise exception 'Acces interzis.' using errcode = '42501';
  end if;
  if v_content = '' or length(v_content) > 4000 then
    raise exception 'Mesajul trebuie să aibă între 1 și 4000 de caractere.' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_admin;

  update public.chats
  set messages = coalesce(messages, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'role', 'admin',
          'content', v_content,
          'admin_email', v_email,
          'created_at', now()
        )
      ),
      updated_at = now()
  where id = p_chat_id;

  if not found then
    raise exception 'Conversația nu există.' using errcode = 'P0002';
  end if;

  insert into private.elvoraq_admin_audit(admin_user_id, action, chat_id, details)
  values (v_admin, 'reply_to_conversation', p_chat_id, jsonb_build_object('message_length', length(v_content)));

  return true;
end;
$$;
revoke all on function public.admin_reply_to_conversation(uuid, text) from public, anon;
grant execute on function public.admin_reply_to_conversation(uuid, text) to authenticated;

commit;
