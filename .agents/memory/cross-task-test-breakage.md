---
name: Cross-task test breakage blocks completion
description: Full-suite validation fails on pre-existing breakage from parallel task merges; fix minimally in-place.
---
Task-completion validation runs the whole workspace test suite, so a test file left incompatible by two parallel merges (e.g. tests written for a local-state screen after it went server-backed) blocks *any* task from completing.

**Why:** parallel task agents merge independently; a test and its subject can land from different branches.
**How to apply:** when validation fails outside your task's files, `git stash` to confirm the failure pre-exists, then repair the test harness minimally (stateful mock mirroring the server route) rather than rewriting the feature or skipping validation.
