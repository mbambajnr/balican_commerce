#!/usr/bin/env bash
# =============================================================================
# Silent Star Limited — Database Restore
# =============================================================================
# Usage:
#   ./scripts/restore-db.sh backups/sslplan_db_20260101_120000.sql.gz
#
# Restores a PostgreSQL database from a compressed SQL dump.
# Drops and recreates the database before restoring.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -1 ./backups/sslplan_db_*.sql.gz 2>/dev/null || echo "  (no backups found)"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "========================================"
echo " Restoring PostgreSQL database"
echo "========================================"
echo "Backup: $BACKUP_FILE"
echo ""
echo "WARNING: This will DROP and recreate the sslplan database."
echo "Press Ctrl+C to cancel, or ENTER to continue."
read -r

echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | docker compose exec -T postgres psql -U sslplan -d sslplan

echo "Done."
