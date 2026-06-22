# Balican Service Level Objectives

## Scope

These objectives cover the production Balican API and its critical procurement path. The measurement source is the existing Prometheus endpoint at `/internal/metrics`, protected by `METRICS_TOKEN`; critical notifications use the existing `ALERT_WEBHOOK_URL` delivery path.

SLOs are reviewed monthly. An error-budget breach requires a written incident review and prioritizes reliability work over feature delivery until the service returns within budget.

## Objectives

| Area | Objective | Measurement window | Source |
| --- | --- | --- | --- |
| Availability | `/api/ready` succeeds for at least 99.5% of requests | Rolling 30 days | `balican_http_requests_total` |
| Product search latency | p95 under 1 second for `GET /api/products` | Rolling 10 minutes and monthly review | `balican_http_request_duration_seconds` |
| Order creation latency | p95 under 2 seconds for `POST /api/orders` | Rolling 10 minutes and monthly review | `balican_http_request_duration_seconds` |
| Payment webhook latency | p95 under 1 second for `POST /api/orders/paystack-webhook` | Rolling 10 minutes and monthly review | `balican_http_request_duration_seconds` |
| Payment webhook processing | At least 99.9% successful processing for recognized, non-duplicate Paystack events | Rolling 30 days | `balican_payment_webhook_events_total` |
| Payment mismatch | Zero amount or currency mismatches | Immediate | `balican_payment_webhook_events_total{outcome="mismatch"}` |
| Transactional email | At least 99% accepted by the configured email provider | Rolling 30 days | `balican_email_deliveries_total` |
| Backup recency | One successful encrypted database backup every 24 hours; alert after 26 hours | Continuous | `balican_backup_age_seconds` |
| Restore verification | Complete and record an isolated restore drill at least quarterly | Calendar quarter | `scripts/restore-drill.sh` evidence |

Invalid signatures, malformed requests, ignored event types, unknown references, and replayed events are tracked but excluded from payment processing success because they are not valid new payment attempts.

## Prometheus Queries

Availability over 30 days:

```promql
sum(increase(balican_http_requests_total{route="/api/ready",status_code=~"2.."}[30d]))
/
sum(increase(balican_http_requests_total{route="/api/ready"}[30d]))
```

Latency p95, substituting the required method and route:

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(balican_http_request_duration_seconds_bucket{method="GET",route="/api/products"}[10m])
  )
)
```

Payment webhook processing success:

```promql
sum(increase(balican_payment_webhook_events_total{outcome="success"}[30d]))
/
sum(increase(balican_payment_webhook_events_total{outcome=~"success|mismatch|error"}[30d]))
```

Transactional email acceptance:

```promql
sum(increase(balican_email_deliveries_total{outcome="sent"}[30d]))
/
sum(increase(balican_email_deliveries_total{outcome=~"sent|failed|unavailable"}[30d]))
```

## Alerts And Operator Actions

| Event | Trigger | Cooldown | Operator action |
| --- | --- | --- | --- |
| `service.readiness_failed` | Any database, schema, or storage readiness check fails | 1 minute | Check the failing readiness component, recent deployment, database connectivity, migrations, and object storage; roll back if caused by a release |
| `slo.latency_exceeded` | A production search, order creation, or webhook request exceeds its latency target | 5 minutes per event | Inspect route latency histogram, database saturation, slow queries, and upstream Paystack timing; correlate with request ID and release |
| `payment.paystack_mismatch` | Order payment amount or currency differs from the expected GHS transaction | 1 minute | Do not fulfill the order; compare Paystack transaction details with the order and investigate tampering or configuration drift |
| `payment.verification_fee_mismatch` | Verification payment amount or currency differs | 1 minute | Keep verification gated; compare fee settings and Paystack transaction details |
| `payment.webhook_processing_failed` | An exception prevents webhook processing | 1 minute | Inspect the structured error, safely replay the Paystack event after fixing the cause, and confirm idempotent payment recording |
| `email.delivery_failed` | Resend rejects or fails a transactional email | 1 minute | Check Resend status, sender verification, quota, and email log; retry the affected document or notification |
| `email.delivery_unavailable` | Email provider is not configured | 1 minute | Restore `RESEND_API_KEY` and verified sender configuration before sending procurement documents |
| `backup.stale` | Latest successful backup marker is older than 26 hours | 1 hour | Run `scripts/backup-db.sh`, verify checksum and off-site copy, then investigate the scheduler failure |
| `backup.missing` | No backup success marker is visible in production | 1 hour | Verify the `/app/backups` read-only mount and backup schedule, then run and validate an encrypted backup |

The application cooldown is a storm-control mechanism, not incident resolution. Repeated failures remain visible in counters and structured logs while notifications are suppressed.

## Backup And Restore Procedure

The backup job must run at least daily:

```bash
NODE_ENV=production ./scripts/backup-db.sh ./backups
```

Only after the dump, encryption, checksum, optional off-site upload, and retention steps succeed does the script update `backups/.last-success`. The backend reads that marker through the read-only `/app/backups` mount.

At least once per quarter, run:

```bash
./scripts/restore-drill.sh
```

Record the date, operator, backup identifier, migration count, result, and any corrective action in the operational change log. A failed drill is an incident and must be corrected before the next production deployment.

## Newly Added Instrumentation

- `balican_payment_webhook_events_total{outcome}`
- `balican_email_deliveries_total{outcome}`
- `balican_backup_age_seconds`
- Production latency threshold alerts for product search, order creation, and payment webhooks
- Rate-limited webhook processing and backup recency alerts
