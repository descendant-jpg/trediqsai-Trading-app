---
name: API server test isolation and the in-memory db fake
description: How autopilot/API route tests stay hermetic, and the drizzle eq() mock pitfall
---

The autopilot api-server tests now mock `@workspace/db` with an in-memory fake (`vi.doMock` inside `startFreshApp`); other route tests may still touch the real `DATABASE_URL` Postgres.

**Why:** Routes that persist state load from the db at module import; a real-db approach forced per-test wipes plus settle delays for fire-and-forget writes and 503'd when tables were missing. The hermetic fake avoids all of that.

**How to apply:**
- Keep the fake's row maps in the test-setup function's scope: they survive `vi.resetModules()` within a test (simulating a server restart) but reset per test.
- Pitfall: extracting the bound value from drizzle `eq(fakeColumn, value)` — with a plain-object fake column the value appears as the only **raw string chunk** in `queryChunks`; value-bearing `{value}` chunks are just empty StringChunks. A broken extractor silently returns `[]` from `where()`, which most tests can't distinguish from defaults.
- Prefer making async writes awaitable from the endpoint that logically depends on them (store the promise, `await` it in the handler) so tests are deterministic through the API.
- In a fresh environment, still run `pnpm --filter @workspace/db run push-force` for routes/tests that use the real db.
