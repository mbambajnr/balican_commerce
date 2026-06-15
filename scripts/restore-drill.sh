#!/usr/bin/env bash
# Create a fresh backup, restore it into an isolated database, and verify it.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

drill_dir="$(mktemp -d "${TMPDIR:-/tmp}/balican-drill.XXXXXX")"
drill_database="balican_restore_drill_$(date +%s)"
postgres_user="${POSTGRES_USER:-sslplan}"

cleanup() {
  docker compose exec -T postgres dropdb -U "$postgres_user" --if-exists "$drill_database" >/dev/null 2>&1 || true
  rm -rf "$drill_dir"
}
trap cleanup EXIT

./scripts/backup-db.sh "$drill_dir"
backup_file="$(find "$drill_dir" -type f \( -name "*.dump" -o -name "*.dump.enc" \) | head -1)"

./scripts/restore-db.sh "$backup_file" "$drill_database"

migration_count="$(docker compose exec -T postgres psql -U "$postgres_user" -d "$drill_database" -Atc \
  "SELECT COUNT(*) FROM schema_migrations;")"
user_table="$(docker compose exec -T postgres psql -U "$postgres_user" -d "$drill_database" -Atc \
  "SELECT to_regclass('public.users') IS NOT NULL;")"

if [ "$migration_count" -lt 35 ] || [ "$user_table" != "t" ]; then
  echo "ERROR: Restore verification failed (migrations=$migration_count, users_table=$user_table)." >&2
  exit 1
fi

echo "Restore drill passed: migrations=$migration_count, users_table=$user_table"
