-- TradiQs AI — real referral tracking.
-- Run AFTER usernames.sql in the Supabase SQL editor.

-- ── 1. Referral code per profile ─────────────────────────────────────
alter table public.profiles add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_key
  on public.profiles (lower(referral_code));

-- 8-char, unambiguous (no 0/O/1/I), collision-checked code generator.
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  chars  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code   text;
begin
  loop
    code := (
      select string_agg(substr(chars, 1 + floor(random() * length(chars))::int, 1), '')
        from generate_series(1, 8)
    );
    exit when not exists (
      select 1 from public.profiles where lower(referral_code) = lower(code)
    );
  end loop;
  return code;
end;
$$;

-- Backfill codes for existing profiles.
update public.profiles
   set referral_code = public.generate_referral_code()
 where referral_code is null;

-- ── 2. Referrals table ───────────────────────────────────────────────
create table if not exists public.referrals (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- A user can only be referred once, and never by themselves.
  constraint referrals_referred_once unique (referred_id),
  constraint referrals_no_self check (referrer_id <> referred_id)
);

create index if not exists referrals_referrer_id_idx
  on public.referrals (referrer_id);

alter table public.referrals enable row level security;

-- Referrers can see (and count) their own referrals. No client insert or
-- update policies: rows are written only by the signup trigger below.
drop policy if exists "referrals_select_own" on public.referrals;
create policy "referrals_select_own"
  on public.referrals for select
  using (auth.uid() = referrer_id);

-- ── 3. Referral rewards ──────────────────────────────────────────────
-- Reward rule: every verified referral credits the referrer with $500 of
-- bonus simulated balance. The amount is recorded on the referral row so
-- the client can show what was earned, and applied server-side by trigger
-- (clients cannot write balances or referral rows).
alter table public.referrals
  add column if not exists reward_amount numeric not null default 500;

create or replace function public.grant_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set balance = balance + new.reward_amount
   where id = new.referrer_id;
  return new;
end;
$$;

drop trigger if exists referrals_grant_reward on public.referrals;
create trigger referrals_grant_reward
  after insert on public.referrals
  for each row execute function public.grant_referral_reward();

-- Backfill: pay out any referrals recorded before the reward rule existed.
-- (Idempotent: only rows still flagged as unpaid are settled.)
alter table public.referrals
  add column if not exists reward_paid boolean not null default false;

update public.profiles p
   set balance = balance + r.total
  from (
    select referrer_id, sum(reward_amount) as total
      from public.referrals
     where not reward_paid
     group by referrer_id
  ) r
 where p.id = r.referrer_id;

update public.referrals set reward_paid = true where not reward_paid;

-- New rows are paid immediately by the trigger, so mark them paid on insert.
alter table public.referrals alter column reward_paid set default true;

-- ── 4. Attribute signups + assign codes in handle_new_user ──────────
-- Extends the trigger from usernames.sql: every new profile gets a
-- referral code, and if signUp metadata carried a valid referral_code,
-- a referrals row is recorded for its owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref_code    text := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');
  v_referrer_id uuid;
begin
  insert into public.profiles (id, username, email, referral_code)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    new.email,
    public.generate_referral_code()
  )
  on conflict (id) do update
    set username      = coalesce(public.profiles.username, excluded.username),
        email         = excluded.email,
        referral_code = coalesce(public.profiles.referral_code, excluded.referral_code);

  -- Attribute the signup to the referrer, if a valid code was supplied.
  -- Invalid or self-referential codes are ignored silently: a bad invite
  -- code must never block account creation.
  if v_ref_code is not null then
    select id into v_referrer_id
      from public.profiles
     where lower(referral_code) = lower(v_ref_code)
       and id <> new.id
     limit 1;

    if v_referrer_id is not null then
      insert into public.referrals (referrer_id, referred_id)
      values (v_referrer_id, new.id)
      on conflict (referred_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;
