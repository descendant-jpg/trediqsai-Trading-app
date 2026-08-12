---
name: Supabase schema drift vs. migration files
description: The Supabase project lags behind supabase/migrations/*.sql; never assume a migration in the repo is live.
---

Migration files under `supabase/migrations/` are **not** automatically applied. There is
no migration runner, and several files in the repo have never been run against the live
Supabase project. A `.sql` file existing in the repo is not evidence the schema exists.

**Why:** A crash reported as "missing RPC function" turned out to be an unapplied
migration, not a code bug. The obvious "fix" (delete the RPC call, write the table
directly) would have targeted a table that also did not exist — turning a loud failure
into a silent one that discards user data on every write.

**How to apply:** Before editing code that depends on a Supabase table, column, RPC, or
policy, probe the live project over PostgREST and trust the probe over the file:

- Missing function -> `PGRST202`; missing table -> `PGRST205`; missing column -> `42703`.
- `curl "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=<col>&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`
- For RPCs, `POST /rest/v1/rpc/<fn>`.

**Applying DDL:** `DATABASE_URL` in this workspace points at a Replit-managed Postgres,
**not** Supabase, so `psql`/Drizzle cannot reach the Supabase project. The Supabase
connector proxies PostgREST only, which cannot run DDL. DDL must be pasted into the
Supabase SQL editor by hand, in filename order.

**Entitlement caveat:** `profiles.active_bot` / `allocated_capital` gate paid strategies,
so they are deliberately withheld from the client's column grants and written only via
the `set_active_bot()` security-definer function. Never "fix" a deploy failure by making
those columns client-writable, and never fake success in the UI when the write fails —
both re-open the paywall bypass the migrations were written to close.
