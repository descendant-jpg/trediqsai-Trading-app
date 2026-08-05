---
name: Dev DB schema drift after task merges
description: Merged task agents can change the drizzle schema without the dev database being migrated; how to detect and fix.
---

Rule: after task merges that touch `lib/db/src/schema/`, check API workflow logs for `Failed query` 500s — the dev database may still have the pre-merge table shape.

**Why:** parallel task agents change the schema in code, but the shared dev Postgres isn't migrated automatically; the reconciliation script didn't run `drizzle-kit push`. Also, `pnpm run push` (lib/db) dies in non-TTY shells when drizzle prompts about column renames.

**How to apply:** compare `psql "$DATABASE_URL" -c '\d <table>'` against the schema file. If the drifted tables hold only simulated/dev data, `DROP TABLE` them and re-run `pnpm run push` (from `lib/db`) — with the tables gone there are no interactive prompts. Never do this for tables with real user data; resolve renames explicitly instead.
