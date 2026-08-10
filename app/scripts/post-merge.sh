#!/bin/bash
set -e
# --no-frozen-lockfile: task merges can rename/add workspace packages, which
# legitimately drifts pnpm-lock.yaml; a frozen install then hard-fails.
pnpm install --no-frozen-lockfile
pnpm --filter db push
