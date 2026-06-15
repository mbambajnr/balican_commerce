# Balican Limited Pre-Deploy Report

**Date:** 2026-06-13
**Scope:** `CODEX_PROMPTS.md` Master Task 1
**Decision:** **PASS**

## Gate Results

| Check | Result | Evidence |
|---|---|---|
| Backend TypeScript/build | PASS | `npm run build` completed successfully |
| Backend full test suite | PASS | 49/49 suites, 802/802 tests |
| Frontend TypeScript | PASS | `npx tsc --noEmit` completed successfully |
| Frontend production build | PASS | Next.js compiled and generated 83/83 static pages |
| Fresh database migration | PASS | All 35 tracked migrations applied |
| Migration idempotency | PASS | Second run skipped all 35 migrations |
| Migration ledger | PASS | `schema_migrations` contained exactly 35 entries |
| Disposable database cleanup | PASS | Temporary database count returned `0` after cleanup |
| Currency audit | PASS | No runtime NGN, naira, `₦`, or `CurrencyNgn` references remain |
| Production config/documentation parity | PASS | Runtime checks, Docker, env templates, and deployment checklist aligned |

The frontend build logged one non-fatal `fetch failed`/`EPERM` message while
prerendering in the restricted local environment. Next.js completed the build,
generated all 83 static pages, and exited successfully.

## GHS Hardening

1. Added `PAYMENT_CURRENCY`, with `GHS` as the only production-supported value.
2. Production startup now fails when `PAYMENT_CURRENCY` is absent or not `GHS`.
3. Paystack initialization explicitly sends the configured currency.
4. Paystack webhook settlement now requires:
   - an exact integer amount match in pesewas;
   - an explicit currency field;
   - currency equal to configured `GHS`.
5. Missing currency, wrong currency, underpayment, and duplicate delivery are covered by tests.
6. Payment mismatch alerts and audit metadata now record configured and received currencies without silently defaulting missing webhook data.
7. Naira-specific UI icons were replaced with neutral `Coins` icons.

## Configuration Reconciliation

- `PAYSTACK_SECRET_KEY` is required in production because the backend initializes payments and verifies webhook signatures.
- `PAYSTACK_WEBHOOK_SECRET` is optional and falls back to `PAYSTACK_SECRET_KEY`.
- Removed unused backend/frontend Paystack public-key requirements; the application uses Paystack's server-side redirect initialization.
- `ADMIN_SECRET_KEY` is documented as an initial-setup control because admin registration is disabled when it is absent.
- S3 static credentials are documented as a pair, or may both be omitted when an IAM/workload role is used.
- Added `PAYMENT_CURRENCY=GHS` to:
  - `.env.production.example`
  - `backend/.env.example`
  - `backend/.env.production.example`
  - `docker-compose.yml`
  - `DEPLOYMENT_CHECKLIST.md`

## Test Reliability Fixes

- Updated valid Paystack fixtures to include `currency: "GHS"`.
- Added a negative test proving a webhook with missing currency cannot mark an order paid.
- Made generated test SKUs and helper identifiers collision-resistant across repeated runs.
- Made concurrent payment references unique per run.

## Migration Evidence

Disposable database: `balican_task1_20260613170646`

- First run: 35 migrations applied successfully.
- Second run: 35 migrations reported `SKIP`.
- Ledger: 35 migration records.
- Cleanup: database dropped successfully.

## Release Notes

- The repository already contained a large dirty worktree from the broader CTO hardening program; unrelated changes were preserved.
- No commit was created because `.git` is read-only in this workspace session.
- This report completes the mandatory Master Task 1 checkpoint. Later tasks in
  `CODEX_PROMPTS.md` have not been started in this checkpoint.
