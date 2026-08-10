-- TradiQs AI — username support for auth.
-- Run AFTER drawdown.sql in the Supabase SQL editor.

-- ── 1. Username + email columns on profiles ──────────────────────────
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists email text;

-- Case-insensitive uniqueness for usernames.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username));

-- ── 2. Populate from signup metadata ─────────────────────────────────
-- handle_new_user now copies the username (from signUp options.data)
-- and email into the profile row, so the client never needs INSERT
-- rights on profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    new.email
  )
  on conflict (id) do update
    set username = coalesce(public.profiles.username, excluded.username),
        email    = excluded.email;
  return new;
end;
$$;

-- ── 3. Username → email lookup for sign-in ───────────────────────────
-- SECURITY DEFINER RPC instead of an open SELECT policy: an anon-readable
-- profiles table would leak every user's email address. This returns one
-- email only for an exact username match.
create or replace function public.get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email
    from public.profiles
   where lower(username) = lower(trim(p_username))
   limit 1;
$$;

revoke execute on function public.get_email_for_username(text) from public;
grant execute on function public.get_email_for_username(text) to anon, authenticated;

-- ── 4. Username availability check for signup (optional, same pattern) ──
create or replace function public.is_username_taken(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
     where lower(username) = lower(trim(p_username))
  );
$$;

revoke execute on function public.is_username_taken(text) from public;
grant execute on function public.is_username_taken(text) to anon, authenticated;

-- ── 5. Claim a username after social sign-in ─────────────────────────
-- Google/Apple sign-ups have no username in their metadata, so the profile
-- row is created with username = null. Clients have no UPDATE policy on
-- profiles (balances are server-owned), so this SECURITY DEFINER RPC lets
-- an authenticated user set their OWN username exactly once (only while
-- it is still null). Returns the stored username.
create or replace function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := trim(p_username);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_username is null or length(v_username) < 3 or length(v_username) > 20 then
    raise exception 'Username must be 3-20 characters.';
  end if;
  if v_username !~ '^[A-Za-z0-9_]+$' then
    raise exception 'Username can only contain letters, numbers, and underscores.';
  end if;

  update public.profiles
     set username = v_username,
         updated_at = now()
   where id = auth.uid()
     and username is null;

  if not found then
    raise exception 'Username is already set for this account.';
  end if;

  return v_username;
exception
  when unique_violation then
    raise exception 'Username already taken.';
end;
$$;

revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
