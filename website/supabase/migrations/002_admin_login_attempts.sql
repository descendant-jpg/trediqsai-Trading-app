-- Durable rate limiting for admin sign-in.
--
-- The admin area is protected by a single shared password, so throttling
-- guesses is the main defence against brute force. Counting attempts in the
-- memory of one server process is not enough: the count is lost on every
-- restart or redeploy and is not shared between instances, so an attacker can
-- simply keep going. This table moves the count into Postgres, where it
-- survives restarts and is shared by every instance.

create table if not exists admin_login_attempts (
  ip           text primary key,
  attempts     integer     not null default 0,
  window_start timestamptz not null default now()
);

-- Only the service role reaches this table, via the server-side sign-in route.
alter table admin_login_attempts enable row level security;

-- No RLS policies intentionally: there is no legitimate browser access.

-- Lets an operator clear out stale rows; not required for correctness.
create index if not exists admin_login_attempts_window_start_idx
  on admin_login_attempts (window_start);

-- ---------------------------------------------------------------------------
-- Record one failed sign-in and report whether the IP is now locked out.
--
-- Runs as a single atomic statement so simultaneous guesses from the same IP
-- cannot race each other into extra attempts. Returns the attempt count within
-- the current window.
-- ---------------------------------------------------------------------------
create or replace function admin_login_record_failure(
  p_ip        text,
  p_window_ms bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_cutoff   timestamptz := now() - make_interval(secs => p_window_ms / 1000.0);
begin
  insert into admin_login_attempts as a (ip, attempts, window_start)
  values (p_ip, 1, now())
  on conflict (ip) do update
    set
      -- A window that has already elapsed starts fresh at 1.
      attempts     = case when a.window_start < v_cutoff then 1 else a.attempts + 1 end,
      window_start = case when a.window_start < v_cutoff then now() else a.window_start end
  returning a.attempts into v_attempts;

  return v_attempts;
end;
$$;

-- ---------------------------------------------------------------------------
-- How many failures are on record for this IP in the current window.
-- Expired windows read as 0 without needing a cleanup job.
-- ---------------------------------------------------------------------------
create or replace function admin_login_attempt_count(
  p_ip        text,
  p_window_ms bigint
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select a.attempts
      from admin_login_attempts a
      where a.ip = p_ip
        and a.window_start >= now() - make_interval(secs => p_window_ms / 1000.0)
    ),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- Forget an IP's failures. Called after a correct password so a legitimate
-- admin who mistyped a few times is not left near the limit.
-- ---------------------------------------------------------------------------
create or replace function admin_login_clear(p_ip text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from admin_login_attempts where ip = p_ip;
$$;

-- ---------------------------------------------------------------------------
-- Lock the functions down.
--
-- These run as `security definer`, so they deliberately bypass the row level
-- security above. Postgres grants EXECUTE on a new function to PUBLIC by
-- default, and Supabase exposes `anon` and `authenticated` over PostgREST —
-- so without these revokes anyone on the internet could call them directly and
-- clear their own lockout with `admin_login_clear`, defeating the whole point
-- of throttling password guesses. Only the server-side service role may call
-- them.
--
-- Revoking from PUBLIC alone is not enough: a role that was granted EXECUTE
-- directly keeps it, so `anon` and `authenticated` are revoked explicitly.
-- ---------------------------------------------------------------------------
revoke all on function admin_login_record_failure(text, bigint) from public;
revoke all on function admin_login_attempt_count(text, bigint)  from public;
revoke all on function admin_login_clear(text)                  from public;

do $$
begin
  -- Supabase always has these roles; guarded so the migration also applies
  -- cleanly to a plain Postgres database (e.g. a local test instance).
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function admin_login_record_failure(text, bigint) from anon;
    revoke all on function admin_login_attempt_count(text, bigint)  from anon;
    revoke all on function admin_login_clear(text)                  from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function admin_login_record_failure(text, bigint) from authenticated;
    revoke all on function admin_login_attempt_count(text, bigint)  from authenticated;
    revoke all on function admin_login_clear(text)                  from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function admin_login_record_failure(text, bigint) to service_role;
    grant execute on function admin_login_attempt_count(text, bigint)  to service_role;
    grant execute on function admin_login_clear(text)                  to service_role;
  end if;
end
$$;

-- The table itself is service-role only too.
revoke all on table admin_login_attempts from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table admin_login_attempts from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table admin_login_attempts from authenticated;
  end if;
end
$$;
