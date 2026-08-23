---
name: Expo/API port conflicts and blank previews
description: Why the mobile preview goes blank or the API server fails to boot in this repl, and how to check it.
---

Each artifact owns a fixed local port declared in its `.replit-artifact/artifact.toml`. A stray dev server started by hand (or by an old root `run =` command) that binds one of those ports will make the owning workflow fail with `EADDRINUSE`, or make the preview look blank/white even though the bundler reports success.

**Why:** the root `run` command and the managed artifact workflows are independent. A leftover process from a previous `run` command keeps its port after the command is changed, so the symptom shows up long after the change that caused it.

**How to apply:** when a preview is blank or a workflow reports `EADDRINUSE`, list node processes and see which one holds the artifact's port before touching any code. Kill the squatter, restart the workflow, then re-check. Do not change the app's host/port settings first — that usually is not the cause.

Related: any `.tsx` file placed directly in the Expo app's routes directory is treated as a route and must have a default export. Shared modals and helper components belong in the components directory; leaving one in routes produces a "missing the required default export" warning at runtime.
