---
name: Expo artifact dependencies
description: Workspace placement rule for dependencies imported by the Expo artifact.
---

Dependencies imported by `app/artifacts/tradiqsai` must be declared and installed in that artifact workspace, not only at the repository root.

**Why:** Metro resolves the Expo artifact’s dependency graph. A root-only package such as `expo-device` can cause the web bundle to fail with an opaque 500 and white preview.

**How to apply:** After adding an Expo import, verify the artifact package manifest and `app/pnpm-lock.yaml`, then restart Expo with a cleared cache.