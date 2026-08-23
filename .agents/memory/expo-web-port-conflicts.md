---
name: Expo/API port conflicts and blank previews
description: Why the mobile preview goes blank or the API server fails to boot in this repl, and how to check it.
---

Each artifact owns a fixed local port declared in its `.replit-artifact/artifact.toml`. A stray dev server started by hand (or by an old root `run =` command) that binds one of those ports will make the owning workflow fail with `EADDRINUSE`, or make the preview look blank/white even though the bundler reports success.

**Why:** the root `run` command and the managed artifact workflows are independent. A leftover process from a previous `run` command keeps its port after the command is changed, so the symptom shows up long after the change that caused it.

**How to apply:** when a preview is blank or a workflow reports `EADDRINUSE`, list node processes and see which one holds the artifact's port before touching any code. Kill the squatter, restart the workflow, then re-check. Do not change the app's host/port settings first — that usually is not the cause.

Repeat offender: the `routing-release/` directory has its own registered workflows that boot duplicate copies of the same apps on the same ports (18130 Expo, 8080 API). After any restart cascade they can win the port race; the real Expo workflow then freezes on an interactive "Use port N instead? (Y/n)" prompt and serves nothing (white screen), and the real API dies with EADDRINUSE. Detect via `readlink /proc/<pid>/cwd` — kill every process whose cwd starts with `routing-release`, then restart the real workflows.

Related: any `.tsx` file placed directly in the Expo app's routes directory is treated as a route and must have a default export. Shared modals and helper components belong in the components directory; leaving one in routes produces a "missing the required default export" warning at runtime.
