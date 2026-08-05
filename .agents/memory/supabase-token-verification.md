---
name: Supabase token verification on the API server
description: How the API server verifies caller identity without a JWT secret
---
The API server verifies bearer tokens by calling Supabase `GET /auth/v1/user` with the publishable key (env: EXPO_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY), with a short in-memory cache.

**Why:** No SUPABASE_JWT_SECRET is available, and this approach is signing-algorithm-agnostic (works for HS256 and asymmetric keys) — local JWT verification would break silently if the project's signing keys rotate.

**How to apply:** For any new per-user server state, reuse the `identity()` middleware (injectable verifier for tests); no token → shared "anonymous" identity, invalid token → 401. Never mint identities from unverified tokens.
