#!/bin/bash
# Runs automatically after a task is merged. Keep it idempotent, non-interactive, and fast.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# /app — pnpm workspace containing the Expo client, API server, and shared libs.
if [ -f "$ROOT/app/pnpm-workspace.yaml" ]; then
  echo "==> Installing /app workspace dependencies"
  (cd "$ROOT/app" && pnpm install --frozen-lockfile=false)
fi

# /website — standalone Next.js repository with its own npm lockfile.
if [ -f "$ROOT/website/package.json" ]; then
  echo "==> Installing /website dependencies"
  (cd "$ROOT/website" && npm install --no-audit --no-fund)
fi

echo "==> Post-merge setup complete"
