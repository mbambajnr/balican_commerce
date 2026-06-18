# Deployment Checklist — Bali-Can Limited B2B Platform

> Use this checklist for every production deployment.
> Complete each step in order. Check off when verified.

---

## 0. Pre-Flight

- [ ] **Git repository initialized**: Run `git init && git add -A && git commit -m "release baseline"`
      before deployment. Tag the release: `git tag v1.0.0`.
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
| `METRICS_TOKEN` | **Yes** | At least 32 characters; protects internal metrics |
| `FRONTEND_URL` | **Yes** | Production frontend URL (e.g. `https://sslplan.com`) |
| `ADMIN_SECRET_KEY` | Initial setup | `openssl rand -hex 16`; admin registration is disabled when unset |
| `UPLOAD_STORAGE_DRIVER` | **Yes** | Must be `s3` in production |
| `S3_BUCKET` / `S3_REGION` | **Yes** | S3-compatible object storage |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Conditional | Set both, or neither when using an IAM/workload role |
| `PUBLIC_UPLOAD_BASE_URL` | **Yes** | HTTPS public/CDN prefix for `public/*` |
| `BACKUP_ENCRYPTION_KEY` | **Yes** | Stored outside the server and repository |
| `BACKUP_RCLONE_REMOTE` | **Yes** | Versioned off-site backup destination |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | **Yes** | `openssl rand -base64 32` — session encryption |
| `AUTH_URL` | **Yes** | Production canonical URL (e.g. `https://sslplan.com`) |
| `NEXT_PUBLIC_API_URL` | **Yes** | Backend API URL (e.g. `https://api.sslplan.com/api`) |

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

- [ ] All migrations ran without errors
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

---

## 6. First Admin Creation

1. Ensure `ADMIN_SECRET_KEY` is set in backend `.env`
2. Visit `https://sslplan.com/admin/register`
3. Enter: email, password, and the admin secret key
4. Submit → Admin account created with role `'admin'`
5. Log in at `https://sslplan.com/admin/login`

- [ ] Admin account created successfully
- [ ] Admin can access `/admin` dashboard

---

## 7. Post-Deploy Smoke Test

Run the **LAUNCH_SMOKE_TEST.md** checklist against the production deployment.
At minimum verify:

- [ ] Health check returns 200
- [ ] Public product listing loads
- [ ] User registration works
- [ ] Admin login works
- [ ] Company registration works
- [ ] Admin can approve a company
- [ ] Cart and checkout function
- [ ] Quick order by SKU works
- [ ] RFQ → Quotation → Order flow works
- [ ] Paystack webhook processes successfully (use test card: `4084 0840 8408 4084`, any CVV, any future date)

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
- [ ] Monthly restore drill passed and evidence recorded
- [ ] Previous build artifacts accessible (or tagged in git)
- [ ] Automatic rollback tested in staging by forcing a health-gate failure

---

## 9. Monitoring & Alerts

- [ ] Backend logs: Ensure stdout/stderr are captured by your process manager (systemd, PM2, Docker)
- [ ] Health check endpoint monitored (expect 200, JSON with `status: "ok"`)
- [ ] Sentry receives a controlled test exception tagged with `APP_RELEASE`
- [ ] Prometheus scrapes `/internal/metrics` with `METRICS_TOKEN`
- [ ] Alerts cover readiness, 5xx rate, p95 latency, memory, and restart loops
- [ ] Paystack webhook failures: Monitor `email_logs` and `orders` for unprocessed webhooks
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
