---
name: pnpm workspace root is app/
description: Where to run installs in this repo, and why repo-root installs silently do the wrong thing.
---

The pnpm workspace root is `app/` (that is where `pnpm-workspace.yaml` lives), not the repository root. Install artifact dependencies from within the artifact directory — for Expo packages prefer `pnpm exec expo install <pkg>` there, so the Expo-compatible version is chosen.

**Why:** The repository root has its own unrelated `package.json`. Running an install from there resolves against the wrong root: it adds the dependency to the root manifest and writes a `package-lock.json` while the Expo artifact still cannot resolve the package, so the app keeps failing for a reason the install output does not mention. Running `pnpm install` from the repo root can also fail outright on catalog entries (`ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`), which looks like a broken lockfile but is really a wrong-root error.

**How to apply:** Verify the dependency landed by confirming the artifact's own `node_modules/<pkg>` symlink exists and that `require.resolve` from the artifact directory resolves inside `app/node_modules/.pnpm/...`. If a stray root `package.json` / `package-lock.json` change appears afterward, revert it — the repo root is not a package manager surface here.
