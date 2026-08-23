# TradiQs AI

A high-end, gamified trading terminal mobile app with a simulated trading floor, AI signals, and a leaderboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run push:website` — stage, commit, and push the website repository
- `pnpm run push:app` — stage, commit, and push the application repository
- `pnpm run push:all` — push both repositories sequentially
- Required env: `DATABASE_URL` — Postgres connection string
- Website admin area env: `ADMIN_PASSWORD` (shared admin sign-in password) and `SESSION_SECRET` (signs the admin session cookie). Without both, `/admin` stays locked. Optional `ADMIN_SESSION_MAX_HOURS` caps how long one sign-in can be extended for (default 24h); rotating `SESSION_SECRET` signs everyone out immediately.
- App SQL lives in `app/artifacts/tradiqsai/supabase/migrations/` and is **applied by hand** in the Supabase SQL editor (there is no migration runner, and `DATABASE_URL` points at Replit Postgres, not Supabase). `supabase/APPLY_TO_SUPABASE.sql` bundles the pending files in order and is safe to re-run. Until it is applied, AutoPilot deployment fails loudly and `GET /api/health/autopilot` lists the missing files, and the Profile payout card stays locked because its evaluation RPCs do not exist yet.
- **Payouts pay real money, so they are computed from a verified trade ledger, not from `profiles.balance`.** Authenticated users can write their own `trades` rows through PostgREST, and the P&L trigger settles those client-chosen prices into the balance — anything derived from it is forgeable. Only trades stamped `price_source = 'SERVER'` (opened and closed through `open_server_trade` / `close_server_trade`, which price themselves from the service-role-owned `market_prices` table) count toward payout profit, drawdown, and active days. The API server refreshes that price every 45s; the Supabase drawdown-monitor cron does the same upsert. If no fresh price exists, verified trades pause and payouts stay locked rather than trusting a client price.
- Website SQL lives in `website/supabase/migrations/` and is applied by hand against the Supabase project (there is no migration runner). Apply new files in order. Rate limits degrade to per-process counting (which resets on restart) until their migration is applied: `002_admin_login_attempts.sql` for admin sign-in, `003_rate_limit_counters.sql` for the public waitlist form.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `/website` — independent Git repository for the trediqsai.com landing page.
- `/app` — independent Git repository containing the core application monorepo.
- `/app/artifacts` — application artifacts, including the Expo client and API server.
- `/app/lib` — shared API, database, and generated client libraries.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences & Agent Instructions

**CRITICAL RULES FOR REPLIT AGENT: DO NOT IGNORE.**

- **Scope & Platform Separation:** This is a pnpm workspace project. Before generating or modifying code, verify whether you are working in the backend API server (`@workspace/api-server`), the database package (`@workspace/db`), or the frontend mobile app. 
- **No Cross-Contamination:** Never mix React Native/Expo components (`<View>`, `<Text>`) into the Express server environment. Never use web HTML elements (`<div>`, `<span>`) in the mobile app.
- **Cost-Saving & Execution:** Do NOT explain the code step-by-step unless explicitly asked. Output only the necessary code blocks. Before implementing complex features or generating large amounts of code, outline a brief 3-point plan and wait for my approval.
- **Execution Preference:** Proceed with implementation whenever I provide a concrete prompt; do not pause for separate approval unless a required decision is genuinely ambiguous or destructive.
- **Database Rules:** Always use Drizzle ORM for PostgreSQL. Do NOT use Prisma, TypeORM, Supabase SDKs, or raw SQL strings unless specifically requested. 
- **Conflict Resolution:** If a requested feature conflicts with this established tech stack, pause immediately, point out the discrepancy, and ask for clarification before writing any code.
- **Repository Separation:** Whenever modifying files inside `/website`, always stage and push changes strictly to `https://github.com/descendant-jpg/trediqsai-Trading-website.git`. Whenever modifying files inside `/app`, always stage and push changes strictly to `https://github.com/descendant-jpg/trediqsai-Trading-app.git`. Never mix commits between the two repositories.

## Gotchas

- **Always run typechecks:** Run `pnpm run typecheck` after modifying API contracts or DB schemas to prevent silent breaking changes across packages.
- **Codegen syncing:** If the OpenAPI spec changes, always execute `pnpm --filter @workspace/api-spec run codegen` before continuing frontend development.
- **Database syncing:** If you alter the Drizzle database schema, explicitly remind me to run `pnpm --filter @workspace/db run push`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details