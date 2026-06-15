#!/usr/bin/env bash
# Balican Limited — restore an encrypted or plaintext custom-format backup.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup.dump[.enc]> [target_database]" >&2
  exit 1
fi

backup_file="$1"
target_database="${2:-${POSTGRES_DB:-sslplan}}"
postgres_user="${POSTGRES_USER:-sslplan}"
force="${RESTORE_FORCE:-false}"

if [ ! -f "$backup_file" ]; then
  echo "ERROR: Backup file not found: $backup_file" >&2
  exit 1
fi

if [ -f "$backup_file.sha256" ]; then
  (
    cd "$(dirname "$backup_file")"
    shasum -a 256 -c "$(basename "$backup_file").sha256"
  )
fi

restore_file="$backup_file"
temporary_file=""
cleanup() {
  [ -z "$temporary_file" ] || rm -f "$temporary_file"
}
trap cleanup EXIT

case "$backup_file" in
  *.enc)
    : "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required to decrypt this backup}"
    temporary_file="$(mktemp "${TMPDIR:-/tmp}/balican-restore.XXXXXX.dump")"
    openssl enc -d -aes-256-cbc -pbkdf2 \
      -pass env:BACKUP_ENCRYPTION_KEY \
      -in "$backup_file" \
      -out "$temporary_file"
    restore_file="$temporary_file"
    ;;
esac

if [ "$target_database" = "${POSTGRES_DB:-sslplan}" ] && [ "$force" != "true" ]; then
  echo "ERROR: Set RESTORE_FORCE=true to restore over the primary database." >&2
  exit 1
fi

docker compose exec -T postgres dropdb -U "$postgres_user" --if-exists "$target_database"
docker compose exec -T postgres createdb -U "$postgres_user" "$target_database"
cat "$restore_file" | docker compose exec -T postgres pg_restore \
  -U "$postgres_user" \
  -d "$target_database" \
  --no-owner \
  --no-acl \
  --exit-on-error

echo "Restore complete: $target_database"
