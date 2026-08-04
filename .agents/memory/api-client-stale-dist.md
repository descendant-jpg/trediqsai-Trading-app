---
name: Stale API client declarations
description: Phantom "no exported member" TS errors from @workspace/api-client-react come from stale dist/ declarations, not missing code.
---
The mobile app's tsconfig uses project references to `lib/api-client-react`, so TypeScript resolves the lib's **emitted declarations in `dist/`**, not `src/`.

**Why:** After OpenAPI codegen (orval) updates `src/generated`, the `dist/*.d.ts` files stay stale unless the lib is rebuilt, producing TS2305 "has no exported member" errors even though the source exports exist.

**How to apply:** After regenerating the API client (or seeing phantom missing-export errors), run `npx tsc --build --force lib/api-client-react` (or root `pnpm run typecheck`, which runs `tsc --build`) before trusting artifact typechecks.
