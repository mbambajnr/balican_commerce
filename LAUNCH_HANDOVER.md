# Balican Launch Handover

Verified on 2026-06-22. This release positions Balican as a Ghana-first B2B procurement marketplace: buyers post sourcing requests, verified suppliers respond, deals close on agreed terms, and Balican earns paid-verification fees plus commission on completed deals.

## Verification Results

| Gate | Result |
| --- | --- |
| Backend production build | PASS |
| Frontend production build | PASS (86 routes generated) |
| Backend integration suite | PASS: 56 suites, 844 tests |
| Fresh database migration | PASS: all 39 migrations applied |
| Migration idempotency rerun | PASS: all 39 migrations skipped with matching checksums |
| Local production-mode smoke test | PASS: 14/14 automated checks, strict readiness enabled |

The disposable database was `sslplan_launch_check_20260622`. The smoke stack used production config validation and an isolated local S3 readiness stub; no live payment, email, alert, or cloud-storage credentials were exercised.

## Delivered Scope

1. **Verification sweep and Ghana currency:** production configuration fails closed; payment paths enforce GHS and exact amounts; launch and Paystack reports document the audit.
2. **Wedge-first public UI:** homepage and navigation lead with posting a sourcing request and becoming a verified supplier.
3. **Automated smoke test:** `scripts/smoke-test.mjs` checks public pages/APIs, readiness, Auth.js credential exposure, proxy protections, CSP, referrer policy, and `nosniff` without creating data.
4. **Paystack readiness:** signature, amount, currency, duplicate-reference, replay, and mismatch behavior are covered; `PAYSTACK_GO_LIVE.md` contains the live procedure.
5. **Deal-loop operations:** `/admin/operations` provides sourcing, response, acceptance, order, fulfilment, credit, repayment, and CSV reporting.
6. **Supplier reminders:** an idempotent 24-hour category-matched reminder job sends one notification/email per provider/request and excludes closed requests.
7. **Balican Verified:** payment or audited waiver gates review; settings control fee, renewal, and grace; profiles/proposals show verification status; renewal reminders and lapse handling are implemented.
8. **Deal commission:** category overrides and a global default feed a replay-safe NUMERIC ledger on completed orders; supplier/admin statements and admin CSV export are available.
9. **First-party funnel:** server-side, fail-open events feed stage conversion in the operations report without vendor SDKs.
10. **Buyer/supplier UX:** two-step onboarding, contextual business-profile requirements, golden-path redirects, useful empty states, 380px mobile layouts, WhatsApp sharing, and Ghana-first Region/TIN (GRA)/GH₵ copy are complete.
11. **Search and operational hardening:** Elasticsearch was removed in favor of PostgreSQL full-text/trigram search; sessions, S3 document storage, metrics, Sentry, alerts, backups, SLOs, and release-safe deployment scripts are documented.

## New Migrations

These 19 migrations were added after the original repository baseline and are registered in the canonical runner:

| Migration | Purpose |
| --- | --- |
| `migrate-marketplace.js` | Provider marketplace foundation |
| `migrate-notifications.js` | In-app notification and deduplication records |
| `migrate-procurement-activity.js` | Procurement activity history |
| `migrate-procurement-orders.js` | Procurement-to-order flow |
| `migrate-procurement-requests.js` | Structured procurement requests |
| `migrate-scout.js` | Sourcing requests and supplier quotes |
| `migrate-supplier-credit.js` | Supplier-side trade-credit controls |
| `migrate-order-lifecycle.js` | Fulfilment lifecycle states and history |
| `migrate-rfq-scout.js` | RFQ and Scout linkage |
| `migrate-agreements.js` | Accepted proposal agreements |
| `migrate-offering-documents.js` | Product/service supporting documents |
| `migrate-recommendation-events.js` | Recommendation interaction events |
| `migrate-services-enhance.js` | Provider service marketplace fields |
| `migrate-super-admin-control.js` | Super-admin plans, documents, and audit controls |
| `migrate-auth-sessions.js` | Revocable authenticated sessions |
| `migrate-verification-fees.js` | Fee settings/payments, renewal, and waivers |
| `migrate-commissions.js` | Commission rates and ledger |
| `migrate-funnel-events.js` | First-party funnel event stream |
| `migrate-postgres-search.js` | PostgreSQL full-text/trigram search and analytics |

The runner currently applies 39 migrations in total. Never edit an applied migration; add and register a new ordered migration.

## New Environment Variables

### Backend and operations

| Variable | Use |
| --- | --- |
| `PAYMENT_CURRENCY` | Required as `GHS` in production |
| `ALERT_WEBHOOK_URL` | HTTPS critical-alert destination |
| `SENTRY_DSN` | Centralized exception reporting |
| `SENTRY_TRACES_SAMPLE_RATE` | Performance trace sampling, default `0.05` |
| `APP_RELEASE` / `GIT_SHA` | Release identity attached to telemetry |
| `METRICS_TOKEN` | Minimum 32-character token for `/internal/metrics` |
| `BACKUP_STATUS_FILE` | Last-success marker used by backup-age monitoring |
| `UPLOAD_STORAGE_DRIVER` | Must be `s3` in production |
| `PUBLIC_UPLOAD_BASE_URL` | HTTPS public/CDN base for public objects |
| `UPLOAD_MAX_IMAGE_SIZE` | Maximum image upload bytes |
| `S3_BUCKET`, `S3_REGION` | Production object-store location |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | Optional S3-compatible provider controls |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Paired static credentials when no runtime role exists |
| `S3_SIGNED_URL_EXPIRES_SECONDS` | Private signed-download lifetime |
| `BACKUP_ENCRYPTION_KEY` | Encryption key held outside the repository |
| `BACKUP_RCLONE_REMOTE` | Off-site backup destination |
| `BACKUP_RETENTION_DAYS` | Local encrypted-backup retention |
| `POSTGRES_PASSWORD` | Compose PostgreSQL credential |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | Immutable deployment image overrides |

### Frontend and smoke runner

| Variable | Use |
| --- | --- |
| `BACKEND_API_URL` | Server-only Auth.js/proxy API target |
| `NEXT_PUBLIC_GTM_ID` | Optional consent-gated Google Tag Manager ID |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional consent-gated GA4 ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | Optional consent-gated Meta Pixel ID |
| `BASE_URL` | Smoke-test web origin |
| `API_BASE_URL` | Smoke-test API origin when separate |
| `SMOKE_TIMEOUT_MS` | Per-request smoke timeout, default 10000 |
| `SMOKE_STRICT_READY` | Set `true` to require deep readiness at the API origin |

Existing production essentials remain required: `DATABASE_URL`, `JWT_SECRET`, `PAYSTACK_SECRET_KEY`, optional `PAYSTACK_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_API_URL`, and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`. `ELASTICSEARCH_URL` is retired.

## Founder Actions Before Go-Live

- [ ] Push/merge the release commit, review the GitHub diff, and tag the immutable release.
- [ ] Provision production PostgreSQL and S3-compatible storage; set every required variable in `DEPLOYMENT_CHECKLIST.md`.
- [ ] Create live Ghana Paystack keys and set `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`; keep `PAYMENT_CURRENCY=GHS`.
- [ ] Register `https://<api-domain>/api/orders/paystack-webhook` for `charge.success` in Paystack.
- [ ] Follow `PAYSTACK_GO_LIVE.md` to make one real GH₵10 payment; confirm exact settlement, one ledger effect, receipt delivery, metrics, logs, and alerts, then refund if appropriate.
- [ ] Configure and verify the Resend sending domain/from-address; test quotation and invoice delivery.
- [ ] Create the founder super-admin, then disable or tightly protect the bootstrap admin secret.
- [ ] Set the Balican Verified fee, renewal period, and grace period in `/super-admin/plans` before accepting suppliers.
- [ ] Set the global commission rate and review category overrides in `/super-admin/plans` before completing the first deal.
- [ ] Open each approved first-cohort supplier in `/super-admin/companies/[id]` and record the 365-day founder-onboarding waiver with a reason.
- [ ] Schedule the hourly opportunity reminder command and daily authenticated verification-lapse job.
- [ ] Run the strict smoke command against production, then manually test buyer request → supplier proposal → agreement → order → fulfilment → commission.
- [ ] Verify monitoring, encrypted off-site backups, restore drill, TLS/DNS, privacy/legal contact details, and the launch go/no-go table.

## Launch Decision

The codebase is technically launch-ready against the automated gates above. Production remains **NO-GO** until the founder completes the live credentials, webhook, GH₵10 payment, revenue settings, first-cohort waiver decisions, scheduler, storage, email, monitoring, and backup checks.
