-- Forward fix for the payout evaluation guardrails introduced in 014.
--
-- 014 is already applied to live projects, so a database that recorded it will
-- never rerun it. These two defects must therefore ship as their own
-- migration:
--
--   1. Active-day farming. 014 credited an evaluation day for any verified
--      trade ROW created that day, so a trader could open six microscopic
--      positions on six days, never close them, take no real risk, and satisfy
--      the six-day requirement. A day now counts only when a verified trade is
--      CLOSED, and the calendar day comes from the server-set closed_at
--      settlement timestamp rather than created_at.
--
--   2. Repeat reservation of the same profit. 014 computed
--      least(earned, cap - paid), which only subtracts prior reservations from
--      the CAP. With $2,000 profit on Pro (earning $100) a trader could request
--      $100, then request the same $100 again, repeating until the $250 cap was
--      drained without ever earning more. The amount is now
--      greatest(0, least(earned, cap) - paid): reservations are subtracted from
--      the capped EARNED entitlement, so new payable value appears only after
--      new verified profit.
--
-- Everything else from 014 (verified price provenance, RLS, grants, the
-- payout tables) is unchanged and is not repeated here.
--
-- Safe to run more than once.

-- An index matched to the corrected active-day predicate.
create index if not exists trades_verified_settled_days_idx
  on public.trades (user_id, closed_at)
  where price_source = 'SERVER'
    and status = 'CLOSED'
    and closed_at is not null;

create or replace function public.payout_evaluation_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  profile_row public.profiles%rowtype;
  cycle date := date_trunc('month', now() at time zone 'UTC')::date;
  day_start timestamptz := (now() at time zone 'UTC')::date::timestamptz;
  effective_tier text;
  plan text;
  split numeric;
  cap numeric;
  verified_pnl numeric;
  daily_pnl numeric;
  daily_loss numeric;
  total_equity numeric;
  active_days integer;
  paid numeric;
  virtual_profit numeric;
  cashout numeric;
  cycle_row public.payout_evaluation_cycles%rowtype;
  reason text;
  eligible boolean;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into profile_row from public.profiles where id = caller for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  -- Realized P&L from verified trades only.
  select coalesce(sum(t.pnl), 0) into verified_pnl
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.status = 'CLOSED'
     and t.pnl is not null;

  select coalesce(sum(t.pnl), 0) into daily_pnl
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.status = 'CLOSED'
     and t.pnl is not null
     and t.closed_at >= day_start;

  total_equity := 10000 + verified_pnl;
  daily_loss := greatest(0, -daily_pnl);

  effective_tier := lower(trim(coalesce(
    profile_row.manual_tier_override,
    profile_row.tier,
    'free'
  )));
  if profile_row.free_trial_until is not null and profile_row.free_trial_until > now() then
    effective_tier := 'pro';
  end if;
  if effective_tier in ('elite', 'whale', 'vip') then
    plan := 'ELITE';
    split := 0.10;
    cap := 500;
  elsif effective_tier = 'pro' then
    plan := 'PRO';
    split := 0.05;
    cap := 250;
  else
    -- A free account receives no payable summary; the client must not infer
    -- eligibility from local subscription state.
    return jsonb_build_object(
      'plan', 'PRO', 'starting_demo_balance', 10000,
      'virtual_profit', 0, 'profit_split', 0.05, 'monthly_cap', 250,
      'monthly_paid', 0, 'cashout_value', 0,
      'daily_loss', round(daily_loss, 2),
      'total_equity', round(total_equity, 2),
      'active_days', 0, 'violated', false,
      'violation_reason', null, 'eligible', false,
      'lock_reason', 'An active Pro or Elite plan is required for payouts.'
    );
  end if;

  -- Latch either hard breach. Once recorded, it remains a violation until the
  -- next billing/evaluation cycle even if an account later appears to recover.
  if profile_row.account_status = 'BLOWN' then
    reason := 'Account violated by the drawdown monitor.';
  elsif daily_loss > 500 then
    reason := 'Daily drawdown limit breached (more than $500 lost in 24 hours).';
  elsif total_equity < 9000 then
    reason := 'Total drawdown limit breached (equity fell below $9,000).';
  end if;

  insert into public.payout_evaluation_cycles (user_id, cycle_start, violated_at, violation_reason)
  values (caller, cycle, case when reason is null then null else now() end, reason)
  on conflict (user_id, cycle_start) do update
    set violated_at = coalesce(public.payout_evaluation_cycles.violated_at, excluded.violated_at),
        violation_reason = coalesce(public.payout_evaluation_cycles.violation_reason, excluded.violation_reason);

  select * into cycle_row
    from public.payout_evaluation_cycles
   where user_id = caller and cycle_start = cycle;

  -- An active day is credited only when a verified trade settles. Open trades
  -- (including tiny, never-closed positions) do not count, and the calendar
  -- day comes from the server-set closed_at timestamp rather than client-
  -- supplied created_at.
  select count(distinct (t.closed_at at time zone 'UTC')::date)::integer
    into active_days
    from public.trades t
   where t.user_id = caller
     and t.price_source = 'SERVER'
     and t.status = 'CLOSED'
     and t.closed_at is not null
     and t.closed_at >= cycle::timestamptz;

  select coalesce(sum(r.amount), 0) into paid
    from public.payout_requests r
   where r.user_id = caller
     and r.cycle_start = cycle
     and r.status in ('REQUESTED', 'APPROVED', 'PAID');

  virtual_profit := greatest(0, verified_pnl);
  -- A reservation spends earned entitlement as well as cap room. The old
  -- min(profit split, cap - paid) shape allowed a trader to reserve the same
  -- $100 profit repeatedly until the $250/$500 cap. Subtracting paid from the
  -- capped earned entitlement means a rapid duplicate sees $0 after the first
  -- transaction commits; new cashout value appears only after new profit.
  cashout := greatest(0, least(virtual_profit * split, cap) - paid);

  if cycle_row.violated_at is not null then
    reason := cycle_row.violation_reason;
  elsif active_days < 6 then
    reason := format('Trade on %s more separate day%s to qualify.', 6 - active_days, case when 6 - active_days = 1 then '' else 's' end);
  elsif paid >= cap then
    reason := 'Max Monthly Payout Cap reached.';
  elsif cashout <= 0 then
    reason := 'No eligible virtual profit is available to cash out.';
  else
    reason := null;
  end if;
  eligible := reason is null;

  return jsonb_build_object(
    'plan', plan,
    'starting_demo_balance', 10000,
    'virtual_profit', round(virtual_profit, 2),
    'profit_split', split,
    'monthly_cap', cap,
    'monthly_paid', round(paid, 2),
    'cashout_value', round(cashout, 2),
    'daily_loss', round(daily_loss, 2),
    'total_equity', round(total_equity, 2),
    'active_days', active_days,
    'violated', cycle_row.violated_at is not null,
    'violation_reason', cycle_row.violation_reason,
    'eligible', eligible,
    'lock_reason', reason
  );
end;
$$;

-- Creates a reserved payout request only after recomputing every guardrail in
-- the same transaction. The advisory lock prevents simultaneous requests
-- from racing past the monthly cap.
create or replace function public.request_evaluation_payout()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  summary jsonb;
  cycle date := date_trunc('month', now() at time zone 'UTC')::date;
  amount numeric;
begin
  if caller is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  -- This transaction-scoped lock serializes *all* payout attempts for one
  -- user, including the zero-row case where a row-level lock has nothing to
  -- lock yet. Hash collisions can only serialize unrelated users; they never
  -- let a request bypass the check.
  perform pg_advisory_xact_lock(hashtext(caller::text));
  -- Lock existing reservations as an additional protection if administrative
  -- status changes or other server workflows inspect this cycle concurrently.
  perform 1
    from public.payout_requests
   where user_id = caller
     and cycle_start = cycle
   for update;
  summary := public.payout_evaluation_summary();
  if not coalesce((summary ->> 'eligible')::boolean, false) then
    raise exception '%', coalesce(summary ->> 'lock_reason', 'Payout is not eligible.')
      using errcode = '42501';
  end if;
  amount := (summary ->> 'cashout_value')::numeric;
  if amount <= 0 then
    raise exception 'No eligible cashout value.' using errcode = '22023';
  end if;
  insert into public.payout_requests (user_id, cycle_start, amount)
  values (caller, cycle, amount);
  return public.payout_evaluation_summary();
end;
$$;

revoke all on function public.payout_evaluation_summary() from public, anon;
revoke all on function public.request_evaluation_payout() from public, anon;
grant execute on function public.payout_evaluation_summary() to authenticated;
grant execute on function public.request_evaluation_payout() to authenticated;
