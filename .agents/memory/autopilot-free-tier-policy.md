---
name: AutoPilot free-tier policy and concurrency enforcement
description: Product decision on free AutoPilot access and the rule that entitlement limits must be enforced in shared storage, not process memory.
---

# AutoPilot free-tier policy and concurrency enforcement

**Policy decision (product owner, 2026-08-25, supersedes 2026-08-21):** AutoPilot and the Oracle AI are fully Pro-locked in the client — free/Starter users see the AI Tools AutoPilot widget (including the roster's "Scalp Oracle AI" bot) under a paywall curtain: forced off, zeroed logs/P&L, all switches/pills/configure disabled, "Ask AI Oracle" converts to the paywall. NOTE the tension: the API server may still permit one free bot slot from the older 2026-08-21 policy — the client lock is now stricter than the server. Unresolved tiers (no profile row, failed lookup) fail closed with 403 on the server — never treat an unknown tier as free. (Client keeps a deliberate `accessTier ?? 'elite'` fallback so controls don't freeze while the context initializes; the server remains the authority.)

**Why:** The app UI long implied "free gets 1 bot" while the API rejected all free AutoPilot activity; the owner chose to relax the server to match the UI rather than tighten the client. On review, the in-memory enforcement turned out to be bypassable under horizontal scaling (two instances each see zero running bots and both start one).

**How to apply:**
- Entitlement *limits* (counts, caps) must be claimed atomically in Postgres — the AutoPilot bot slot uses `pg_advisory_xact_lock(hashtext(userId))` around count-and-claim. In-memory checks are UX fast-paths and repair-only, never the authoritative guard.
- When syncing lazily-persisted rows before an atomic claim, use insert-if-missing (`onConflictDoNothing`), never upsert — an upsert can clobber a flag a concurrent instance just claimed.
- The whole AutoPilot engine (simulation, P&L accrual, in-memory per-user state with throttled persistence) is single-process by design; horizontal scaling breaks more than the bot limit (e.g. double P&L accrual) and would need a broader redesign.
