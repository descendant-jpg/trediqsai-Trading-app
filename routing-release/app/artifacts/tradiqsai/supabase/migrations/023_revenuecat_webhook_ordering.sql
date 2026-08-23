-- RevenueCat retries webhooks and does not guarantee delivery order. Keep the
-- most recent provider event timestamp so an old purchase cannot restore an
-- entitlement after a newer expiration has already been accepted.
alter table if exists public.profiles
  add column if not exists revenuecat_last_event_at timestamptz;

comment on column public.profiles.revenuecat_last_event_at is
  'Timestamp of the newest verified RevenueCat webhook applied to this profile.';

create or replace function public.apply_revenuecat_entitlement(
  p_user_id uuid,
  p_tier text,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_rows integer := 0;
begin
  if p_tier not in ('starter', 'pro', 'elite') then
    raise exception 'invalid RevenueCat tier';
  end if;

  update public.profiles
     set revenuecat_tier = p_tier,
         revenuecat_last_event_at = p_event_at
   where id = p_user_id
     and (revenuecat_last_event_at is null or revenuecat_last_event_at < p_event_at);

  get diagnostics updated_rows = row_count;
  return updated_rows > 0;
end;
$$;

revoke all on function public.apply_revenuecat_entitlement(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement(uuid, text, timestamptz)
  to service_role;