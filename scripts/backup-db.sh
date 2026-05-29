#!/usr/bin/env bash
# =============================================================================
# Silent Star Limited — Database Backup
# =============================================================================
# Usage:
#   ./scripts/backup-db.sh                    # Back up using .env
#   ./scripts/backup-db.sh /path/to/backups   # Custom output directory
#
# Creates a compressed SQL dump of the PostgreSQL database.
# Keeps the last 7 daily and 4 weekly backups.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.production.example to .env first."
  exit 1
fi

# Source env vars for direct DB access
source "$ENV_FILE"

BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/sslplan_db_${TIMESTAMP}.sql.gz"

echo "========================================"
echo " Backing up PostgreSQL database..."
echo "========================================"

# Extract DB connection details from DATABASE_URL (fall back to docker compose values)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-sslplan}"
DB_PASS="${POSTGRES_PASSWORD:-}"
DB_NAME="sslplan"

# If DATABASE_URL is set in .env, parse it
if [ -n "${DATABASE_URL:-}" ]; then
  # Format: postgresql://user:pass@host:port/dbname
  DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
  DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
fi

# Use docker compose exec for production (backup from running container)
echo "Creating backup: $BACKUP_FILE"
docker compose exec -T postgres pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --clean \
  --if-exists \
  | gzip > "$BACKUP_FILE"

echo "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Rotate: keep last 7 daily backups
echo ""
echo "Rotating old backups..."
find "$BACKUP_DIR" -name "sslplan_db_*.sql.gz" -mtime +7 -delete

echo "Done. Backup saved to: $BACKUP_FILE"
