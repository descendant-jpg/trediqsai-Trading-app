---
name: yahoo-finance2 cannot consume AbortSignal
description: yahoo-finance2@4 owns its HTTP client and exposes no fetchOptions/signal — caller-side cancellation needs Promise.race plus an in-flight cap so hung requests can't accumulate.
---

yahoo-finance2@4's module options carry no `fetchOptions`/`signal` field (verified in its dist type defs). A `Promise.race` against a deadline stops the *caller* from waiting, but the underlying request keeps running.

**Why:** In a deadline-bounded publisher loop (45s cycle deadline / 60s lease), a hung Yahoo call would orphan a socket every cycle, eventually exhausting resources while logs look clean.

**How to apply:** Wrap the client call in Promise.race for awaiting, AND cap concurrent in-flight calls to the library (e.g. MAX 4, decrement in `finally`); when saturated, throw so the instrument is skipped fail-closed. Treat sustained saturation as an operational signal (degraded fallback coverage), not an error to retry. Architect-reviewed as the sound bounded mitigation; if Yahoo availability becomes material, swap in an adapter with true abortable HTTP.
