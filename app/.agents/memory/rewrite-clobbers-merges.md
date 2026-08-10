---
name: Full-file rewrites clobber task-agent merges
description: Check git log on a file before rewriting it wholesale in this repo
---
Task agents merge into main constantly, often touching the same screens I'm editing.

**Why:** A wholesale WriteFile of a screen silently deleted a feature a task agent had just merged into that file (a settings entry + modal wiring). Typecheck/tests stayed green, so only a review caught it.

**How to apply:** Before overwriting an entire file, run `git log --oneline -3 -- <file>`; if a merge touched it since I last read it, re-read and preserve the merged code (or use targeted edits instead of rewrites).
