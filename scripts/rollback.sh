#!/usr/bin/env bash
# Restore the application images preserved by the most recent deploy.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env}"
ROLLBACK_FILE=".deploy/previous-release.env"

if [ ! -f "$ENV_FILE" ] || [ ! -f "$ROLLBACK_FILE" ]; then
  echo "ERROR: Environment or rollback state file is missing." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ROLLBACK_FILE"

BACKEND_IMAGE="$ROLLBACK_BACKEND_IMAGE" \
FRONTEND_IMAGE="$ROLLBACK_FRONTEND_IMAGE" \
APP_RELEASE="$ROLLBACK_RELEASE" \
  docker compose --env-file "$ENV_FILE" up -d --no-build backend frontend caddy

echo "Rollback started: release $ROLLBACK_RELEASE"
