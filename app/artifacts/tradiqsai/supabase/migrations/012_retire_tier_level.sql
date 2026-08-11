-- Retire profiles.tier_level in favour of the canonical profiles.tier, and
-- restore a safe profile-creation path.
--
-- Two entitlement columns on one table is a security problem, not just
-- untidiness: 009 locks down `tier`, but a deployment provisioned from
-- schema.sql also has `tier_level` (the column the admin UI and the older
-- profile model use). Any column left out of the explicit GRANT list is
-- server-owned by default, so `tier_level` is not directly writable -- but
-- keeping a second, parallel entitlement field invites a future grant or a
-- code path that trusts it, and reopens the bypass. One column is the
-- contract; this migration makes that true.
--
-- Note: profiles.tier_level is distinct from affiliates.tier_level, which is
-- a partner rank ('Ambassador'/'Elite'/'Master'), not a paid entitlement.
-- That column is intentionally left alone.
--
-- Safe to run more than once.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'tier_level'
  ) then
    -- Carry values across before dropping. schema.sql stores capitalised
    -- values ('Free','Pro','Elite','Whale'); `tier` is lowercase.
    update public.profiles
       set tier = lower(trim(tier_level))
     where tier_level is not null
       and lower(trim(tier_level)) <> 'free'
       and coalesce(tier, 'free') = 'free';

    alter table public.profiles drop column tier_level;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Profile creation
-- ---------------------------------------------------------------------------

-- 009 removed the blanket client INSERT policy (it let a client create a row
-- with any column values, including a paid tier). Rows are instead created
-- by this trigger as the database owner, which cannot be influenced by the
-- client: a new profile always starts on the free tier regardless of
-- anything supplied at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, username, tier)
  values (
    new.id,
    new.email,
    -- Prefer a supplied display name, else the email local part.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, 'trader'), '@', 1)
    ),
    'free' -- never trust signup metadata for entitlement
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Backfill any auth user that predates the trigger, so existing accounts are
-- not left without a profile row now that clients cannot insert one.
insert into public.profiles (id, email, username, tier)
select
  u.id,
  u.email,
  split_part(coalesce(u.email, 'trader'), '@', 1),
  'free'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
