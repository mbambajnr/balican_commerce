# Deployment Checklist — Bali-Can Limited B2B Platform

> Use this checklist for every production deployment.
> Complete each step in order. Check off when verified.

---

## 0. Pre-Flight

- [ ] Release commit is pushed to GitHub and reviewed; create an immutable release tag.
- [ ] All backend tests pass: `cd backend && npm test`
- [ ] Backend TypeScript compiles: `cd backend && npm run build`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] `.env` files configured for production (see Step 2)
- [ ] Database is accessible from the server
- [ ] PostgreSQL has the `pg_trgm` extension available

---

## 1. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | **Yes** | Set to `production` |
| `PORT` | No | Default `4000` |
| `DATABASE_URL` | **Yes** | Full PostgreSQL connection string with `sslmode=require` for production |
| `JWT_SECRET` | **Yes** | `openssl rand -hex 32` — do NOT reuse the dev default |
| `JWT_EXPIRES_IN` | No | Default `1h` |
| `PAYSTACK_SECRET_KEY` | **Yes** | Live Paystack secret key (starts with `sk_live_`) |
| `PAYSTACK_WEBHOOK_SECRET` | Optional | Dedicated webhook HMAC secret; falls back to `PAYSTACK_SECRET_KEY` |
| `PAYMENT_CURRENCY` | **Yes** | Must be `GHS`; production startup rejects other values |
| `RESEND_API_KEY` | **Yes** | Transactional email delivery |
| `RESEND_FROM_EMAIL` | **Yes** | Verified transactional sender |
| `ALERT_WEBHOOK_URL` | **Yes** | HTTPS receiver for critical operational alerts |
| `SENTRY_DSN` | **Yes** | Centralized exception aggregation |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Default `0.05` |
| `APP_RELEASE` | **Yes** | Immutable release tag or git SHA |
| `METRICS_TOKEN` | **Yes** | At least 32 characters; protects internal metrics |
| `BACKUP_STATUS_FILE` | **Yes** | Successful-backup marker mounted read-only into the app |
| `FRONTEND_URL` | **Yes** | Production frontend URL (e.g. `https://sslplan.com`) |
| `ADMIN_SECRET_KEY` | Initial setup | `openssl rand -hex 16`; admin registration is disabled when unset |
| `UPLOAD_STORAGE_DRIVER` | **Yes** | Must be `s3` in production |
| `S3_BUCKET` / `S3_REGION` | **Yes** | S3-compatible object storage |
| `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | Conditional | Required when the provider is not AWS-compatible by default |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Conditional | Set both, or neither when using an IAM/workload role |
| `PUBLIC_UPLOAD_BASE_URL` | **Yes** | HTTPS public/CDN prefix for `public/*` |
| `S3_SIGNED_URL_EXPIRES_SECONDS` | No | Default `60`; private verification-document URL lifetime |
| `BACKUP_ENCRYPTION_KEY` | **Yes** | Stored outside the server and repository |
| `BACKUP_RCLONE_REMOTE` | **Yes** | Versioned off-site backup destination |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | **Yes** | `openssl rand -base64 32` — session encryption |
| `AUTH_URL` | **Yes** | Production canonical URL (e.g. `https://sslplan.com`) |
| `NEXT_PUBLIC_API_URL` | **Yes** | Backend API URL (e.g. `https://api.sslplan.com/api`) |
| `BACKEND_API_URL` | **Yes** | Server-only API URL used by Auth.js and the authenticated proxy |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | **Yes** | Live Ghana Paystack public key (`pk_live_...`) |
| `NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `NEXT_PUBLIC_META_PIXEL_ID` | Optional | Consent-gated analytics IDs |

- [ ] All variables set
- [ ] Secrets are NOT committed to version control
- [ ] `.env` is in `.gitignore`

---

## 2. Database Migrations

Run the tracked PostgreSQL migration runner:

```bash
cd backend
npm run migrate

```

- [ ] All 39 migrations ran without errors
- [ ] `schema_migrations` contains the full migration history
- [ ] A second `npm run migrate` reports all migrations as skipped
- [ ] Customer groups are seeded (Standard, Silver, Gold, Platinum)
- [ ] Shipping methods are seeded (Standard, Express, Same-Day)
- [ ] Option types are seeded (Color, Size, Wattage, Voltage)

---

## 3. Build

```bash
# Backend
cd backend && npm run build
# Output: backend/dist/

# Frontend
cd frontend && npm run build
# Output: frontend/.next/
```

- [ ] Backend build succeeds (`npm run build`)
- [ ] Frontend build succeeds (`npm run build`)

---

## 4. Start

> **TLS / HTTPS is required in production.** Do not expose the backend or frontend
> directly to the internet without TLS termination. Use one of:
> - **Reverse proxy** (recommended): Nginx or Caddy in front of both services, handles
>   TLS termination, static file serving, and request forwarding.
> - **Platform-managed TLS**: If deploying on Vercel (frontend), Railway/Render (backend),
>   TLS is handled automatically.
> - **Self-managed**: Use `certbot` + Let's Encrypt for the reverse proxy.

### Backend

```bash
cd backend
NODE_ENV=production npm start
# Or: node dist/src/index.js
```

Health check: `GET https://api.sslplan.com/api/health`
Expected: `{ "status": "ok", "timestamp": "..." }`

### Frontend

```bash
cd frontend
npm start
# Or: npx next start -p 3000
```

- [ ] TLS termination is configured (reverse proxy or platform-managed)
- [ ] Backend starts and responds to health check
- [ ] `GET /api/ready` returns `200` with database, schema, and storage checks `ok`
- [ ] Responses include an `X-Request-ID` header
- [ ] A controlled test alert reaches the configured incident channel
- [ ] Frontend starts and loads at the production URL
- [ ] Frontend can reach backend API
- [ ] S3 readiness check is `ok`
- [ ] Existing local uploads migrated with `npm run migrate:uploads-s3`
- [ ] Private documents produce short-lived signed downloads

---

## 5. Webhook Setup

1. Go to [Paystack Dashboard → Settings → Webhooks](https://dashboard.paystack.com/#/settings/developer)
2. Add URL: `https://api.sslplan.com/api/orders/paystack-webhook`
3. Copy the **Webhook Secret** and set it as `PAYSTACK_WEBHOOK_SECRET` in backend `.env`
4. Events to send: `charge.success` (at minimum)

- [ ] Webhook URL configured in Paystack dashboard
- [ ] Webhook secret copied to `.env`
- [ ] Test webhook: Paystack dashboard has a "Send Test Webhook" button
- [ ] Webhook endpoint handles both order settlement and Balican Verified fee settlement
- [ ] Complete the GH₵10 live-card procedure in `PAYSTACK_GO_LIVE.md`

---

## 6. First Admin Creation

1. Ensure `ADMIN_SECRET_KEY` is set in backend `.env`
2. Visit `https://sslplan.com/admin/register`
3. Enter: email, password, and the admin secret key
4. Submit → Admin account created with role `'admin'`
5. Log in at `https://sslplan.com/admin/login`

- [ ] Admin account created successfully
- [ ] Admin can access `/admin` dashboard

### Launch revenue configuration

- [ ] In `/super-admin/plans`, set the Balican Verified fee, renewal period, and grace period
- [ ] In `/super-admin/plans`, set the global commission rate and any category overrides
- [ ] In `/super-admin/companies/[id]`, grant audited 365-day fee waivers to approved first-cohort suppliers
- [ ] Confirm an unpaid, non-waived verification submission cannot enter the review queue
- [ ] Confirm a completed marketplace order creates exactly one commission ledger entry

### Scheduled jobs

- [ ] Run `npm --workspace backend run reminders:opportunities` hourly
- [ ] Call authenticated `POST /api/super-admin/verification/expire-lapsed` daily
- [ ] Confirm the scheduler records failures and alerts operators

---

## 7. Post-Deploy Smoke Test

Run the **LAUNCH_SMOKE_TEST.md** checklist against the production deployment.
At minimum verify:

```bash
BASE_URL=https://sslplan.com \
API_BASE_URL=https://api.sslplan.com \
SMOKE_STRICT_READY=true \
node scripts/smoke-test.mjs
```

- [ ] Health check returns 200
- [ ] Public product listing loads
- [ ] User registration works
- [ ] Admin login works
- [ ] Company registration works
- [ ] Admin can approve a company
- [ ] Cart and checkout function
- [ ] Quick order by SKU works
- [ ] RFQ → Quotation → Order flow works
- [ ] Paid/waived supplier verification → admin review → Balican Verified badge works
- [ ] Completed deal appears in supplier/admin commission views and CSV export
- [ ] Paystack webhook processes the documented GH₵10 live transaction successfully

---

## 8. Rollback Plan

### Database rollback
Migrations are forward-only. To roll back:
1. Identify which migration(s) caused the issue
2. Run compensating `DROP TABLE` / `ALTER TABLE` SQL manually OR restore from backup
3. **Preferred approach**: Restore the encrypted pre-deployment backup after
   verifying its checksum in a separate database

### Application rollback
```bash
./scripts/rollback.sh .env
```

Normal deployments use `./scripts/deploy.sh .env`. It automatically preserves
the running images and invokes the same rollback path if migration/startup
health gates fail.

### Backup commands
```bash
# Encrypted backup, checksum, retention, and configured off-site upload
NODE_ENV=production ./scripts/backup-db.sh ./backups

# Isolated restore verification
./scripts/restore-drill.sh

# Approved primary-database restore
RESTORE_FORCE=true ./scripts/restore-db.sh ./backups/balican_sslplan_<timestamp>.dump.enc sslplan
```

- [ ] `BACKUP_ENCRYPTION_KEY` stored outside the server and repository
- [ ] `BACKUP_RCLONE_REMOTE` points to versioned off-site storage
- [ ] Latest encrypted backup and checksum exist off-site
- [ ] Quarterly restore drill passed and evidence recorded
- [ ] Previous build artifacts accessible (or tagged in git)
- [ ] Automatic rollback tested in staging by forcing a health-gate failure

---

## 9. Monitoring & Alerts

- [ ] Backend logs: Ensure stdout/stderr are captured by your process manager (systemd, PM2, Docker)
- [ ] Readiness endpoint `/api/ready` monitored (expect 200, JSON with `status: "ready"`)
- [ ] Sentry receives a controlled test exception tagged with `APP_RELEASE`
- [ ] Prometheus scrapes `/internal/metrics` with `METRICS_TOKEN`
- [ ] Alerts and Prometheus queries in `SLO.md` are configured and exercised
- [ ] Paystack webhook outcomes and mismatches appear in `balican_payment_webhook_events_total`
- [ ] Backup age is below 26 hours in `balican_backup_age_seconds`
- [ ] Database connection pool: Watch for connection exhaustion
- [ ] Product search: Verify exact, partial, and misspelled product queries

---

## 10. Go/No-Go Decision

| Criteria | Met? | Notes |
|----------|------|-------|
| All tests pass | — | |
| All migrations ran cleanly | — | |
| Build succeeds (backend + frontend) | — | |
| Health check returns 200 | — | |
| Smoke tests pass | — | |
| Balican Verified fee and renewal configured | — | |
| Global/category commission rates configured | — | |
| First-cohort waivers recorded | — | |
| Webhook configured and tested | — | |
| Admin account created | — | |
| Rollback plan documented | — | |

**Decision:** [ ] GO — [ ] NO-GO (list blockers below)

**Blocker notes:**

---

## Deployment Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineer | | | |
| CTO | | | |
| Product Owner | | | |
