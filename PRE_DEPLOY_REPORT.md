# Pre-Deploy Verification Report

Date: 2026-06-17
Branch: `feature/scout-marketplace-category-sourcing`
Latest pushed implementation commit before this sweep: `5f46b40 Add verification fees and commission ledger`

## Summary

| Check | Result | Evidence / Notes |
| --- | --- | --- |
| Backend typecheck | PASS | `cd backend && npm run typecheck` exited `0`. |
| Backend build | PASS | `cd backend && npm run build` exited `0`. |
| Backend full test suite | PASS with serial runner | Full suite passed with `npx jest --runInBand --forceExit --detectOpenHandles`: `51` suites, `811` tests. The default parallel `npm test` run previously crashed with process exit `139` in this workspace, without a Jest assertion failure. |
| Frontend production build | PASS | `cd frontend && npm run build` exited `0`; route output included `/admin/commissions` and `/provider/commissions`. Static generation logged the known sandbox `fetch failed` / `EPERM` message but completed successfully. |
| Fresh database migrations | PASS | Built current backend Docker image and ran canonical runner in Docker Compose against disposable DB `sslplan_predeploy`; all `37` migrations applied. |
| Migration idempotency | PASS | Re-ran the same canonical runner against `sslplan_predeploy`; all `37` migrations skipped and runner exited `0`. |
| Disposable DB cleanup | PASS | Dropped `sslplan_predeploy` after the rehearsal. |
| Production env examples | PASS with one fix | Root `.env.production.example`, backend production example, and frontend production example are aligned with Compose/runtime expectations. Fixed duplicate `FRONTEND_URL` entry in `backend/.env.example`. |

## Commands Run

```bash
cd backend && npm run build
cd backend && npm run typecheck
cd backend && npx jest --runInBand --forceExit --detectOpenHandles
cd frontend && npm run build
docker compose up -d postgres
docker compose exec -T postgres dropdb -U sslplan --if-exists sslplan_predeploy
docker compose exec -T postgres createdb -U sslplan sslplan_predeploy
docker compose build backend
docker compose run --rm --no-deps \
  -e NODE_ENV=development \
  -e DATABASE_URL=postgresql://sslplan:sslplan_prod@postgres:5432/sslplan_predeploy \
  backend node dist/src/config/migrate-all.js
docker compose run --rm --no-deps \
  -e NODE_ENV=development \
  -e DATABASE_URL=postgresql://sslplan:sslplan_prod@postgres:5432/sslplan_predeploy \
  backend node dist/src/config/migrate-all.js
docker compose exec -T postgres dropdb -U sslplan --if-exists sslplan_predeploy
```

## Migration Rehearsal

The canonical runner in `backend/src/config/migrate-all.ts` currently contains `37` ordered PostgreSQL migrations:

- Clean run: PASS, ending with `All 37 database migrations are applied.`
- Idempotency run: PASS, each migration reported as `SKIP`, ending with `All 37 database migrations are applied.`

The original prompt and older audit text still reference `35` migrations. That number is historical. The current production-ready count is `37` after:

- `migrate-verification-fees.js`
- `migrate-commissions.js`

## Environment / Deployment Drift Review

### Checklist Required Variables vs Backend Production Validation

Validated by backend production startup in `backend/src/config/index.ts`:

| Variable | Status |
| --- | --- |
| `DATABASE_URL` | Validated as PostgreSQL connection string |
| `JWT_SECRET` | Validated as unique/strong enough |
| `PAYSTACK_SECRET_KEY` | Required |
| `PAYMENT_CURRENCY` | Must be `GHS` |
| `RESEND_API_KEY` | Required |
| `RESEND_FROM_EMAIL` | Required |
| `ALERT_WEBHOOK_URL` | Required HTTPS URL |
| `FRONTEND_URL` | Required HTTPS URL |
| `UPLOAD_STORAGE_DRIVER` | Must be `s3` in production |
| `S3_BUCKET` | Required for S3 storage |
| `S3_REGION` | Required for S3 storage |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Validated as an all-or-none pair |
| `PUBLIC_UPLOAD_BASE_URL` | Required HTTPS URL |
| `SENTRY_DSN` | Required HTTPS URL |
| `METRICS_TOKEN` | Required, minimum 32 characters |

Checklist variables intentionally not validated by backend startup:

| Variable | Reason |
| --- | --- |
| `NODE_ENV` | It controls whether production validation runs; deployment/Compose sets it to `production`. |
| `PORT` | Optional runtime listener port with default `4000`. |
| `JWT_EXPIRES_IN` | Optional duration with default `1h`. |
| `PAYSTACK_WEBHOOK_SECRET` | Optional; webhook verification falls back to `PAYSTACK_SECRET_KEY`. |
| Product search | PostgreSQL full-text and trigram indexes are installed by the canonical migration runner. |
| `ADMIN_SECRET_KEY` | Initial setup secret; admin registration is disabled when unset. |
| `BACKUP_ENCRYPTION_KEY` | Validated by backup scripts, not backend app startup. |
| `BACKUP_RCLONE_REMOTE` | Validated/used by backup scripts, not backend app startup. |
| `AUTH_SECRET` | Frontend/Auth.js variable, not backend app startup. |
| `AUTH_URL` | Frontend/Auth.js variable, not backend app startup. |
| `NEXT_PUBLIC_API_URL` | Frontend build/runtime variable, not backend app startup. |

Backend validation variables missing from the deployment checklist: none found.

### Env Example Review

| File | Result | Notes |
| --- | --- | --- |
| `.env.production.example` | PASS | Covers Compose-level production inputs, including frontend, backend, S3, monitoring, and backup variables. |
| `backend/.env.production.example` | PASS | Service-specific backend production documentation matches the variables consumed by Docker Compose/backend startup. |
| `frontend/.env.production.example` | PASS | Documents frontend production build/runtime inputs. |
| `backend/.env.example` | FIXED | Removed duplicate `FRONTEND_URL` and folded Merchant Center/PDF link usage into the canonical `FRONTEND_URL` comment. |

## Fixes Applied

1. Updated `backend/.env.example` to remove a duplicate `FRONTEND_URL` definition.
2. Added this `PRE_DEPLOY_REPORT.md`.

## Residual Notes

- Docker Compose emitted warnings about unset `JWT_SECRET` and `AUTH_SECRET` while running one-off local verification commands. These warnings came from Compose variable interpolation; the migration runner was explicitly run with `NODE_ENV=development` against a disposable DB and did not start production services.
- Docker Compose also reported old orphan containers: `sslplan-es-1` and `sslplan-db-1`. They did not affect the migration rehearsal, which used `sslplan-postgres-1`.
- The default parallel backend test script should be monitored. The full suite passes serially, but the parallel `npm test` process exited `139` once in this workspace, likely from local worker/resource pressure.

## Go / No-Go

Recommendation: **GO for the next launch-readiness task**, with the caveat that CI or release automation should prefer a stable worker configuration if parallel Jest continues to crash on constrained hosts.
