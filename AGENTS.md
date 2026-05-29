# SSLPLAN Session Summary

## What was done

### 1. B2B Company Account System
- **DB Migration**: Created `companies` table (name, email, industry, business_type, address, tax_id, reg_number, contact_person, payment_terms_days, credit_limit, status, customer_group_id, assigned_sales_rep_id, etc.)
- **Registration**: Updated form & backend to collect company info on signup, create company with `pending` status
- **Admin Approval**: approve/reject workflow, assign sales rep, set credit limit/payment terms
- **Admin Companies Page**: `/admin/companies` list with search/filter/pagination, detail page with approve/reject actions

### 2. Customer Groups
- **DB Migration**: `customer_groups` table (name, description, minimum_order_amount, is_default)
- **Seeded**: Standard, Silver, Gold, Platinum tiers
- **Admin CRUD**: Create/edit groups

### 3. Custom Pricing (Company-Prices)
- **DB Migration**: `company_prices` table (company_id, customer_group_id, product_id, price, min_quantity)
- **Backend Logic**: `applyCustomPricing()` in products route resolves price precedence: company price > group price > base price
- **Admin CRUD**: Manage company-specific and group-specific prices from admin panel

### 4. Hidden Prices / Access Control
- **DB**: `hide_price` column on products
- **Logic**: `resolveCompanyGroup()` extracts JWT and resolves company/group without requiring auth middleware
- **Behavior**: Unauthenticated users see `price: null` for products with `hide_price=true`; authenticated B2B users see real prices
- **Middleware**: `requireCompanyActive` blocks cart/checkout/quick-order for pending/rejected companies

### 5. Store Credit
- **DB**: `store_credit` column on users, `store_credit_transactions` table (audit trail)
- **Admin**: GET/POST `/api/admin/store-credit/:userId` (view + adjust), prevents negative balance
- **Customer**: GET `/api/store-credit` returns balance + recent transactions

### 6. Payment Methods per Company
- **DB**: `company_payment_methods` table (company_id, customer_group_id, method, enabled)
- **Admin CRUD**: POST/GET `/api/admin/company-payment-methods`
- **Customer**: GET `/api/payment-methods` returns filtered list (defaults: paystack, bank_transfer, credit)

### 7. Shipping Methods
- **DB**: `shipping_methods` table (name, code, base_rate, rate_per_kg, estimated_days), `company_shipping_methods` assignment table
- **Admin CRUD**: Full CRUD for shipping methods + company assignments
- **Customer**: GET `/api/shipping-methods` returns available methods

### 8. Cart System
- **DB**: `carts` + `cart_items` tables
- **Endpoints**:
  - GET `/api/cart` - view cart
  - POST `/api/cart/items` - add item (auto-creates cart)
  - PATCH `/api/cart/items/:id` - update quantity
  - DELETE `/api/cart/items/:id` - remove item
  - POST `/api/cart/checkout` - convert cart to order (clears cart)

### 9. Quick Order
- **POST `/api/quick-order`**: Order by SKU array with stock validation
- **POST `/api/quick-order/csv`**: Upload CSV/XLSX file with multer + xlsx parsing
- **Logs**: Records in `quick_orders` table with source (manual/csv)

### 10. Reorder
- **POST `/api/reorder/:orderId`**: Creates new order from previous order items using current prices

### 11. Configurable Products (Variants)
- **DB**: `product_variants` table (product_id, sku, name, price, stock_status, option_values (JSONB), sort_order)
- **Admin CRUD**: Full variant management per product
- **Option Types/Values**: `option_types` + `option_values` tables with admin CRUD

### 12. Procurement Lists
- **DB**: `procurement_lists` + `procurement_list_items` tables
- **Admin**: Read-only endpoints for viewing procurement lists per company

### 13. Sub-Users / Company Roles
- **DB**: `company_role` enum on users (company_admin, buyer, finance, viewer)
- **Admin**: POST `/api/admin/companies/:id/users` to create sub-users under a company

### 14. Dashboard & Navigation Updates
- **Admin Dashboard**: Added totalCompanies, pendingCompanies stats; Companies link in Quick Manage
- **Navbar**: Shows company name for logged-in users, "Register Company" CTA, "Browse Catalog" for guests

### 15. Currency Cleanup
- Changed all ₦ → GH₵ (Ghana Cedi) across 18+ files
- Nigeria → Ghana references updated

### 16. Tests
- **Security/Integration Tests** (`b2b-security.test.ts`): 26 tests covering hidden prices, status enforcement, pricing precedence, cross-company isolation, store credit, payment methods, quick order, reorder

### Files Created/Modified
- `backend/src/routes/b2b.ts` — All B2B endpoints (cart, quick-order, reorder, store credit, payment methods, shipping, variants, option types)
- `backend/src/__tests__/b2b-security.test.ts` — 26 security/integration tests
- `backend/src/__tests__/helpers.ts` — Updated to include company_id, store_credit in ON CONFLICT
- `backend/src/app.ts` — Registered b2b routes
- `frontend/src/lib/api.ts` — All B2B API client methods

### Documentation Updates
- **README.md**: Added B2B routes to Route Groups table, B2B tables to Database section, B2B migrations, B2B frontend pages, Roadmap & Limitations section (CMS: N/A, GraphQL: backlog)
- **AGENTS.md**: Persisted session summary

### Test Results
- **114 tests passing** across 6 suites
- All B2B features verified with integration tests

---

## Session 2: Pre-launch Hardening & Dev Startup Fix

### Goal
Complete pre-launch hardening (webhook security, deployment docs, smoke tests) and fix the `routes-manifest.json` missing file crash.

### Done
1. **Webhook Security**
   - Raw body capture middleware in `app.ts` for HMAC verification over byte-exact request body.
   - Fail-closed in production when `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` is missing (returns 500).
   - Webhook signing key resolution: env var → config, tests inject per-test keys without affecting global config.
   - Production config validation warns on startup for missing required vars.

2. **Full Verification**
   - 116/116 backend tests passing (2 new webhook tests: TC-12c valid signature, TC-12d production fail-closed).
   - Backend TypeScript clean.
   - Frontend build clean.

3. **Migration Review & Fixes**
   - Reviewed all 13 migrations for order, duplicate enums, missing indexes/FKs.
   - Fixed `migrate-concurrency.ts`: used `duplicate_table` instead of `duplicate_object` for CHECK constraints.
   - Cleaned duplicate/outdated entries in README migration list.

4. **Documentation**
   - `.env.example` files (backend + frontend) with full production docs.
   - `LAUNCH_SMOKE_TEST.md` — 45 manual test cases across 9 B2B sections.
   - `DEPLOYMENT_CHECKLIST.md` — 10-step guide with TLS, git, webhook setup.

5. **Dev Startup Fix**
   - Root cause: `next-auth` middleware requires `.next/routes-manifest.json`, which is only generated by `next build`. After clearing `.next/`, the dev server crashed with 500 / ENOENT on every page load.
   - Fix: Created `scripts/dev.js` that detects missing `routes-manifest.json` and runs `next build` automatically before starting the dev server.
   - Changed `package.json` `"dev"` script from `"next dev"` → `"node scripts/dev.js"`.

### Files Created/Modified
- `frontend/scripts/dev.js` — Auto-build script for missing routes manifest.
- `frontend/package.json` — `"dev"` updated to `node scripts/dev.js`.
- `backend/src/app.ts` — Raw body capture middleware for webhook.
- `backend/src/routes/orders.ts` (lines 535-554) — Webhook fail-closed + raw-body HMAC.
- `backend/src/config/index.ts` — Production validation.
- `backend/src/config/migrate-concurrency.ts` — Fixed `duplicate_object` → `duplicate_table`.
- `backend/.env.example` — Full production variable docs.
- `frontend/.env.example` — Frontend env docs.
- `LAUNCH_SMOKE_TEST.md` — 45-case smoke test.
- `DEPLOYMENT_CHECKLIST.md` — 10-step deployment guide.

### Key Decisions
- Raw body capture uses middleware before `express.json()` with `req._body=true` — simpler than route-level `express.text()`.
- Webhook fail-closed uses `process.env.NODE_ENV` directly (not frozen config) to allow test swizzling.
- Dev script runs `next build` only when manifest is missing — avoids rebuild on every restart.
- Webhook signing key resolution: env → config fallback for testability.

### Critical Context
- `routes-manifest.json` is generated by `next build` only; `next dev` never creates it. The dev script handles this.
- All migrations are idempotent — safe to re-run on failure.

---

## Session 3: Royal Blue Theme, Quote-First Model, Guest RFQ, PDF Email Delivery

### Goal
Transform Bali-Can into a premium B2B quote-first platform with royal-blue/deep-navy/gold branding, guest RFQ flow with no auth required, and automated quotation/invoice PDF email delivery.

### Done
1. **Quote-First Pricing Correction**
   - `backend/src/routes/products.ts`: `resolvePricingContext` checks user `account_status` AND company `status`. Exported `applyCustomPricing`. Both GET `/` and GET `/:slug` nullify `price`/`compare_price` when prices are hidden.
   - `backend/src/routes/b2b.ts`: Cart/checkout/quick-order/reorder use resolved company pricing.
   - `frontend/src/app/products/product-listing-client.tsx`: Shows price only when `product.price !== null`.
   - `frontend/src/app/products/[slug]/product-client.tsx`: Quote-first CTAs per auth/status.
   - 31 B2B security tests covering all quote-first scenarios (guest/pending/rejected no prices, company price > group price > base, cross-company isolation, admin always sees prices).

2. **Guest RFQ Flow**
   - DB: `pending_review` status, `source`/company/contact/message columns on RFQs.
   - POST `/api/rfqs/guest`: No auth, Zod-validated, rate-limited 3/min/IP, stores product snapshot.
   - GET `/api/rfqs`: Supports `?source=guest|registered` admin filter.
   - Frontend: Guest RFQ form with company/contact/address fields; admin RFQ list with source filter badge.
   - 7 guest RFQ tests (submission, product snapshot, no price leak, validation, admin visibility).

3. **Visual Theme v2 — Royal Blue / Deep Navy / Gold**
   - **globals.css**: `@theme` tokens — `accent` → `#1848CC` (royal blue), `accent-bold` → `#245BFF`, `accent-soft` → `#F0F4FF`, `navy` → `#061633`, `navy-dark` → `#0C0C0C`. Gold as restrained premium (`#D4AF37`). Updated `btn-primary`, `btn-gold`, badge classes.
   - **Components**: Hero carousel (blue gradients/pills), homepage (blue geometric patterns), navbar (blue BC logo badge).

4. **Quotation/Invoice PDF Email Delivery**
   - **Installed**: `pdfkit` + `@types/pdfkit` in backend.
   - **`backend/src/services/email.ts`**: Resend-based email service with PDF Buffer attachment support.
   - **`backend/src/services/pdf.ts`**: `generateQuotationPdf()` and `generateInvoicePdf()` — Bali-Can branding, line item tables, View Product links, totals, payment info. Note: Both functions return `Promise<Buffer>` because pdfkit's stream model requires waiting for the `end` event.
   - **`backend/src/config/migrate-quotation-pdfs.ts`**: Adds `product_slug`/`product_url` on `quotation_items`, `pdf_url` on `invoices`/`quotations`, reference columns on `email_logs`. Migration applied.
   - **`backend/src/routes/quotations.ts`**: `POST /api/admin/quotations/:id/send` — snapshots product slugs/URLs, generates PDF, sends via Resend (fail-closed), marks quotation sent + RFQ `quote_sent` only after email succeeds, logs in `email_logs`.
   - **`backend/src/routes/orders.ts`**: `POST /api/orders/from-quotation/:id` — generates invoice PDF, emails it with Resend, logs to email_logs. `POST /api/orders/admin/invoices/:id/send` — manual invoice resend endpoint.
   - **`frontend/src/lib/api.ts`**: Added `adminSendInvoice()`.
   - **`frontend/src/app/admin/orders/[id]/payments/page.tsx`**: "Resend Invoice" button on invoice card.

5. **Integration Tests for PDF Email Flow** (`b2b-pdf-email.test.ts`):
   - Quotation send attaches PDF email, marks quotation sent, updates RFQ to `quote_sent`, logs email.
   - Quotation NOT marked sent if email fails (retains `draft` status).
   - Quotation PDF contains frontend product links for each product-linked line item.
   - Custom/free-text lines (no product_id) do not require product links.
   - Accepted quotation converts to order + invoice with PDF email.
   - Duplicate conversion of the same quotation is blocked.
   - Invoice resend endpoint sends another email and logs it.
   - Invoice resend endpoint logs failed email attempts.
   - Product links do not expose prices to guest/pending users.

### Files Created/Modified
- `backend/src/routes/products.ts` — `resolvePricingContext`, exported `applyCustomPricing`, price nullification.
- `backend/src/routes/b2b.ts` — Company pricing in cart/checkout/quick-order/reorder.
- `backend/src/routes/rfqs.ts` — Guest RFQ endpoint with rate limiting, validation, product snapshopting.
- `backend/src/routes/quotations.ts` — Enhanced send endpoint with PDF generation, Resend email, product link snapshotting.
- `backend/src/routes/orders.ts` — Invoice PDF email on from-quotation + manual invoice resend endpoint.
- `backend/src/services/email.ts` — Resend-based email service with PDF attachments.
- `backend/src/services/pdf.ts` — `generateQuotationPdf()` and `generateInvoicePdf()` using pdfkit (now async, return `Promise<Buffer>`).
- `backend/src/config/migrate-quotation-pdfs.ts` — Migration for product_slug/product_url, pdf_url, email_log reference columns.
- `frontend/src/app/globals.css` — Royal blue / deep navy / gold theme tokens.
- `frontend/src/app/page.tsx` — Homepage blue geometric patterns.
- `frontend/src/components/hero-carousel.tsx` — Blue gradients, pill badges, CTAs.
- `frontend/src/app/navbar.tsx` — Blue SS logo badge on deep navy.
- `frontend/src/app/rfq/new/page.tsx` — Guest + authenticated RFQ forms.
- `frontend/src/app/admin/rfqs/page.tsx` — Source filter, guest/company badge.
- `frontend/src/app/admin/rfqs/[id]/page.tsx` — Guest contact info display.
- `frontend/src/app/products/product-listing-client.tsx` — Conditional price rendering.
- `frontend/src/app/products/[slug]/product-client.tsx` — Quote-first CTAs.
- `frontend/src/app/admin/orders/[id]/payments/page.tsx` — Resend Invoice button.
- `frontend/src/lib/api.ts` — `adminSendInvoice()` method.
- `backend/src/__tests__/b2b-security.test.ts` — 38 tests total (31 quote-first + 7 guest RFQ).
- `backend/src/__tests__/b2b-pdf-email.test.ts` — 11 PDF email flow tests (quotation send, fail-closed, product links, free-text lines, conversion, duplicate block, resend, failed resend log, price security).

### Test Results
- **137/137 backend tests passing** — all suites clean.
- All 49 B2B security/PDF tests pass (38 quote-first/guest-RFQ + 11 PDF email flow).
- Backend TypeScript clean, frontend build clean.

## Session 4: Webhook Test Stability Fix
### Goal
Fix the 2 failing Paystack webhook tests (TC-12c raw-body HMAC, TC-13 duplicate idempotency).

### Root Causes & Fixes
1. **TC-12c (order stays unpaid)**: Stale rows persisted in the DB with `paystack_reference='PAYSTACK-TEST-VALID-001'` from previous interrupted test runs. The webhook's `SELECT … FOR UPDATE` returned the stale row instead of the test's newly created order → the test's order stayed `unpaid`. Fix: `beforeAll` in the Paystack describe block now deletes any existing rows for the 3 hardcoded references.
2. **TC-13 (401 instead of 200)**: `process.env.PAYSTACK_SECRET_KEY` leaked across tests. TC-12c asserted failure before reaching its `process.env.PAYSTACK_SECRET_KEY = ""` cleanup line → subsequent tests inherited the leftover key and enforced signature verification even though TC-13 expected no signing key. Fix: `beforeEach` in the Paystack describe block unconditionally clears both `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` before every test.

### Files Modified
- `backend/src/routes/orders.ts` — Removed debug `console.log` statements.
- `backend/src/__tests__/payments.test.ts` — Added `beforeEach` env-key cleanup, stale‑data deletion in `beforeAll`, removed manual env cleanup from individual tests.
- `backend/src/app.ts` — Removed debug `console.log` from raw-body middleware.

### Test Results
- **137/137 backend tests passing** (7 suites).
- Backend TypeScript clean, frontend build clean.

### Key Decisions
- `force-dynamic` on root layout for server-side session injection was rejected because it prevents static generation of all pages.
- Middleware matcher excludes ALL `api` routes (not just `api/auth`) to prevent the `auth()` middleware from interfering with Auth.js API routes.
- Dev startup script now detects `AUTH_SECRET`/`AUTH_URL` env changes and automatically clears the `.next` cache + rebuild to prevent stale route handlers causing `ClientFetchError`.
- `resolvePricingContext` checks BOTH user `account_status` AND company `status` (not just company).
- Guest RFQ uses separate `/api/rfqs/guest` endpoint (no auth) to keep security boundary clear.
- In-memory rate limiting (Map<ip, {count, resetAt}>) chosen over express-rate-limit; cleanup interval skipped in test env.
- Theme tokens in `@theme` CSS block for Tailwind utility class propagation.
- Gold demoted to restrained premium only; royal blue takes over primary action/CTA role.
- pdfkit chosen for PDF generation (zero binary dependencies, full link/table support).
- pdfkit's `doc.end()` is async (streams model), so `generateQuotationPdf`/`generateInvoicePdf` return `Promise<Buffer>` wrapped in a `new Promise` that resolves on the `end` event.
- Email sends before DB status updates for quotations (fail-closed if Resend returns error).
- Invoice conversion does NOT rollback on email failure — email is logged as failed, and a "Resend Invoice" action is exposed.
- Product slug/URL snapshotted on `quotation_items` at send time for stable old PDFs.

---

## Session 6: Pricing Architecture Correction — Base Price Internal Only

### Goal
Treat `product.price` as internal reference only. Customer-facing pricing must come from explicitly resolved B2B sources (company/group pricing), never from base price.

### Done

1. **`applyCustomPricing`** (`backend/src/routes/products.ts`):
   - Removed the `!companyId && !groupId` early return — always runs the query
   - When no custom price found → returns `{ price: null, compare_price: null, custom_price: false }` instead of falling back to base `p.price`
   - Added `isAdmin` to `resolvePricingContext` return type

2. **Product listing/detail** (`backend/src/routes/products.ts`):
   - Three-tier pricing: `isAdmin` → base price, `canSeePrices` → `applyCustomPricing` (may be null), else → null
   - Admin users see base price directly (skips `applyCustomPricing`)
   - Customer-facing path now always delegates to `applyCustomPricing`, which never falls back to base price

3. **Customer-facing APIs** (`backend/src/routes/b2b.ts`):
   - **Cart GET**: No longer falls back to `item.price` (base price) — uses resolved price or null
   - **Checkout**: Rejects with 400 if any item has no customer-facing price
   - **Quick order (SKU)**: Rejects with 400 if any product has no customer-facing price
   - **Quick order (CSV)**: Same rejection
   - **Reorder**: Throws error if product has no price (caught as 500)

4. **Admin UI labels** (3 frontend files):
   - `admin/products/new/page.tsx`: "Base Price (GH₵) *" → "Internal Base Price (GH₵) *" with helper text
   - `admin/products/[id]/edit/page.tsx`: Same label + helper text
   - `admin/products/page.tsx`: Column `"Price"` → `"Internal Base Price"`

5. **Tests** (`security-hardening.test.ts`, `b2b-security.test.ts`, `product-media.test.ts`):
   - **Updated**: `hide_price` tests now use explicit company_price entries (7000, not base 8888) to prove hide_price overrides company pricing
   - **Updated**: Product-media test for non-company customer now expects null price
   - **New x6**: Approved company with no custom price → null; Admin sees base price; Cart checkout rejects when no price; Quick order rejects when no price

### Files Modified
- `backend/src/routes/products.ts` — `resolvePricingContext` (added `isAdmin`), `applyCustomPricing` (removed base fallback, nullifies on no match), listing/detail (admin bypass)
- `backend/src/routes/b2b.ts` — Cart (no base fallback), checkout/quick-order/CSV (reject on null), reorder (error on null)
- `frontend/src/app/admin/products/new/page.tsx` — Label + helper text
- `frontend/src/app/admin/products/[id]/edit/page.tsx` — Label + helper text
- `frontend/src/app/admin/products/page.tsx` — Column label
- `backend/src/__tests__/security-hardening.test.ts` — Company prices + updated expectations
- `backend/src/__tests__/b2b-security.test.ts` — 6 new tests
- `backend/src/__tests__/product-media.test.ts` — Non-company customer expects null price

### Test Results
- **266/266 backend tests passing** (11 suites)
- Backend TypeScript clean
- Frontend TypeScript clean
- Frontend build clean

---

## Session 7: Credit Sales Vetting & Approval Workflow

### Goal
Separate company approval (portal access) from credit-sales approval (buy now, pay later). A company may be approved for the B2B portal but NOT automatically approved for credit sales.

### Done

1. **Migration** (`backend/src/config/migrate-company-credit.ts`):
   - Added `company_credit_status` ENUM (`not_requested`, `pending_review`, `approved`, `rejected`, `suspended`)
   - Added to `companies` table: `credit_status`, `requested_credit_limit`, `approved_credit_limit`, `credit_used`, `credit_risk_rating`, `credit_review_notes`, `credit_rejection_reason`, `credit_approved_by`, `credit_approved_at`, `credit_reviewed_at`, `next_review_at`, `finance_contact_name/email/phone`, `credit_application_notes`, `payment_terms_days`
   - Created `company_credit_transactions` audit table with type CHECK constraint, credit_used_before/after snapshots, reference_id/reference_type
   - Added non-negative constraints on `credit_used` and `approved_credit_limit`
   - Created proper indexes

2. **Backend Routes**:
   - `POST /api/company/credit/apply` — Company users (admin/finance/buyer) submit credit application with requested limit, terms, finance contact, notes
   - `GET /api/company/credit` — Company user views their credit status (internal review notes NOT exposed)
   - `POST /api/admin/companies/:id/credit/approve` — Admin approves with limit, terms, risk rating, review notes, next review date
   - `POST /api/admin/companies/:id/credit/reject` — Admin rejects with reason
   - `POST /api/admin/companies/:id/credit/suspend` — Admin suspends approved credit
   - `POST /api/admin/companies/:id/credit/reactivate` — Admin reactivates suspended/rejected credit

3. **Credit Enforcement** (server-side, not frontend-only):
   - Cart checkout (`POST /api/cart/checkout`): If `paymentMethod === "credit"`, locks company row `FOR UPDATE`, checks `credit_status === 'approved'`, `available = limit - used`, `orderTotal <= available`, expiry date. On success, increments `credit_used` and logs `company_credit_transactions` within the same transaction.
   - Quick order (`POST /api/quick-order`): Same enforcement wrapped in a transaction.
   - CSV quick order (`POST /api/quick-order/csv`): Same enforcement.
   - Error responses: `"Your company is not approved for credit sales."`, `"Insufficient available credit."`, `"Your company credit limit has not been set."`, `"Your company credit facility has expired."`

4. **Company Approval De-coupled from Credit Approval**:
   - Removed auto-credit-approval from `POST /api/companies/:id/approve` (previously set `is_credit_approved = true` and `credit_limit` on the company admin user)
   - Removed `creditLimit` and `paymentTermsDays` from `approveCompanySchema`
   - Credit approval is now a completely separate workflow via `/api/admin/companies/:id/credit/*`

5. **Dashboard Updates**:
   - `GET /api/company/dashboard` now includes `companyCredit` object with full credit status
   - Company dashboard (`/account/page.tsx`): Shows credit status with contextual CTAs:
     - Not requested: "Apply for Credit Sales" button (prompts for limit + terms)
     - Pending review: "Credit application under review"
     - Approved: Shows limit, used, available, risk rating, next review in a 4-column grid
     - Rejected: "Credit not approved"
     - Suspended: "Credit facility suspended — Contact sales"

6. **Admin UI** (`/admin/companies/[id]/page.tsx`):
   - Credit status badge in Company Details card
   - "Credit Approval" section with full status display (limit, used, available, risk, review notes, rejection reason, next review, finance contact)
   - Approve form: limit input, terms days, risk rating dropdown, next review date, internal notes
   - Reject form: rejection reason, internal notes
   - Suspend/Reactivate action buttons with confirmation
   - Status-based action visibility (e.g., only "pending_review" shows Approve/Reject, only "approved" shows Suspend)

7. **API Client** (`frontend/src/lib/api.ts`):
   - `getCompanyCreditStatus()`, `applyCompanyCredit()`
   - `adminApproveCompanyCredit()`, `adminRejectCompanyCredit()`, `adminSuspendCompanyCredit()`, `adminReactivateCompanyCredit()`

8. **Tests** (`backend/src/__tests__/b2b-credit.test.ts`, 24 tests):
   - Company can apply for credit (admin, finance, buyer roles); viewer rejected
   - Cannot apply while pending_review; rejected company can re-apply
   - Credit status visible to own company; internal notes not leaked
   - Cross-company isolation (other company cannot view credit)
   - Non-admin cannot approve credit
   - Admin can approve with limit/terms/risk/notes
   - Dashboard reflects approved status
   - Admin can reject with reason, suspend, reactivate
   - Approved company can checkout with credit within limit
   - Insufficient credit limit rejected (cart + quick order)
   - Suspended/rejected/not_requested credit rejected at checkout
   - Concurrent orders cannot exceed limit (3 orders, 2 succeed, 3rd fails)
   - Quote-first pricing still enforced (no price = rejection)
   - Admin review notes visible to admin, not to company
   - Credit status visible in admin company list

### Files Created/Modified
- `backend/src/config/migrate-company-credit.ts` — New migration
- `backend/src/routes/b2b.ts` — Credit apply, credit status, enforcement in checkout/quick-order/CSV, dashboard credit field
- `backend/src/routes/admin.ts` — Credit approve/reject/suspend/reactivate endpoints, removed auto-credit from company approve
- `backend/src/services/notifications.ts` — Added `company.credit_approved` event type
- `backend/src/__tests__/b2b-credit.test.ts` — 24 credit workflow tests
- `frontend/src/app/admin/companies/[id]/page.tsx` — Credit approval section in admin detail
- `frontend/src/app/account/page.tsx` — Credit status UX on company dashboard
- `frontend/src/lib/api.ts` — Credit API client methods

### Key Decisions
- Credit lives on the `companies` table (company-level, not user-level), separating it from the old user-level `is_credit_approved`/`credit_limit` which are now legacy
- `FOR UPDATE` row lock prevents race conditions on credit limit
- Credit usage is deducted within the same transaction as order creation (atomic)
- The `company_credit_transactions` table provides a full audit trail
- Company approval != credit approval; they are now fully separate workflows
- Only `company_admin`, `finance`, and `buyer` roles can apply for credit
- Internal review notes are never exposed to company users through customer-facing endpoints

### Critical Context
- Migration `migrate-company-credit.ts` has been run on dev DB (idempotent, 15 migrations total)
- The old `users.credit_limit`, `users.outstanding_balance`, `users.is_credit_approved` fields still exist but are no longer used for checkout enforcement
- The separate `POST /api/orders/credit` endpoint (`payments.ts`) still uses the old user-level credit fields but is not the primary credit path
- Credit expiration is enforced by `next_review_at` — if past, checkout rejects with "credit facility has expired"
- To give a company credit, admin must use `POST /admin/companies/:id/credit/approve` (NOT the company approval endpoint)

---

## Session 8: Credit Vetting Heuristic — Risk Assessment Layer

### Goal
Build a heuristic credit vetting service that analyzes company data and produces suggested risk level, suggested credit limit, and warnings/flags — purely advisory, no auto-approval.

### Done

1. **Vetting Service** (`backend/src/services/credit-vetting.ts`):
   - `assessCreditVetting(companyId)` — analyzes 6 weighted dimensions:
     - **Account Age** (10%): <30d → 0pts, 30-90d → 30, 90-180d → 55, 180-365d → 75, 365d+ → 100
     - **Profile Completeness** (15%): 9 fields (tax_id, reg_number, contact info, address, finance contact), scored by count present
     - **Order History** (30%): 0 orders → 0, 1-2 → 30, 3-5 → 55, 6-10 → 80, 10+ → 100
     - **Payment History** (25%): Overdue → 0, cancelled → 15, no payments → 20, has payments → varies
     - **Engagement Level** (10%): RFQs/quotations/accepted quotations → progressive scoring
     - **Sales Rep** (10%): Assigned → 100, not assigned → 0
   - Weighted total → risk level: ≥70 low, 40-69 medium, <40 high
   - Suggested credit limit: `min(requested * 0.5, avg_order_value * 3)` when no red flags; null otherwise
   - Warnings/flags: new company, no order history, overdue, cancelled orders, no sales rep, incomplete profile, requested limit exceeds spend, etc.

2. **Endpoint** (`GET /api/admin/companies/:id/credit/vetting`):
   - Returns full `VettingResult` with `suggestedRiskLevel`, `suggestedCreditLimit`, `warnings[]`, `scores{}`, `details{}`
   - Admin-only (403 for non-admin)
   - Read-only — does not modify DB state
   - Returns 404 for non-existent company

3. **Admin UI** (`/admin/companies/[id]/page.tsx`):
   - "Vetting" tab button in Credit Approval section
   - Risk level banner (green/amber/red with heuristic score %)
   - Suggested credit limit display or "Insufficient data" message
   - Score breakdown bars with 6 weighted dimensions
   - Warnings/flags list with amber warning icons
   - Collapsible "View details" with full data table
   - Disclaimer: "This assessment is heuristic only and does not auto-approve credit."

4. **API Client** (`frontend/src/lib/api.ts`):
   - `adminGetCreditVetting(companyId)` — typed response

5. **Tests** (`backend/src/__tests__/b2b-vetting.test.ts`, 11 tests):
   - Admin can run vetting; non-admin gets 403
   - 404 for non-existent company
   - Read-only (does not modify DB state)
   - New company → high risk + appropriate warnings
   - Established company with orders/payments → low risk + suggested limit
   - Overdue invoices flagged with payment score = 0
   - No sales rep → warning
   - Suggested limit based on avg order value
   - Cancelled orders → null suggested limit
   - Profile completeness reflects missing fields

### Files Created/Modified
- `backend/src/services/credit-vetting.ts` — Heuristic scoring engine (new)
- `backend/src/routes/admin.ts` — GET vetting endpoint
- `frontend/src/app/admin/companies/[id]/page.tsx` — Vetting UI tab
- `frontend/src/lib/api.ts` — `adminGetCreditVetting()` method
- `backend/src/__tests__/b2b-vetting.test.ts` — 11 vetting tests (new)

### Key Decisions
- Purely advisory — no DB mutation, no auto-approval
- Weighted scoring with 6 dimensions, each 10-30%
- Suggested limit uses `min(requested * 0.5, avg_order_value * 3)` — conservative starting point
- Warnings are deduplicated via `Set`
- Suggests null limit when there are red flags (overdue/cancelled) — admin must decide manually
- Profile completeness checks 9 fields: tax_id, reg_number, 3 contact person fields, address, 3 finance contact fields
- Test emails use unique suffixes (`Date.now()`) to avoid `ON CONFLICT` reusing stale users with orders from previous runs

### Critical Context
- `createTestUser` uses `ON CONFLICT (email) DO UPDATE SET company_id = EXCLUDED.company_id` — reusing an old test user email brings all their old orders to the new company. Use unique emails per test to avoid this.
- `cleanupTestData()` in `helpers.ts` does NOT clean orders with custom prefixes (only `ORD-TEST-%`), and cannot delete orders that have service_bookings FK references.
- The vetting results are purely heuristic — the admin should use them alongside their own judgment.
- Vetting is accessible at any time, regardless of the company's current credit_status.

### Key Decisions (continued)
- `canSeePrices` kept as auth gate (active user in good standing) — rename to `canAccessCustomerPricing` would be more accurate now but deferred
- Admin bypasses `applyCustomPricing` entirely → sees raw `product.price` (internal base)
- Cart/checkout/quick-order reject instead of silently creating orders with null prices
- Company_price entries explicitly created in security-hardening tests to prove hide_price still overrides

### Critical Context
- `applyCustomPricing` now always returns `price: null` when no explicit company/group price matches — never falls back to base price
- Only admin users see base prices through customer-facing API endpoints
- Cart, checkout, quick-order, reorder all validate that a price resolves before allowing the operation
- `product.price` column remains unchanged in DB — it's an internal reference, not a customer-facing price
- To give a customer a price, admin must create a `company_prices` entry (company-specific or group-specific)

---

### Critical Context
- Migration `migrate-quotation-pdfs.ts` has been run on dev DB (idempotent).
- `RESEND_API_KEY` is optional; if unset, email errors gracefully (no crash).
- `RESEND_FROM_EMAIL` defaults to `no-reply@yourdomain.com` if not set.
- `pdfkit` generates PDFs in-memory via stream — `generateQuotationPdf`/`generateInvoicePdf` are async (return `Promise<Buffer>`).
- 14 migrations total.
- `jose` Edge Runtime warnings from `next-auth` are pre-existing and unrelated.
- `ClientFetchError` (HTML response instead of JSON for `/api/auth/session`) is fixed by middleware matcher change (`api` instead of `api/auth`) and dev startup env-hash cache invalidation.
- Backend port 4000, frontend port 3000.

---

## Session 9: AI Discoverability & SEO Foundation

### Goal
Position Bali-Can for search engines and AI assistants (ChatGPT, Gemini, Perplexity, Copilot, Google AI Overviews) to understand, crawl, cite, and recommend the platform for HVAC, electrical, solar, appliances, and B2B procurement in Ghana.

### Done

1. **Root Layout Metadata Enhancement**
   - Added `metadataBase` (from `NEXT_PUBLIC_SITE_URL`)
   - Added title template: `%s | Bali-Can Limited`
   - Added OpenGraph (type, locale `en_GH`, siteName, default image)
   - Added Twitter card (summary_large_image)
   - Added icons (favicon, apple-touch-icon)
   - Added robots meta (index, follow)
   - Added canonical alternates

2. **Homepage JSON-LD Structured Data**
   - Organization schema (name, url, logo, address, contactPoint, sameAs)
   - WebSite schema with SearchAction (target: `/products?search={search_term_string}`)
   - All wrapped in `@graph` array

3. **Product Detail Page Enhancements**
   - BreadcrumbList JSON-LD (Home > Products > [Category] > Product)
   - BreadcrumbList JSON-LD with category link when available
   - Product schema moved into `@graph` with BreadcrumbList
   - Product schema omits `offers` entirely when `price === null` (no fake offers)
   - Added brand field when available
   - Visible breadcrumb nav with links and aria-label
   - Twitter card metadata in `generateMetadata`

4. **Product Listing Page Enhancements**
   - CollectionPage JSON-LD schema with isPartOf (WebSite)
   - Twitter card metadata

5. **RFQ Page** (`/rfq/new`)
   - Server component wrapper with full metadata (title, description, OG, Twitter, canonical)
   - Client component extracted to `rfq-page-client.tsx`

6. **Booking Page** (`/booking`)
   - Server component wrapper with full metadata
   - Client component extracted to `booking-page-client.tsx`

7. **Sitemap** (`sitemap.ts`)
   - Added static pages: `/rfq/new`, `/auth/login`, `/auth/register`
   - Added dynamic category pages (flattened tree, each as `/products?category={slug}`)
   - Fetch both products and categories in parallel with timeout
   - Error handling (silent catch if API unavailable)

8. **Robots** (`robots.ts`)
   - Already correctly excludes `/admin/`, `/api/`, `/auth/`
   - Already includes sitemap URL

9. **llms.txt** (`/llms.txt` route)
   - New route at `/llms.txt/route.ts`
   - Contains: who Bali-Can is, what it supplies/services, product categories, B2B procurement process, services offered, service area (all 16 Ghana regions), contact paths
   - Quote-first model clearly explained
   - No secrets, internal prices, private endpoints, or admin routes
   - Cache header: `public, max-age=3600`

10. **Category SEO Fields** (Admin-Content Hooks)
    - Migration `migrate-category-seo.ts`: added `seo_title` (VARCHAR(300)), `seo_description` (TEXT), `intro_text` (TEXT) to categories
    - Admin category CREATE accepts `seoTitle`, `seoDescription`, `introText`
    - Admin category UPDATE accepts the same fields
    - Product detail API returns `category_seo_title`, `category_seo_description`, `category_intro_text`

11. **Tests** (`b2b-seo.test.ts`, 7 tests)
    - Product JSON-LD omits offers when price is null (unauthenticated user)
    - Product JSON-LD does not expose internal base price (null for unauthenticated, visible for admin)
    - Quote-first pricing remains protected (unauthenticated sees null)
    - Product listing returns all products with slugs for sitemap generation
    - Categories endpoint returns only active categories with slugs for sitemap
    - Products API does not leak internal base price to unauthenticated
    - Public categories endpoint returns only active categories

### Files Created/Modified
- `frontend/src/app/layout.tsx` — Enhanced root metadata (metadataBase, title template, OG, Twitter, icons, robots)
- `frontend/src/app/page.tsx` — Organization + WebSite JSON-LD (`@graph`), homepage metadata
- `frontend/src/app/products/[slug]/page.tsx` — Product + BreadcrumbList JSON-LD (`@graph`), visible breadcrumbs, Twitter card, brand+category fields
- `frontend/src/app/products/page.tsx` — CollectionPage JSON-LD, Twitter card
- `frontend/src/app/rfq/new/page.tsx` — Server component wrapper with metadata (rewritten)
- `frontend/src/app/rfq/new/rfq-page-client.tsx` — Extracted client component
- `frontend/src/app/booking/page.tsx` — Server component wrapper with metadata (rewritten)
- `frontend/src/app/booking/booking-page-client.tsx` — Extracted client component
- `frontend/src/app/sitemap.ts` — Added categories, rfq, auth pages; parallel fetches with timeout
- `frontend/src/app/llms.txt/route.ts` — New llms.txt route with full company guide
- `backend/src/config/migrate-category-seo.ts` — New migration (17th: seo_title, seo_description, intro_text on categories)
- `backend/src/routes/admin.ts` — Category CREATE accepts seoTitle/seoDescription/introText; PATCH accepts all three
- `backend/src/routes/products.ts` — Product detail query includes category SEO fields
- `backend/src/__tests__/b2b-seo.test.ts` — 7 SEO/AI discoverability tests

### Key Decisions
- JSON-LD uses `@graph` array format for Product detail page (bundles Product + BreadcrumbList)
- `offers` is entirely omitted (not set to null) when price is null — per Schema.org validators
- rfq/new and booking pages split into server component (metadata) + client component (logic) because metadata is Server-only
- Sitemap fetches products + categories in parallel with `AbortSignal.timeout(10000)` to prevent hanging
- llms.txt stored as a Route Handler (not a static file) so it can reference dynamic `NEXT_PUBLIC_SITE_URL`
- Category SEO fields are admin-editable for content teams, not auto-generated
- No `opengraph-image.tsx` or `twitter-image.tsx` created yet — deferred to backlog
- No PWA manifest created — deferred to backlog

### Test Results
- **284/284 backend tests passing** (13 suites, including 7 new SEO tests)
- Backend TypeScript clean
- Frontend TypeScript clean
- Frontend build clean (next build succeeds)

### Critical Context
- The `product.price` returned from API is the resolved customer-facing price (null for unauthenticated/no custom pricing). The Product JSON-LD renders `offers` only when price is non-null.
- Category SEO fields (`seo_title`, `seo_description`, `intro_text`) require a DB migration that has been applied to dev.
- The robots.txt file is auto-generated by Next.js from `src/app/robots.ts` — already correct.
- llms.txt is served as a plain-text route (Content-Type: text/plain), ready for AI crawlers.
- Homepage Organization JSON-LD uses `${siteUrl}` resolved from `NEXT_PUBLIC_SITE_URL` env var.
- Sitemap includes both top-level categories and sub-categories via recursive flatten.
- rfq/new and booking are the only two `"use client"` pages that needed extraction to support metadata.

### Relevant New Files
- `frontend/src/app/llms.txt/route.ts` — `/llms.txt` AI guide
- `frontend/src/app/rfq/new/rfq-page-client.tsx` — RFQ client component
- `frontend/src/app/booking/booking-page-client.tsx` — Booking client component
- `backend/src/config/migrate-category-seo.ts` — Category SEO migration
- `backend/src/__tests__/b2b-seo.test.ts` — SEO/AI discoverability tests
