---
name: Signals backend invariants
description: Publisher lease/deadline/CAS pattern and the fail-closed quota-unlock ordering for the Signals engine — constraints future edits must preserve.
---

# Signals backend invariants

Two design constraints in the signals backend are load-bearing and easy to
break in well-meaning refactors. Both were architect-mandated.

## 1. Publisher cycles must never overlap — three cooperating mechanisms

- **Distributed lease** via the existing `rate_limit_consume` RPC (scope
  `signal_publisher_lease`): the lease window (60s) must stay **strictly
  shorter** than the publish interval (90s). A fixed-window counter grants
  once per window, so a window longer than the interval silently halves the
  cadence.
- **Absolute cycle deadline** (45s) created per granted cycle and threaded
  through every I/O call (quotes, PostgREST, Anthropic, Expo push) via
  `withDeadline()`; both the transition and top-up loops also check
  `signal.aborted`. The deadline must stay shorter than the lease window so a
  cycle can never outlive its lease. Timers are unref'd or test runners hang.
- **CAS transitions**: PATCHes pin `status=in.(Active,Pending)` AND
  `take_profits=eq.<exact envelope as read>`. jsonb equality is key-order
  insensitive, so this covers Active→Active TP progressions, not just closes.
  Notifications only send when the CAS lands.
- In-process guard (`cycleInFlight`) is set **synchronously, before any
  await** — setting it after an awaited lease lets same-tick calls both pass.

**Why:** concurrent cycles double-fire TP/close pushes and over-create
signals past category targets; lease-expired writers are the hard case.
**How to apply:** any change to the publisher's timing, IO, or notification
flow must keep all four properties and their tests.

## 2. Free-signal unlock is consume-first, never mark-first

Daily quota (`signal_daily`) is consumed via the atomic RPC **before** the
permanent `signal_view` marker is written. Mark-first is a paywall bypass:
the marker is publicly observable before the charge commits, so a concurrent
request reads premium data for free in the rollback window.

**Why:** no transactional DDL is available from the workspace (SQL editor
only), so a single atomic "check-limit + mark" RPC can't be created here.
**How to apply:** the accepted residual edge is quota *loss* (same-signal
race double-charge, or a lost slot when the marker write fails after
charging) — never disclosure. If a transactional unlock RPC is ever added
via the Supabase SQL editor, replace the two-step flow and delete this note.
