#!/usr/bin/env bash
# =============================================================================
# Silent Star Limited — Production Migration Runner
# =============================================================================
# Usage:
#   ./scripts/migrate-prod.sh                    # Run with default .env
#   ./scripts/migrate-prod.sh /path/to/.env      # Custom env file
#
# Runs all database migrations against the production database.
# Safe to run idempotently — all migrations use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file '$ENV_FILE' not found."
  echo "Copy .env.production.example to .env and fill in your values."
  exit 1
fi

echo "========================================"
echo " Running production migrations..."
echo "========================================"

# Run the main migration
echo "[1/1] Main migration..."
docker compose --env-file "$ENV_FILE" run --rm backend node dist/src/config/migrate.js

echo ""
echo "========================================"
echo " Migrations complete."
echo "========================================"
