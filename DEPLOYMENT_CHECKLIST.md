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
- [ ] Elasticsearch is accessible (or disabled)

---

## 1. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | **Yes** | Set to `production` |
| `PORT` | No | Default `4000` |
| `DATABASE_URL` | **Yes** | Full PostgreSQL connection string with `sslmode=require` for production |
| `JWT_SECRET` | **Yes** | `openssl rand -hex 32` — do NOT reuse the dev default |
| `JWT_EXPIRES_IN` | No | Default `7d` |
| `PAYSTACK_SECRET_KEY` | **Yes** | Live Paystack secret key (starts with `sk_live_`) |
| `PAYSTACK_PUBLIC_KEY` | **Yes** | Live Paystack public key (starts with `pk_live_`) |
| `PAYSTACK_WEBHOOK_SECRET` | **Yes** | Paystack webhook secret for HMAC verification |
| `RESEND_API_KEY` | Optional | For transactional emails |
| `FRONTEND_URL` | **Yes** | Production frontend URL (e.g. `https://sslplan.com`) |
| `ELASTICSEARCH_URL` | Optional | Production ES endpoint |
| `ADMIN_SECRET_KEY` | **Yes** | `openssl rand -hex 16` — used for first admin registration |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | **Yes** | `openssl rand -base64 32` — session encryption |
| `AUTH_URL` | **Yes** | Production canonical URL (e.g. `https://sslplan.com`) |
| `NEXT_PUBLIC_API_URL` | **Yes** | Backend API URL (e.g. `https://api.sslplan.com/api`) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | **Yes** | Live Paystack public key |

- [ ] All variables set
- [ ] Secrets are NOT committed to version control
- [ ] `.env` is in `.gitignore`

---

## 2. Database Migrations

Run in this exact order (scripts are in `backend/package.json`):

```bash
cd backend

# 1. Core schema
npm run migrate

# 2. Credit/payment columns
npm run migrate-credits

# 3. Extended booking columns
npm run migrate:bookings

# 4. Email logs table
npm run migrate:email-logs

# 5. B2B payment tables (bank_transfers, order_payments)
npm run migrate:b2b-payments

# 6. Quotations
npm run migrate:quotations

# 7. Invoices
npm run migrate:invoices

# 8. Order types (service orders)
npm run migrate:order-types

# 9. Concurrency hardening (unique constraints, check constraints)
npm run migrate:concurrency

# 10. B2B companies + customer groups + custom pricing
npm run migrate:companies

# 11. B2B enhancements (carts, store credit, shipping, variants, quick orders)
npm run migrate:b2b-enhancements

# 12. Elasticsearch index
npm run migrate:es

# 13. Product catalog seed (categories + products — SKIP if using own data)
npm run migrate:catalog
```

- [ ] All migrations ran without errors
- [ ] Each migration is idempotent — safe to re-run if one fails
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
- [ ] Frontend starts and loads at the production URL
- [ ] Frontend can reach backend API

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
3. **Preferred approach**: Restore the database from a pre-deployment backup

### Application rollback
```bash
# Backend: re-deploy the previous build
git checkout <previous-tag>
cd backend && npm run build && npm start

# Frontend: re-deploy the previous build
cd frontend && git checkout <previous-tag> && npm run build && npm start
```

### Backup commands
```bash
# Database dump
pg_dump "postgresql://user:pass@host:5432/sslplan" > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql "postgresql://user:pass@host:5432/sslplan" < backup_file.sql
```

- [ ] Database backup strategy documented
- [ ] Previous build artifacts accessible (or tagged in git)
- [ ] Rollback tested in staging

---

## 9. Monitoring & Alerts

- [ ] Backend logs: Ensure stdout/stderr are captured by your process manager (systemd, PM2, Docker)
- [ ] Health check endpoint monitored (expect 200, JSON with `status: "ok"`)
- [ ] Paystack webhook failures: Monitor `email_logs` and `orders` for unprocessed webhooks
- [ ] Database connection pool: Watch for connection exhaustion
- [ ] Elasticsearch: Verify indexing if ES is enabled

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
