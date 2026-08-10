---
name: Stale API client declarations
description: Phantom "no exported member" TS errors from @workspace/api-client-react come from stale dist/ declarations, not missing code.
---
The mobile app's tsconfig uses project references to `lib/api-client-react`, so TypeScript resolves the lib's **emitted declarations in `dist/`**, not `src/`.

**Why:** After OpenAPI codegen (orval) updates `src/generated`, the `dist/*.d.ts` files stay stale unless the lib is rebuilt, producing TS2305 "has no exported member" errors even though the source exports exist.

**How to apply:** The api-spec `codegen` script now force-rebuilds `lib/api-client-react` and `lib/api-zod`, and root `typecheck:libs` uses `tsc --build --force`. If phantom missing-export errors still appear, run root `pnpm run typecheck` before trusting artifact typechecks.
