---
name: react-query notifications are async in tests
description: Why UI assertions right after fireEvent miss react-query cache updates, and the fix.
---

React Query v5 batches cache notifications through `setTimeout` by default, so `setQueryData` updates don't reach components synchronously. Tests that assert immediately after `fireEvent` see stale UI.

**Why:** Hit while adapting the mobile AutoPilot screen tests to API-backed data — all mutation-driven assertions failed until the scheduler was made synchronous.

**How to apply:** In jsdom tests using react-query, call `notifyManager.setScheduler((cb) => cb())` at module top (or use `await screen.findByText`).
