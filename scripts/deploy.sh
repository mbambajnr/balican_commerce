#!/usr/bin/env bash
# Balican Limited — release-tagged deploy with backup, health gates, and rollback.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env}"
STATE_DIR=".deploy"
ROLLBACK_FILE="$STATE_DIR/previous-release.env"
ROLLBACK_AVAILABLE=false
DEPLOY_STARTED=false

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Environment file '$ENV_FILE' not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required for production deploys}"
: "${BACKUP_RCLONE_REMOTE:?BACKUP_RCLONE_REMOTE is required for production deploys}"
: "${SENTRY_DSN:?SENTRY_DSN is required for production deploys}"
: "${METRICS_TOKEN:?METRICS_TOKEN is required for production deploys}"
: "${S3_BUCKET:?S3_BUCKET is required for production deploys}"
: "${S3_REGION:?S3_REGION is required for production deploys}"

mkdir -p "$STATE_DIR" backups

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

tag_running_image() {
  local service="$1"
  local target_tag="$2"
  local container_id image_id
  container_id="$(compose ps -q "$service")"
  [ -n "$container_id" ] || return 1
  image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  docker tag "$image_id" "$target_tag"
}

rollback() {
  if [ "$ROLLBACK_AVAILABLE" != "true" ]; then
    echo "No previous application images are available for automatic rollback." >&2
    return 1
  fi

  echo "Deployment failed; restoring previous application images..."
  # shellcheck disable=SC1090
  source "$ROLLBACK_FILE"
  BACKEND_IMAGE="$ROLLBACK_BACKEND_IMAGE" \
  FRONTEND_IMAGE="$ROLLBACK_FRONTEND_IMAGE" \
  APP_RELEASE="$ROLLBACK_RELEASE" \
    compose up -d --no-build backend frontend caddy

  for attempt in $(seq 1 30); do
    if compose exec -T backend \
      node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      echo "Automatic application rollback succeeded."
      return 0
    fi
    sleep 2
  done

  echo "CRITICAL: Automatic rollback did not become healthy." >&2
  return 1
}

on_error() {
  local exit_code=$?
  trap - ERR
  if [ "$DEPLOY_STARTED" = "true" ]; then
    rollback || true
  fi
  exit "$exit_code"
}
trap on_error ERR

echo "========================================"
echo " Balican Limited — Production Deploy"
echo "========================================"

if [ -d .git ]; then
  echo "[1/8] Pulling target revision..."
  git pull --ff-only
fi

release="$(git rev-parse --short=12 HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)"
timestamp="$(date -u +%Y%m%d_%H%M%S)"
backend_image="balican-backend:$release"
frontend_image="balican-frontend:$release"

echo "[2/8] Ensuring PostgreSQL is available..."
compose up -d postgres

echo "[3/8] Creating encrypted off-site database backup..."
ENV_FILE="$ENV_FILE" NODE_ENV=production ./scripts/backup-db.sh ./backups

echo "[4/8] Preserving current application images..."
rollback_backend="balican-backend:rollback-$timestamp"
rollback_frontend="balican-frontend:rollback-$timestamp"
if tag_running_image backend "$rollback_backend" && tag_running_image frontend "$rollback_frontend"; then
  previous_release="$(compose exec -T backend printenv APP_RELEASE 2>/dev/null || echo unknown)"
  cat > "$ROLLBACK_FILE" <<EOF
ROLLBACK_BACKEND_IMAGE=$rollback_backend
ROLLBACK_FRONTEND_IMAGE=$rollback_frontend
ROLLBACK_RELEASE=$previous_release
EOF
  chmod 600 "$ROLLBACK_FILE"
  ROLLBACK_AVAILABLE=true
else
  echo "No running application release found; treating this as an initial deploy."
fi

echo "[5/8] Building immutable release images..."
APP_RELEASE="$release" BACKEND_IMAGE="$backend_image" FRONTEND_IMAGE="$frontend_image" compose build

DEPLOY_STARTED=true
echo "[6/8] Applying canonical migrations..."
APP_RELEASE="$release" BACKEND_IMAGE="$backend_image" \
  compose run --rm backend node dist/src/config/migrate-all.js

echo "[7/8] Starting release $release..."
APP_RELEASE="$release" BACKEND_IMAGE="$backend_image" FRONTEND_IMAGE="$frontend_image" \
  compose up -d --no-build

echo "[8/8] Running release health gates..."
for attempt in $(seq 1 30); do
  if APP_RELEASE="$release" BACKEND_IMAGE="$backend_image" FRONTEND_IMAGE="$frontend_image" \
    compose exec -T backend \
      node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1 \
    && APP_RELEASE="$release" BACKEND_IMAGE="$backend_image" FRONTEND_IMAGE="$frontend_image" \
      compose exec -T frontend \
      node -e "fetch('http://127.0.0.1:3000/auth/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "ERROR: Release health gates failed." >&2
    false
  fi
  sleep 2
done

cat > "$STATE_DIR/last-successful.env" <<EOF
APP_RELEASE=$release
BACKEND_IMAGE=$backend_image
FRONTEND_IMAGE=$frontend_image
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 600 "$STATE_DIR/last-successful.env"

DEPLOY_STARTED=false
trap - ERR
echo "Deploy complete: release $release"
