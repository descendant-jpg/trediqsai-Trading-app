-- Conditional AAL2 enforcement for users who have enrolled a verified TOTP factor.
-- Apply manually in the Supabase SQL editor after the previous app migrations.

create or replace function public.aal2_if_mfa_enrolled()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth, public
as $$
  select not exists (
    select 1 from auth.mfa_factors f
    where f.user_id = auth.uid() and f.status = 'verified'
  ) or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

revoke all on function public.aal2_if_mfa_enrolled() from public, anon;
grant execute on function public.aal2_if_mfa_enrolled() to authenticated;

create or replace function public.assert_aal2_if_mfa_enrolled()
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not public.aal2_if_mfa_enrolled() then
    raise exception 'Two-factor verification is required for this action' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_aal2_if_mfa_enrolled() from public, anon;
grant execute on function public.assert_aal2_if_mfa_enrolled() to authenticated;

-- Replace permissive own-row policies; a separate policy would OR with the
-- existing one and would not enforce the MFA predicate.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using (auth.uid() = id and public.aal2_if_mfa_enrolled());
drop policy if exists "profiles_update_own_row" on public.profiles;
create policy "profiles_update_own_row" on public.profiles for update to authenticated
  using (auth.uid() = id and public.aal2_if_mfa_enrolled())
  with check (auth.uid() = id and public.aal2_if_mfa_enrolled());

drop policy if exists "traders_manage_own_bots" on public.trading_bots;
create policy "traders_manage_own_bots" on public.trading_bots for all to authenticated
  using (user_id = auth.uid() and public.aal2_if_mfa_enrolled())
  with check (user_id = auth.uid() and public.aal2_if_mfa_enrolled());

drop policy if exists "traders_read_own_signals" on public.trading_signals;
create policy "traders_read_own_signals" on public.trading_signals for select to authenticated
  using (user_id = auth.uid() and public.aal2_if_mfa_enrolled());

do $$
begin
  if to_regclass('public.trades') is not null then
    execute 'drop policy if exists "trades_select_own" on public.trades';
    execute 'create policy "trades_select_own" on public.trades for select to authenticated using (auth.uid() = user_id and public.aal2_if_mfa_enrolled())';
    execute 'drop policy if exists "trades_insert_own" on public.trades';
    execute 'create policy "trades_insert_own" on public.trades for insert to authenticated with check (auth.uid() = user_id and public.aal2_if_mfa_enrolled())';
    execute 'drop policy if exists "trades_update_own" on public.trades';
    execute 'create policy "trades_update_own" on public.trades for update to authenticated using (auth.uid() = user_id and public.aal2_if_mfa_enrolled()) with check (auth.uid() = user_id and public.aal2_if_mfa_enrolled())';
  end if;
  if to_regclass('public.payout_requests') is not null then
    execute 'drop policy if exists "payout_requests_select_own" on public.payout_requests';
    execute 'create policy "payout_requests_select_own" on public.payout_requests for select to authenticated using (user_id = auth.uid() and public.aal2_if_mfa_enrolled())';
  end if;
end $$;

-- SECURITY DEFINER RPCs bypass table RLS, so they must assert the same
-- conditional assurance boundary explicitly.
create or replace function public.open_server_trade(
  p_asset text, p_side text, p_position_size_usd numeric default 0, p_signal_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller uuid := auth.uid(); v_price numeric; v_status text; v_row public.trades%rowtype;
begin
  if caller is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.assert_aal2_if_mfa_enrolled();
  if p_side not in ('BUY', 'SELL') then raise exception 'Invalid side' using errcode = '22023'; end if;
  if p_position_size_usd < 0 then raise exception 'Invalid position size' using errcode = '22023'; end if;
  select account_status into v_status from public.profiles where id = caller;
  if v_status = 'BLOWN' then raise exception 'Account is blown — trading is disabled.' using errcode = '42501'; end if;
  v_price := public.trusted_market_price(p_asset);
  perform set_config('app.trusted_trade', 'on', true);
  insert into public.trades (user_id, signal_id, asset, side, direction, entry_price, position_size_usd, status)
  values (caller, p_signal_id, p_asset, p_side, p_side, v_price, coalesce(p_position_size_usd, 0), 'OPEN')
  returning * into v_row;
  perform set_config('app.trusted_trade', 'off', true);
  return to_jsonb(v_row);
end $$;

create or replace function public.close_server_trade(p_trade_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare caller uuid := auth.uid(); v_row public.trades%rowtype; v_price numeric;
begin
  if caller is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.assert_aal2_if_mfa_enrolled();
  select * into v_row from public.trades where id = p_trade_id and user_id = caller for update;
  if not found then raise exception 'Trade not found' using errcode = 'P0002'; end if;
  if v_row.status = 'CLOSED' then raise exception 'Trade is already closed' using errcode = '22023'; end if;
  v_price := public.trusted_market_price(v_row.asset);
  perform set_config('app.trusted_trade', 'on', true);
  update public.trades set status = 'CLOSED', close_price = v_price where id = p_trade_id returning * into v_row;
  perform set_config('app.trusted_trade', 'off', true);
  return to_jsonb(v_row);
end $$;

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.assert_aal2_if_mfa_enrolled();
  update public.profiles set deletion_requested_at = now() where id = auth.uid();
end $$;

-- The active payout function has additional reservation logic. Replace it
-- preserving that logic while adding the assurance assertion before locking.
create or replace function public.request_evaluation_payout()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare caller uuid := auth.uid(); summary jsonb; cycle date := date_trunc('month', now() at time zone 'UTC')::date; amount numeric;
begin
  if caller is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.assert_aal2_if_mfa_enrolled();
  perform pg_advisory_xact_lock(hashtext(caller::text));
  perform 1 from public.payout_requests where user_id = caller and cycle_start = cycle for update;
  summary := public.payout_evaluation_summary();
  if not coalesce((summary ->> 'eligible')::boolean, false) then
    raise exception '%', coalesce(summary ->> 'lock_reason', 'Payout is not eligible.') using errcode = '42501';
  end if;
  amount := (summary ->> 'cashout_value')::numeric;
  if amount <= 0 then raise exception 'No eligible cashout value.' using errcode = '22023'; end if;
  insert into public.payout_requests (user_id, cycle_start, amount) values (caller, cycle, amount);
  return public.payout_evaluation_summary();
end $$;

create or replace function public.set_active_bot(bot_name text, capital_percent numeric)
returns public.profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare caller uuid := auth.uid(); needs_pro boolean; updated public.profiles;
begin
  if caller is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.assert_aal2_if_mfa_enrolled();
  if bot_name is null then
    update public.profiles set active_bot = null, allocated_capital = null where id = caller returning * into updated;
    return updated;
  end if;
  select s.requires_pro into needs_pro from public.autopilot_strategies s where s.name = bot_name;
  if needs_pro is null then raise exception 'Unknown strategy: %', bot_name using errcode = '22023'; end if;
  if needs_pro and not public.user_has_pro_access(caller) then raise exception 'This strategy requires an Elite subscription' using errcode = '42501'; end if;
  if capital_percent is null or capital_percent < 10 or capital_percent > 100 then raise exception 'Capital allocation must be between 10%% and 100%%' using errcode = '22023'; end if;
  update public.profiles set active_bot = bot_name, allocated_capital = capital_percent where id = caller returning * into updated;
  return updated;
end $$;

-- Keep the tested payout calculation intact, but remove direct authenticated
-- access to it and expose the original RPC name through an AAL-aware wrapper.
alter function public.payout_evaluation_summary() rename to payout_evaluation_summary_unchecked;
revoke all on function public.payout_evaluation_summary_unchecked() from public, anon, authenticated;
create function public.payout_evaluation_summary()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.assert_aal2_if_mfa_enrolled();
  return public.payout_evaluation_summary_unchecked();
end $$;
revoke all on function public.payout_evaluation_summary() from public, anon;
grant execute on function public.payout_evaluation_summary() to authenticated;