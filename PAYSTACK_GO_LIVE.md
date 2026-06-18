# Paystack Go-Live Runbook

This checklist covers Balican order payments and Balican Verified fee payments in Ghana. Production payments must use `GHS`; Paystack amounts are integer pesewas (`GH₵10.00` = `1000`).

## Implementation Audit

### Automated Paystack paths

- `backend/src/app.ts:56-73` captures the webhook request bytes before `express.json()` so HMAC verification uses the original payload.
- `backend/src/routes/orders.ts:825-866` initializes transactions server-side with the authenticated user's order, a unique reference, the order total multiplied by 100, and `config.paystack.currency`.
- `backend/src/routes/orders.ts:875-906` resolves the webhook signing key, fails closed in production when it is absent, and verifies `x-paystack-signature` with HMAC SHA-512 before processing the event.
- `backend/src/routes/orders.ts:919-926` checks `order_payments` by Paystack reference inside a transaction with `FOR UPDATE`; `backend/src/routes/orders.ts:1005-1007` also locks the matching order. The payment insert is additionally protected by the database's unique Paystack-reference index.
- `backend/src/routes/orders.ts:941-971` requires an exact integer amount and exact configured currency for Balican Verified fees. A mismatch emits `payment.verification_fee_mismatch`, writes `activity_logs`, and makes no payment-state change.
- `backend/src/routes/orders.ts:1013-1047` requires an exact integer amount and exact configured currency for orders. A mismatch emits `payment.paystack_mismatch`, writes a `payment.mismatch` activity, and makes no payment-state change.
- `backend/src/routes/orders.ts:1049-1089` mutates the order, payment, invoice, and activity records only after all webhook checks pass.

`backend/src/routes/payments.ts:508-610` is a separate, admin-authenticated manual payment-recording path. Its `paystack` method value is an accounting label; it does not consume Paystack webhooks. It rejects amounts above the outstanding balance and records the authenticated administrator and activity entry.

### Test coverage

`backend/src/__tests__/payments.test.ts` covers bad and missing signatures, a valid raw-body signature, production fail-closed behavior, underpayment, overpayment, wrong currency, missing currency, missing amount, and replayed references. Verification-fee webhook behavior is covered in `backend/src/__tests__/provider-verification-fees.test.ts`; concurrent replay protection is covered in `backend/src/__tests__/concurrency.test.ts`.

## Pre-Launch Checks

1. Confirm the Paystack business is activated for Ghana and the production account's integration currency is Ghanaian cedi.
2. Confirm the production database migrations are current, including the unique Paystack payment-reference index.
3. Set these production environment variables in the backend secret manager:

   ```env
   NODE_ENV=production
   PAYMENT_CURRENCY=GHS
   PAYSTACK_SECRET_KEY=sk_live_REPLACE_WITH_REAL_KEY
   ```

4. Leave `PAYSTACK_WEBHOOK_SECRET` unset unless Paystack has supplied a distinct signing secret. The application otherwise verifies webhook signatures with `PAYSTACK_SECRET_KEY`, matching Paystack's documented signing behavior.
5. `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` is currently not read by the frontend because checkout uses the server-created Paystack authorization URL. Do not expose the secret key in any frontend variable.
6. Restart the backend and confirm startup does not report missing `PAYSTACK_SECRET_KEY` or a non-`GHS` payment currency.
7. From Paystack Dashboard, switch to **Live Mode**, open **Settings > API Keys & Webhooks**, and register this HTTPS endpoint:

   ```text
   https://<production-api-host>/api/orders/paystack-webhook
   ```

8. Confirm the endpoint is publicly reachable and returns HTTP 401 for an unsigned request. Do not use a localhost URL.

## GH₵10 Live Verification

Use a real payment method and a real order created specifically for this check.

1. Create an order whose exact total is `GH₵10.00` and choose Paystack.
2. Start payment through the Balican UI. In Paystack Dashboard, confirm the initialized transaction shows `GHS 10.00`, reference `SS-...`, and live mode.
3. Complete the payment. Do not manually mark the order paid.
4. Confirm Paystack reports a successful `charge.success` delivery to the production webhook with HTTP 200.
5. Confirm the webhook amount is integer `1000` and currency is exactly `GHS`.
6. Confirm Balican records all of the following exactly once:
   - order `payment_status = paid`, `amount_paid = 10.00`, `outstanding_amount = 0`
   - invoice `status = paid`, `amount_paid = 10.00`, `outstanding_amount = 0`
   - one `order_payments` row with method `paystack` and the Paystack reference
   - `payment.recorded` and `invoice.paid` activity entries
7. Replay the same signed webhook from Paystack's delivery tools, if available, and confirm no second payment row or balance change occurs.
8. Refund or reconcile the GH₵10 transaction according to the finance team's normal process.

## Post-Launch Monitoring

- Watch application errors and Paystack webhook delivery status continuously for the first hour, then daily for the first week.
- Alert immediately on `payment.paystack_mismatch`, `payment.verification_fee_mismatch`, missing-signing-key startup errors, webhook HTTP 401/500 responses, duplicate-reference database errors, or paid Paystack transactions whose Balican order remains unpaid.
- Reconcile Paystack successful transactions against `order_payments` and `verification_fee_payments` daily. Match reference, GHS amount, currency, and status.
- Treat any amount/currency mismatch as a financial incident: retain the audit record, do not manually force the webhook through, and reconcile against Paystack before changing order state.
- Rotate a compromised live secret immediately in Paystack and the production secret manager, restart the backend, and run another GH₵10 verification.

## Official References

- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)
- [Paystack API currency and subunits](https://paystack.com/docs/api/)
- [Paystack accepting payments](https://paystack.com/docs/payments/accept-payments/)
