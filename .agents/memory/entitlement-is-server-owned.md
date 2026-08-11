---
name: Paid entitlement must be server-owned
description: Why paid-tier state and anything gated on it can never be client-writable, and the layered guard that enforces it.
---

# Paid entitlement is server-owned

Anything that decides whether a user gets a paid feature must be written only
by the server. The client runs on the user's own device, so whatever it is
allowed to write, it can be made to write. A UI lock (blurred card, PRO badge,
`isSubscribed` check) is decoration — the request underneath it can be
replayed directly against the database or API.

**Why:** this project shipped with the profile table writable via the public
anon key, so a user could raise their own tier and unlock paid features free.

## What counts as an entitlement column

Not just the tier column. **Any column whose value selects a gated thing is
itself a paid feature.** A column naming the user's deployed strategy is an
entitlement decision when some strategies are premium: leaving it writable
recreates the bypass even after the tier column is locked down.

The test is: *can a forged value buy the user something?* Cosmetic and
self-reported fields (display name, push token, play-money balance,
gamification rank) can stay client-writable; anything gating paid access
cannot.

**How to apply:** let clients change gated columns only through a
`security definer` function that re-checks entitlement, and keep the
premium/free catalogue in a table that function reads, so the check cannot
drift from a list hardcoded in the client.

## One column, not two

Two entitlement columns on one table is a security problem, not untidiness.
Locking down the canonical one while a legacy duplicate survives in the
declarative schema still ships a second paid-access field that older code
reads and a future grant could expose.

**How to apply:** migrate values into the canonical column and drop the old
one in the same migration, then fix the declarative schema so fresh deploys
never recreate it. Grep for the old name afterwards, and check each hit's
*table* — an unrelated table may legitimately reuse the name for a different
concept.

## The two layers

Postgres RLS has **no column scoping**, so "may edit their profile but not
their tier" cannot be expressed as a policy alone:

1. **RLS policies** decide which *rows* a user reaches.
2. **Column privileges** (`REVOKE ALL`, then `GRANT UPDATE (col, ...)`) decide
   which *columns* they may write — this is what stops the escalation, and it
   rejects the write before any policy or app code runs.

A blanket `for all` policy defeats this: it lets a client write every column.
The service role bypasses RLS, so billing webhooks and admin tooling still
work.

**Keep the grant list in step with the client's actual writes.** Omitting a
column the app legitimately writes breaks that flow without improving
security — enumerate the client's writes before finalising the list.

## Locking writes must not lock out signup

Removing the client INSERT policy is correct (an insert with attacker-chosen
column values is a self-grant), but it leaves new users unable to create a
profile at all. Replace it with a trigger on user creation that inserts the
row as the definer and hardcodes the free tier — never copy tier from signup
metadata, which the client controls. Backfill existing users in the same
migration, or accounts created before the trigger are stranded.

Server-owned also means admin UIs cannot write the column with the anon key.
Route operator changes through an authenticated server endpoint using the
service role, validating the submitted value against an allow-list.

## Check at use time, and do not cache the answer

Validating entitlement only when a feature is switched on leaves a user who
later lapses running it forever. Re-check on **every** read and state change,
and revoke at the source (a trigger on the tier fields) so it holds no matter
which code path performs the downgrade.

Two traps:

- **Partial coverage.** Gate the check on the *request*, not on which resource
  it names. Guarding only requests that target a premium resource lets a user
  advance premium state by touching a free one, and can reject a request to
  *stop* the premium feature before revocation runs. Always allow switching
  something off.
- **Caching authorization.** A per-process TTL cache keeps authorizing a user
  whose subscription just ended, and the process performing the downgrade
  (webhook, admin route) cannot invalidate it. Prefer a fresh lookup per
  request; if that ever costs too much, use a shared cache the downgrade path
  can invalidate, never a local TTL.

**Trigger gotcha:** in a `BEFORE UPDATE`, re-querying the table returns the
*pre-update* row, so a downgrade check reads the old tier and never fires.
Evaluate the incoming `NEW` values instead — keep the entitlement rule in a
pure predicate function taking the fields as arguments, so the lookup and
trigger paths share one definition.

## Fail closed

An entitlement check that cannot determine the answer — anonymous caller,
missing credentials, lookup error — must **deny**. A check that falls open
turns a provider outage into free access for everyone.

## The schema is a contract, and it drifts

A hosted database and the repo's migrations disagreed about which entitlement
columns existed, so an environment built from the migrations came up missing
the columns the server selects and *every* paid check failed closed.

**How to apply:** assert the exact columns a server-side check selects in a
test that exercises the real query (stub the HTTP call, not the lookup
function). Injecting a fake lookup tests the policy but never the query, so a
rename passes CI and fails in production. In migrations against a drifted
table, grant privileges dynamically from `information_schema.columns`: naming
a column that does not exist aborts the migration and silently leaves the
table unprotected.

## Verifying a lockdown safely

Never probe entitlement policies by mutating live user rows. Recreate the
table's column shape on a scratch Postgres, stub the auth-uid function with a
settable config value, `SET LOCAL ROLE` to the client role, and run the
escalation attempts there. Assert both directions: escalation denied *and*
ordinary edits still succeed. (`perform` is PL/pgSQL-only — use `select` in
plain SQL scripts.)
