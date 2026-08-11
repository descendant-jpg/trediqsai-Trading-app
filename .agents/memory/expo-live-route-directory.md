---
name: Which directory Expo Router actually serves
description: How to prove which copy of a duplicated route file is live, instead of arguing from directory names.
---

In a monorepo where routes appear to exist in two plausible places, do not infer which one is live from directory naming (a folder called `artifacts` can still be the real app, and a top-level `app/` folder can be inert). Determine it empirically.

**Why:** Duplicated route files are byte-identical, so reading them proves nothing, and a passing typecheck proves nothing either — `tsc` will happily check files that the bundler never reads. Editing the dead copy produces a silent no-op: the change looks applied, the app is unchanged, and the resulting confusion can persist across sessions and get asserted as fact.

**How to apply:** Append a unique marker comment to each copy, request the web entry bundle from the running Metro server, and grep the response for each marker — exactly one will appear, and Metro also names the absolute path of the file it read. Remove the markers afterward and confirm the copies match again. Corroborating signals: only the real Expo project has `app.json`, `metro.config.js`, and a `main` of `expo-router/entry` in its `package.json`; Metro roots at that project's directory (`getDefaultConfig(__dirname)`).

Note that Metro caches aggressively: after reverting an experiment, restart the workflow before re-testing or you will read a stale error from the previous file contents.

A route file in the live directory cannot simply re-export an implementation stored outside the Expo project — module resolution for `expo-router`, `@expo/vector-icons`, and similar packages fails from outside the project, because pnpm links them only into that project's `node_modules`.
