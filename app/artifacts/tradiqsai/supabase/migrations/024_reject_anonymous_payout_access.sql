-- Anonymous Supabase sessions have the authenticated Postgres role, so role
-- membership alone cannot protect payout data. Reject the signed JWT claim at
-- the database boundary before evaluation data is read or a payout is created.
-- Safe to run more than once.

create or replace function public.is_anonymous_auth_user()
returns boolean
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb
      ->> 'is_anonymous')::boolean,
    false
  );
$$;

-- Keep the established implementations private, then expose guarded public
-- wrappers. The request implementation calls payout_evaluation_summary(), so
-- it also receives the summary guard during its transaction.
do $$
begin
  if to_regprocedure('public.payout_evaluation_summary_unchecked()') is null
     and to_regprocedure('public.payout_evaluation_summary()') is not null then
    alter function public.payout_evaluation_summary()
      rename to payout_evaluation_summary_unchecked;
  end if;

  if to_regprocedure('public.request_evaluation_payout_unchecked()') is null
     and to_regprocedure('public.request_evaluation_payout()') is not null then
    alter function public.request_evaluation_payout()
      rename to request_evaluation_payout_unchecked;
  end if;
end;
$$;

create or replace function public.payout_evaluation_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_anonymous_auth_user() then
    raise exception 'Create an account to access payout evaluation.'
      using errcode = '42501';
  end if;
  return public.payout_evaluation_summary_unchecked();
end;
$$;

create or replace function public.request_evaluation_payout()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_anonymous_auth_user() then
    raise exception 'Create an account to request a payout.'
      using errcode = '42501';
  end if;
  return public.request_evaluation_payout_unchecked();
end;
$$;

revoke all on function public.payout_evaluation_summary_unchecked() from public, anon, authenticated;
revoke all on function public.request_evaluation_payout_unchecked() from public, anon, authenticated;
revoke all on function public.payout_evaluation_summary() from public, anon;
revoke all on function public.request_evaluation_payout() from public, anon;
grant execute on function public.payout_evaluation_summary() to authenticated;
grant execute on function public.request_evaluation_payout() to authenticated;

drop policy if exists "payout_requests_select_own" on public.payout_requests;
create policy "payout_requests_select_own"
  on public.payout_requests for select to authenticated
  using (auth.uid() = user_id and not public.is_anonymous_auth_user());