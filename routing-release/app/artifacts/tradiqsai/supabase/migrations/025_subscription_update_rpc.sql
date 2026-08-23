-- Verified Stripe fulfillment must cross one database-owned boundary. This
-- function updates only the paid entitlement tier and records provider event
-- IDs so a replayed PaymentIntent cannot grant access twice.
--
-- This file is intended for manual execution in the Supabase SQL editor. It
-- does not modify any user until the API calls the RPC with a verified event.

create table if not exists public.subscription_webhook_events (
  provider text not null,
  event_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null,
  event_at timestamptz not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id),
  constraint subscription_webhook_events_provider_check
    check (provider in ('stripe')),
  constraint subscription_webhook_events_tier_check
    check (tier in ('free', 'pro', 'elite'))
);

alter table public.subscription_webhook_events enable row level security;
revoke all on public.subscription_webhook_events from public, anon, authenticated;

comment on table public.subscription_webhook_events is
  'Service-owned idempotency ledger for verified paid-entitlement webhooks.';

create or replace function public.handle_subscription_update(
  p_user_id uuid,
  p_tier text,
  p_provider text,
  p_event_id text,
  p_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_rows integer := 0;
  updated_rows integer := 0;
  newest_prior_event timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if p_tier not in ('free', 'pro', 'elite') then
    raise exception 'invalid subscription tier' using errcode = '22023';
  end if;
  if p_provider <> 'stripe' then
    raise exception 'invalid subscription provider' using errcode = '22023';
  end if;
  if p_event_id is null or length(p_event_id) < 3 or length(p_event_id) > 255 then
    raise exception 'invalid subscription event id' using errcode = '22023';
  end if;
  if p_event_at is null then
    raise exception 'subscription event timestamp is required' using errcode = '22023';
  end if;

  -- Serialize all fulfillment attempts for one profile before inspecting the
  -- ledger. This closes the race between the client confirmation fast path and
  -- Stripe's webhook retry for the same PaymentIntent.
  perform 1
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    raise exception 'subscription profile not found' using errcode = 'P0002';
  end if;

  insert into public.subscription_webhook_events (
    provider,
    event_id,
    user_id,
    tier,
    event_at
  )
  values (
    p_provider,
    p_event_id,
    p_user_id,
    p_tier,
    p_event_at
  )
  on conflict (provider, event_id) do nothing;

  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then
    return false;
  end if;

  select max(event_at)
    into newest_prior_event
    from public.subscription_webhook_events
   where provider = p_provider
     and user_id = p_user_id
     and event_id <> p_event_id;

  -- Record but do not apply a delayed event. A provider retry then remains
  -- idempotent instead of repeatedly attempting to roll state backward.
  if newest_prior_event is not null and newest_prior_event >= p_event_at then
    return false;
  end if;

  update public.profiles
     set tier = p_tier
   where id = p_user_id;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'subscription profile update failed' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.handle_subscription_update(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.handle_subscription_update(uuid, text, text, text, timestamptz)
  to service_role;