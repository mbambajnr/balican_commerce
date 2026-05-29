#!/usr/bin/env bash
# =============================================================================
# Silent Star Limited — Production Deploy Script
# =============================================================================
# Usage:
#   ./scripts/deploy.sh                    # Deploy using .env (default)
#   ./scripts/deploy.sh /path/to/.env      # Deploy with custom env file
#
# This script:
#   1. Pulls the latest code from the repository
#   2. Copies the env file
#   3. Builds and starts all Docker services
#   4. Runs database migrations
#   5. Verifies health
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${1:-.env}"

echo "========================================"
echo " Silent Star Limited — Deploy"
echo "========================================"

# 1. Validate env file
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file '$ENV_FILE' not found."
  echo "Copy .env.production.example to .env and fill in your values."
  exit 1
fi

# 2. Pull latest code (if in a git repo)
if [ -d .git ]; then
  echo ""
  echo "[2/5] Pulling latest code..."
  git pull
else
  echo "[2/5] Skipping git pull (not a git repository)"
fi

# 3. Build and start services
echo ""
echo "[3/5] Building and starting Docker services..."
docker compose --env-file "$ENV_FILE" build
docker compose --env-file "$ENV_FILE" up -d

# 4. Wait for backend to be ready
echo ""
echo "[4/5] Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:4000/api/health > /dev/null 2>&1; then
    echo "  Backend is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  WARNING: Backend did not respond within 30 seconds."
    echo "  Check logs: docker compose logs backend"
  fi
  sleep 2
done

# 5. Run database migrations
echo ""
echo "[5/5] Running database migrations..."
docker compose --env-file "$ENV_FILE" run --rm backend node dist/src/config/migrate.js

echo ""
echo "========================================"
echo " Deploy complete!"
echo ""
echo " Verify at: https://$(grep ^DOMAIN "$ENV_FILE" | cut -d= -f2 | tr -d ' ')"
echo " Health:    https://$(grep ^DOMAIN "$ENV_FILE" | cut -d= -f2 | tr -d ' ')/api/health"
echo "========================================"
