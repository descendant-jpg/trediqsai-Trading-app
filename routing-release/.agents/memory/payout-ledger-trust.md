---
name: Play-money balances cannot back real payouts
description: Why a "server-computed" balance is still forgeable when clients can write trades, and the verified-ledger pattern that fixes it.
---

# Play-money balances cannot back real payouts

When simulated trading becomes the basis for a **real** cash payout, the
simulator's balance stops being cosmetic and becomes a money-moving field. It
must be re-derived from inputs the user cannot choose.

**Why:** this project computed a prop-firm payout (profit split, monthly cap,
drawdown rules) from the profile balance. The balance was updated by a
`security definer` trigger, which *looked* server-owned — but the trigger's
input was a trade row the client inserted, including the entry and close
price. A subscriber could open and close fabricated trades at chosen prices,
manufacture profit, satisfy the "N active trading days" rule with the same
rows, and request a real payout. Every individual guard (RLS, definer
trigger, cap RPC, advisory lock) was correct; the ledger underneath was not.

**How to apply:** trace each payout input back to who last chose the number.
"A trigger computed it" is not provenance — ask what the trigger read.

## The verified-ledger pattern

1. A price table only the service role writes, refreshed on a timer from an
   external feed, with a freshness window.
2. `security definer` open/close RPCs that take **no price argument** and read
   the price themselves.
3. A provenance column on the trade, stamped by the P&L trigger from a
   transaction-local flag (`set_config('...', 'on', true)`) that only those
   RPCs set. PostgREST runs each request in its own transaction and cannot set
   it, so a direct insert is always stamped untrusted.
4. Payout maths filters on that column. Client-priced trades still work for
   the simulator; they simply cannot pay.

Provenance must **downgrade only**. If closing through the RPC could upgrade a
client-opened trade, the attacker just opens cheap and closes through the
guarded path.

Watch the inverse too: any *trusted* server path that closes trades (e.g. a
liquidation routine) must set the flag, or verified **losses** silently drop
out of the ledger and drawdown rules stop biting.

## Fallbacks re-open what the guard closed

A client fallback of "try the guarded RPC, else do the plain insert" is only
safe for errors meaning *the guarded path is unavailable* (function missing,
no fresh price). If the RPC ran and **refused** — blown account, failed
check — falling back walks straight around the rule just enforced.
Distinguish by error code; default to propagating the refusal.

## Settlement and reservation are part of the ledger

An evaluation "active day" is not a trade-creation day. Credit it only from a
verified trade's server-assigned settlement timestamp (`closed_at`), and
require that the trade is closed. Otherwise a trader can farm the minimum-day
rule with tiny open positions that have never faced a real outcome.

**How to apply:** filter active-day calculations by verified provenance,
`CLOSED` status, non-null settlement time, and the evaluation period measured
from that settlement time—not the client-visible creation time.

A monthly payout cap alone also does not stop a repeat request from spending
the same profit twice. Given earned split `E`, monthly cap `C`, and prior
reservations `R`, the only safe next amount is `max(0, min(E, C) - R)`.

**Why:** `min(E, C - R)` subtracts reservations only from the cap. When `E` is
below the cap, a replay can reserve the same earned value again until it fills
the cap.

**How to apply:** serialize a user's request attempts with a transaction-
scoped advisory lock (which also covers the no-prior-row case), re-read the
ledger under that lock, and then insert one reservation. A UI debounce is
usability only; the database is the fraud boundary.
