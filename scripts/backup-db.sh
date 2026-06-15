#!/usr/bin/env bash
# Balican Limited — encrypted PostgreSQL backup with optional off-site upload.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BACKUP_DIR="${1:-./backups}"
ENV_FILE="${ENV_FILE:-.env}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${POSTGRES_USER:=sslplan}"
: "${POSTGRES_DB:=sslplan}"

mkdir -p "$BACKUP_DIR"
umask 077

timestamp="$(date -u +"%Y%m%d_%H%M%S")"
plain_file="$BACKUP_DIR/balican_${POSTGRES_DB}_${timestamp}.dump"
final_file="$plain_file"

cleanup() {
  rm -f "$plain_file"
}
trap cleanup EXIT

echo "Creating PostgreSQL backup..."
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-acl \
  > "$plain_file"

if [ ! -s "$plain_file" ]; then
  echo "ERROR: pg_dump produced an empty backup." >&2
  exit 1
fi

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  final_file="$plain_file.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -in "$plain_file" \
    -out "$final_file"
  rm -f "$plain_file"
elif [ "${NODE_ENV:-development}" = "production" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY is required in production." >&2
  exit 1
fi

(
  cd "$(dirname "$final_file")"
  shasum -a 256 "$(basename "$final_file")" > "$(basename "$final_file").sha256"
)

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "ERROR: BACKUP_RCLONE_REMOTE is set but rclone is not installed." >&2
    exit 1
  fi
  remote="${BACKUP_RCLONE_REMOTE%/}"
  rclone copyto "$final_file" "$remote/$(basename "$final_file")"
  rclone copyto "$final_file.sha256" "$remote/$(basename "$final_file.sha256")"
  echo "Off-site copy uploaded to $remote"
fi

find "$BACKUP_DIR" -type f \
  \( -name "balican_*.dump" -o -name "balican_*.dump.enc" -o -name "balican_*.sha256" \) \
  -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete

trap - EXIT
echo "Backup complete: $final_file"
