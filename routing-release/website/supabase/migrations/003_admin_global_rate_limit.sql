-- Global rate limiting for admin sign-in.
--
-- The per-IP limit in 002_admin_login_attempts.sql stops a single address from
-- making many guesses, but an attacker with a pool of addresses (a botnet, a
-- VPN rotation, or plain IPv6) gets a fresh allowance from each one.  A global
-- counter — stored under the sentinel key '__global__' in the same
-- admin_login_attempts table — caps the total number of failed sign-ins from
-- all addresses combined in each window.
--
-- No new tables or functions are needed: the existing admin_login_record_failure,
-- admin_login_attempt_count, and admin_login_clear functions already work with
-- any string key, so the global counter is just another row in the same table.
--
-- The sentinel key '__global__' contains double underscores, which makes it an
-- invalid IPv4 and IPv6 address.  It can never collide with a real caller's
-- address.

-- ---------------------------------------------------------------------------
-- Lock down execute permissions on all admin rate-limit functions.
--
-- PostgreSQL grants EXECUTE to PUBLIC by default, which means the Supabase
-- 'anon' and 'authenticated' roles can call these functions directly via the
-- public PostgREST endpoint using the published anon key.  That lets an
-- attacker:
--   - call admin_login_clear('__global__') to reset the global lockout, or
--   - flood admin_login_record_failure to trigger a global DoS against sign-in.
--
-- Only the server-side Next.js process needs to reach these functions; it
-- authenticates with the service-role key.  Revoke access from PUBLIC
-- (implicitly covers anon and authenticated) and grant only to service_role.
-- ---------------------------------------------------------------------------

revoke execute on function admin_login_record_failure(text, bigint) from public;
revoke execute on function admin_login_attempt_count(text, bigint) from public;
revoke execute on function admin_login_clear(text)                  from public;

grant execute on function admin_login_record_failure(text, bigint) to service_role;
grant execute on function admin_login_attempt_count(text, bigint)  to service_role;
grant execute on function admin_login_clear(text)                  to service_role;

-- Document the global sentinel convention so future engineers understand the
-- row that will appear in admin_login_attempts for the aggregate counter.
comment on table admin_login_attempts is
  'Tracks failed admin sign-in attempts per IP address and globally (sentinel '
  'key ''__global__'') for durable rate limiting that survives restarts and '
  'applies across all running instances.  Only service_role may call the '
  'accompanying RPC functions.';
