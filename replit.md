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
- **Database Rules:** Always use Drizzle ORM for PostgreSQL. Do NOT use Prisma, TypeORM, Supabase SDKs, or raw SQL strings unless specifically requested. 
- **Conflict Resolution:** If a requested feature conflicts with this established tech stack, pause immediately, point out the discrepancy, and ask for clarification before writing any code.
- **Repository Separation:** Whenever modifying files inside `/website`, always stage and push changes strictly to `https://github.com/descendant-jpg/trediqsai-Trading-website.git`. Whenever modifying files inside `/app`, always stage and push changes strictly to `https://github.com/descendant-jpg/trediqsai-Trading-app.git`. Never mix commits between the two repositories.

## Gotchas

- **Always run typechecks:** Run `pnpm run typecheck` after modifying API contracts or DB schemas to prevent silent breaking changes across packages.
- **Codegen syncing:** If the OpenAPI spec changes, always execute `pnpm --filter @workspace/api-spec run codegen` before continuing frontend development.
- **Database syncing:** If you alter the Drizzle database schema, explicitly remind me to run `pnpm --filter @workspace/db run push`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details