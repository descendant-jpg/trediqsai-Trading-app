-- Durable, general-purpose request rate limiting.
--
-- Counting requests in the memory of one server process is not enough: the
-- count is lost on every restart or redeploy and is not shared between
-- instances, so a spammer can reset their allowance by waiting or by hitting a
-- different instance. This table moves the count into Postgres.
--
-- `scope` keeps different limits apart (e.g. the public waitlist form vs any
-- future limited endpoint) so they cannot consume each other's allowance.

create table if not exists rate_limit_counters (
  scope        text        not null,
  key          text        not null,
  count        integer     not null default 0,
  window_start timestamptz not null default now(),
  primary key (scope, key)
);

-- Only the service role reaches this table, from server-side routes.
alter table rate_limit_counters enable row level security;

-- No RLS policies intentionally: there is no legitimate browser access.

-- Supports cleaning out elapsed windows.
create index if not exists rate_limit_counters_window_start_idx
  on rate_limit_counters (window_start);

-- ---------------------------------------------------------------------------
-- Consume one unit of allowance and report the resulting count.
--
-- A single atomic statement, so simultaneous requests for the same key cannot
-- race each other into extra allowance. An elapsed window restarts at 1.
-- The caller compares the returned count against its own maximum, which keeps
-- the limit configurable in application code.
-- ---------------------------------------------------------------------------
create or replace function rate_limit_consume(
  p_scope     text,
  p_key       text,
  p_window_ms bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count  integer;
  v_cutoff timestamptz := now() - make_interval(secs => p_window_ms / 1000.0);
begin
  insert into rate_limit_counters as r (scope, key, count, window_start)
  values (p_scope, p_key, 1, now())
  on conflict (scope, key) do update
    set
      count        = case when r.window_start < v_cutoff then 1 else r.count + 1 end,
      -- The window is fixed from its first request; it must not slide forward
      -- on every hit, or a steady trickle of requests would never reset.
      window_start = case when r.window_start < v_cutoff then now() else r.window_start end
  returning r.count into v_count;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read the current count without consuming allowance. Elapsed windows read as
-- 0, so no cleanup job is needed for correctness.
-- ---------------------------------------------------------------------------
create or replace function rate_limit_peek(
  p_scope     text,
  p_key       text,
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
      select r.count
      from rate_limit_counters r
      where r.scope = p_scope
        and r.key = p_key
        and r.window_start >= now() - make_interval(secs => p_window_ms / 1000.0)
    ),
    0
  );
$$;

-- ---------------------------------------------------------------------------
-- Delete rows whose window has elapsed, so the table does not grow forever.
-- Safe to call at any time; expired rows already count as zero.
-- ---------------------------------------------------------------------------
create or replace function rate_limit_prune(p_window_ms bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from rate_limit_counters
  where window_start < now() - make_interval(secs => p_window_ms / 1000.0);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock the functions down.
--
-- These run as `security definer`, so they deliberately bypass the row level
-- security above. Postgres grants EXECUTE on a new function to PUBLIC by
-- default, and Supabase exposes `anon` and `authenticated` over PostgREST —
-- so without these revokes any visitor could call them directly: wiping live
-- counters with a tiny prune window, or burning through someone else's
-- allowance to lock them out. Only the server-side service role may call them.
--
-- Revoking from PUBLIC alone is not enough: a role that was granted EXECUTE
-- directly keeps it, so `anon` and `authenticated` are revoked explicitly.
-- ---------------------------------------------------------------------------
revoke all on function rate_limit_consume(text, text, bigint) from public;
revoke all on function rate_limit_peek(text, text, bigint)    from public;
revoke all on function rate_limit_prune(bigint)               from public;

do $$
begin
  -- Supabase always has these roles; guarded so the migration also applies
  -- cleanly to a plain Postgres database (e.g. a local test instance).
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function rate_limit_consume(text, text, bigint) from anon;
    revoke all on function rate_limit_peek(text, text, bigint)    from anon;
    revoke all on function rate_limit_prune(bigint)               from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function rate_limit_consume(text, text, bigint) from authenticated;
    revoke all on function rate_limit_peek(text, text, bigint)    from authenticated;
    revoke all on function rate_limit_prune(bigint)               from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function rate_limit_consume(text, text, bigint) to service_role;
    grant execute on function rate_limit_peek(text, text, bigint)    to service_role;
    grant execute on function rate_limit_prune(bigint)               to service_role;
  end if;
end
$$;

-- The table itself is service-role only too; RLS above already denies the
-- PostgREST roles, but no grants means it is not reachable at all.
revoke all on table rate_limit_counters from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table rate_limit_counters from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table rate_limit_counters from authenticated;
  end if;
end
$$;
