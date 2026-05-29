# Changelog

## v1.0.0 — Quotation & Invoice PDF Email Delivery

### Feature Summary

- **Admin/sales can send quotation emails with attached PDF.** `POST /api/admin/quotations/:id/send` generates a branded PDF (pdfkit) with line items, totals, and per-product "View Product" links, then delivers it via Resend. The quotation is marked `sent` and the RFQ is updated to `quote_sent` only after the email succeeds (fail-closed). Every send is logged to `email_logs`.

- **Quotation PDFs include frontend product links** for each product-linked line item. Links use the configured `FRONTEND_URL` as the base domain and point to public `/products/[slug]` pages — never to admin URLs. Product slugs and URLs are snapshotted on `quotation_items` at send time so historical PDFs remain stable even if products are later renamed or removed. Custom/free-text lines (no `product_id`) omit the link.

- **Accepted quotation conversion creates order/invoice and emails invoice PDF.** `POST /api/orders/from-quotation/:id` converts an accepted quotation to an order + invoice, generates an invoice PDF, and emails it. Email failures are logged but do **not** roll back the conversion — the order and invoice are persisted regardless, and a "Resend Invoice" action is available.

- **Admin can manually resend invoice PDF.** `POST /api/orders/admin/invoices/:id/send` regenerates and re-emails an invoice PDF. Invoice creation is never duplicated — the endpoint only re-sends the email, not the invoice record. Each attempt is logged to `email_logs`.

### New Environment Variables

| Variable            | Required | Default                   | Description                                        |
| ------------------- | -------- | ------------------------- | -------------------------------------------------- |
| `RESEND_API_KEY`    | No       | —                         | Resend API key for transactional emails. Leave empty to disable sending; notifications still logged to `email_logs`. |
| `RESEND_FROM_EMAIL` | No       | `no-reply@yourdomain.com` | From-address for transactional emails.              |
| `FRONTEND_URL`      | No       | `http://localhost:3000`   | Frontend URL used for CORS, redirects, and as the base domain for PDF product links. |

### New Endpoints

| Method | Path                                   | Auth    | Description                                      |
| ------ | -------------------------------------- | ------- | ------------------------------------------------ |
| POST   | `/api/admin/quotations/:id/send`        | Admin   | Send quotation PDF email with product links       |
| POST   | `/api/orders/from-quotation/:id`        | Admin   | Convert accepted quotation to order + invoice + email |
| POST   | `/api/orders/admin/invoices/:id/send`   | Admin   | Re-send invoice PDF email (idempotent on invoice) |

### Important Behavior

- **Quote PDFs use frontend product links, never admin URLs.** The `FRONTONTEND_URL` config variable controls the base domain. Links point to public product detail pages (`/products/[slug]`). Prices are never exposed to unauthenticated or pending/rejected company users.
- **Quote PDFs preserve quotation/product snapshots.** `product_slug` and `product_url` columns on `quotation_items` are populated at send time, ensuring historical PDFs are accurate even after product catalog changes.
- **Quotation send fails closed if email fails.** If Resend returns an error, the quotation stays in `draft` status, no `email_logs` entry is created, and the RFQ is not updated to `quote_sent`.
- **Invoice creation is not duplicated on resend.** Manual resend only generates and emails a new PDF — it never creates a second invoice or order record.
- **Invoice on conversion persists regardless of email status.** If the email fails, the order and invoice are still created. The "Resend Invoice" button on the invoice card in the admin panel allows re-sending at any time.

### Test Status

- Backend tests: **137/137 passing** across 7 suites.
- Backend TypeScript: **clean** (`tsc --noEmit` passes).
- Frontend build: **clean** (Next.js 15 production build succeeds).
- All Paystack webhook HMAC tests fixed and passing.
- 11 PDF email flow integration tests covering: quotation send, fail-closed on email error, product link presence in PDF, free-text line omission, accepted-quotation conversion, duplicate conversion blocking, manual invoice resend, failed resend logging, price security (no price leak in PDF links).

### Files Changed

- `backend/src/routes/quotations.ts` — Quotation PDF send endpoint with product-link snapshotting
- `backend/src/routes/orders.ts` — Invoice PDF generation on conversion; manual invoice resend endpoint; Paystack webhook raw-body HMAC fix
- `backend/src/services/pdf.ts` — `generateQuotationPdf()` and `generateInvoicePdf()` (pdfkit)
- `backend/src/services/email.ts` — Resend-based email service with PDF Buffer attachment
- `backend/src/config/migrate-quotation-pdfs.ts` — Migration: `product_slug`/`product_url` on quotation_items, `pdf_url` on invoices/quotations, reference columns on email_logs
- `backend/src/__tests__/b2b-pdf-email.test.ts` — 11 PDF email flow integration tests
- `backend/src/__tests__/payments.test.ts` — Webhook stability fixes (env key leakage, stale data cleanup)
- `backend/src/app.ts` — Raw body capture middleware cleanup
- `frontend/src/app/admin/orders/[id]/payments/page.tsx` — "Resend Invoice" button
- `frontend/src/lib/api.ts` — `adminSendInvoice()` API client method
- `backend/.env.example` — Documented `RESEND_FROM_EMAIL`, `FRONTEND_URL`, `RESEND_API_KEY`
- `README.md` — PDF email delivery section, new endpoints table, env vars update
