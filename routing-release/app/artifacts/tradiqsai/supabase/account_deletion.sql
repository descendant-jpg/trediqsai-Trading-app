-- Account deletion requests
-- Run this in the Supabase SQL editor (after drawdown.sql, which creates profiles).
--
-- The app can't hard-delete an auth user from the client, so "Delete Account"
-- flags the profile for deletion; you can process flagged rows periodically
-- (or wire an edge function with the service role to call auth.admin.deleteUser).

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

-- RPC: the signed-in user flags their own account for deletion.
create or replace function public.request_account_deletion()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set deletion_requested_at = now()
   where id = auth.uid();
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;
