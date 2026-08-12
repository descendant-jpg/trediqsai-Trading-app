---
name: Applied migrations are immutable; fix forward
description: Why editing an already-shipped migration silently skips live databases, and how text-based schema tests must resolve the final definition.
---

# Applied migrations are immutable; fix forward

Once a migration file has been applied anywhere, editing it in place is a
no-op for every database that already recorded it. The correction must ship as
a new, higher-numbered file.

**Why:** a security fix to payout guardrails was made by editing the migration
that first introduced them. Local text-based tests passed and the repo looked
correct, but any project that had already run that file would never rerun it —
so the vulnerable function definitions would have stayed live indefinitely.
The repo and the deployed schema would disagree with nothing to signal it.

**How to apply:** treat a migration as frozen the moment it could have been
applied. Put `create or replace function` / `create index if not exists`
corrections in the next sequential file, make them idempotent, and state in a
header comment what defect is being replaced and why it could not be edited in
place. Only repeat the objects being changed — not the whole prior migration.
If the project also keeps a concatenated "paste this into the SQL editor"
bundle, append the new file there too, in the same order.

## Text-based schema tests must resolve the *final* definition

A test that reads one hardcoded migration file asserts what that file says,
not what a migrated database ends up running. After a fix-forward, such a test
keeps passing against the superseded definition.

**How to apply:** load all migrations in filename order and resolve each
function from the **last** file that defines it — that is the definition that
survives. Worth also asserting that the corrected text lives in a file ordered
*after* the original, which is what actually catches an in-place edit.
