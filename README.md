# Bali-Can Limited — B2B Platform

Bali-Can Limited is a B2B solar energy equipment and installation platform. The platform enables businesses to browse products (solar panels, inverters, batteries, and accessories), request quotations, place orders, schedule service installations, and manage payments — including credit terms and bank transfers.

This monorepo contains a Next.js 15 frontend and an Express/TypeScript backend, sharing a PostgreSQL database with Elasticsearch-powered product search. Authentication uses JWT (backend) and Auth.js (frontend). Payments are handled through Paystack.

## Tech Stack

| Layer          | Technology                                                              |
| -------------- | ----------------------------------------------------------------------- |
| **Frontend**   | Next.js 15 (App Router), React 19, Tailwind CSS 4, Framer Motion        |
| **Backend**    | Express 4, TypeScript, Zod validation                                   |
| **Database**   | PostgreSQL 16 (via `pg`), Elasticsearch 8.17 (product search)           |
| **Auth**       | Auth.js 5 (NextAuth v5) — Credentials provider; JWT on backend          |
| **Payments**   | Paystack (card payments), Bank Transfer (manual verification)           |
| **Email**      | Resend (optional) — notifications logged to `email_logs` table          |
| **Infra**      | Docker Compose (PostgreSQL + Elasticsearch)                             |

## Prerequisites

- **Node.js** 18+ (with npm)
- **Docker** & **Docker Compose** (for local PostgreSQL + Elasticsearch)
- **Paystack** account (optional for development)

## Quick Start

```bash
# 1. Install dependencies (both frontend + backend via npm workspaces)
npm run install:all

# 2. Start the database and search engine
docker compose up -d

# 3. Copy and configure environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit these files with your values (see Environment Variables section)

# 4. Run all tracked database migrations
cd backend
npm run migrate                # Ordered PostgreSQL migrations with checksums
npm run migrate:es             # Elasticsearch product indices

# 5. Seed product catalog data
npm run seed

# 6. Start development servers (both frontend and backend)
npm run dev
```

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000/api
- **Liveness:** http://localhost:4000/api/health
- **Readiness:** http://localhost:4000/api/ready (database, complete schema, writable storage)

## Environment Variables

### Backend (`backend/.env`)

| Variable               | Required | Default                                   | Description                                                    |
| ---------------------- | -------- | ----------------------------------------- | -------------------------------------------------------------- |
| `PORT`                 | No       | `4000`                                    | Backend server port                                             |
| `NODE_ENV`             | No       | `development`                             | Environment mode (`development`, `production`, `test`)          |
| `DATABASE_URL`         | **Yes**  | `postgresql://sslplan:...@localhost:5432/sslplan` | PostgreSQL connection string                         |
| `JWT_SECRET`           | **Yes**  | —                                         | JWT signing key. Generate: `openssl rand -hex 32`               |
| `JWT_EXPIRES_IN`       | No       | `1h`                                      | Revocable backend access-session expiry                          |
| `PAYSTACK_SECRET_KEY`  | No\*     | —                                         | Paystack secret key. Required for live payments.                |
| `PAYSTACK_PUBLIC_KEY`  | No\*     | —                                         | Paystack public key. Required for frontend payment button.       |
| `RESEND_API_KEY`       | No       | —                                         | Resend API key for transactional emails.                        |
| `RESEND_FROM_EMAIL`    | No       | `no-reply@yourdomain.com`                 | From-address for transactional emails.                          |
| `ALERT_WEBHOOK_URL`    | **Yes** in production | —                              | HTTPS destination for critical readiness, payment, and email alerts. |
| `FRONTEND_URL`         | No       | `http://localhost:3000`                   | Frontend URL used for CORS and redirects; also used as base for PDF product links. |
| `ELASTICSEARCH_URL`    | No       | `http://localhost:9200`                   | Elasticsearch connection string                                  |
| `ADMIN_SECRET_KEY`     | No\*     | —                                         | Secret required to register admin accounts. Set a strong value. |
| `UPLOAD_STORAGE_DRIVER` | No      | `local`                                   | Storage driver for product images (`local`). For production, consider S3-compatible object storage instead. |
| `UPLOAD_DIR`           | No       | `uploads`                                 | Directory for local file storage (only used with `local` driver)    |
| `PUBLIC_UPLOAD_BASE_URL` | No     | `http://localhost:4000/uploads`            | Public URL prefix for uploaded files (only used with `local` driver) |
| `UPLOAD_MAX_IMAGE_SIZE` | No      | `5242880`                                 | Max image size in bytes (default 5MB)                              |

\*Required only for the corresponding feature in production.

> **Production storage note:** The `local` driver stores images on the server filesystem at `UPLOAD_DIR`. This is suitable for development or single-server deployments with persistent VPS disks. For horizontally-scaled production deployments, implement an S3-compatible driver (e.g., AWS S3, DigitalOcean Spaces, MinIO) or use an external image service (Cloudinary, Bunny Storage). Videos should remain externally hosted through YouTube, Vimeo, or a dedicated video platform (Cloudflare Stream, Bunny, Mux).

### Frontend (`frontend/.env.local`)

| Variable                       | Required | Default                  | Description                                      |
| ------------------------------ | -------- | ------------------------ | ------------------------------------------------ |
| `AUTH_SECRET`                  | **Yes**  | —                        | Auth.js session encryption. Generate: `openssl rand -base64 32` |
| `AUTH_URL`                     | **Yes**  | —                        | Canonical site URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL`          | **Yes**  | —                        | Backend API base URL (e.g. `http://localhost:4000/api`) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | No   | —                        | Paystack public key for frontend payment button   |

## Project Structure

```
sslplan/
├── backend/
│   ├── src/
│   │   ├── config/           # DB connection, migrations, env config
│   │   ├── controllers/      # Route handlers (inlined in routes)
│   │   ├── middleware/       # auth (JWT verify), security (helmet, rate-limit), validation
│   │   ├── routes/           # Express route files
│   │   │   ├── admin.ts      # Dashboard, customer management, product CRUD
│   │   │   ├── analytics.ts  # Search tracking, popular products
│   │   │   ├── auth.ts       # Login, register, profile
│   │   │   ├── bookings.ts   # Service booking CRUD
│   │   │   ├── crm.ts        # Leads, stages, tasks, pipeline
│   │   │   ├── orders.ts     # Orders, Paystack init, payments
│   │   │   ├── payments.ts   # Bank transfer routes, webhook
│   │   │   ├── products.ts   # Product catalog, categories
│   │   │   ├── quotations.ts # Customer-facing quotation actions
│   │   │   └── rfqs.ts       # Request for quotation
│   │   ├── services/         # Elasticsearch client, notification/email logging, PDF generation
│   │   ├── types/            # TypeScript type definitions
│   │   ├── utils/            # Helpers (slugify, order number gen)
│   │   ├── __tests__/        # Jest test suites
│   │   ├── app.ts            # Express app setup
│   │   └── index.ts          # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── account/      # Customer dashboard (orders, bookings, billing, RFQs)
│   │   │   ├── admin/        # Admin dashboard (customers, products, orders, bookings,
│   │   │   │                 #   quotations, RFQs, payments, bank transfers, analytics,
│   │   │   │                 #   categories, credit customers, overdue orders)
│   │   │   ├── auth/         # Login, register
│   │   │   ├── booking/      # Service booking form
│   │   │   ├── orders/       # Order detail view
│   │   │   ├── products/     # Product listing and detail pages
│   │   │   ├── rfq/          # New RFQ form
│   │   │   ├── layout.tsx    # Root layout with navbar
│   │   │   ├── page.tsx      # Homepage
│   │   │   ├── navbar.tsx    # Navigation component
│   │   │   ├── robots.ts     # SEO robots.txt
│   │   │   └── sitemap.ts    # SEO sitemap
│   │   ├── components/       # Reusable UI (carousel, featured products, hero, testimonials, admin)
│   │   ├── lib/              # API client, Auth.js config, providers, utilities
│   │   ├── types/            # TypeScript type extensions (next-auth)
│   │   └── middleware.ts     # Route protection (admin, authenticated user)
│   ├── package.json
│   └── next.config.js
├── docker-compose.yml        # PostgreSQL 16 + Elasticsearch 8.17
├── package.json              # Root workspace config (frontend + backend)
└── README.md
```

## Backend API

- **Base URL:** `http://localhost:4000/api` (configurable via `PORT` and `NEXT_PUBLIC_API_URL`)
- **Auth:** Bearer token obtained from `POST /api/auth/login`
- **Public routes:** `GET /api/products`, `GET /api/products/:slug`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/orders/paystack-webhook`
- **Authenticated routes:** Customer account, orders, bookings, RFQs
- **Admin routes:** Prefixed with `/api/admin`, `/api/crm`, `/api/analytics` — protected by `requireAdmin` middleware (roles: `admin`, `super_admin`)
- **Rate limiting:** 100 requests per 15 min globally; 10 requests per 15 min on auth routes

### Route Groups

| Group          | Prefix                  | Key Endpoints                                                       |
| -------------- | ----------------------- | ------------------------------------------------------------------- |
| **Auth**       | `/api/auth`             | register, login, me, profile                                        |
| **Products**   | `/api/products`         | list, detail, categories, bulk-import                               |
| **RFQs**       | `/api/rfqs`             | create, list, detail, status update                                 |
| **Orders**     | `/api/orders`           | create, list, detail, status, payments, paystack-init, bank-transfer, from-quotation |
| **Bookings**   | `/api/bookings`         | eligibility, create, list, admin CRUD, reschedule, notes            |
| **Admin**      | `/api/admin`            | dashboard, customers, products CRUD, categories CRUD, quotations, payments, bank transfers |
| **CRM**        | `/api/crm`              | lead stages, leads, tasks, pipeline, activities, customer timeline  |
| **Analytics**  | `/api/analytics`        | track-search, track-view, popular-searches, search-volume           |
| **Quotations** | `/api/customer/quotations` | list, detail, view, accept, reject                               |
| **Quotations** | `/api/admin/quotations/:id/send` | Send quotation PDF email + snapshot product links           |
| **Invoices**   | `/api/orders/admin/invoices/:id/send` | Resend invoice PDF email                                  |
| **Payments**   | `/api/orders/paystack-webhook` | Paystack webhook handler (HMAC-signed, raw-body)               |
| **B2B**        | `/api/cart`                    | Cart CRUD (items, checkout)                                  |
| **B2B**        | `/api/quick-order`             | Quick order by SKU or CSV upload                             |
| **B2B**        | `/api/reorder/:orderId`        | Reorder from previous order                                  |
| **B2B**        | `/api/store-credit`            | Customer store credit balance & history                      |
| **B2B**        | `/api/admin/store-credit/:id`  | Admin store credit adjustment                                |
| **B2B**        | `/api/payment-methods`         | Company-specific payment method list                         |
| **B2B**        | `/api/admin/company-payment-methods` | Admin payment method restrictions per company           |
| **B2B**        | `/api/shipping-methods`        | Available shipping methods for company                       |
| **B2B**        | `/api/admin/shipping-methods`  | Admin shipping method CRUD + company assignments             |
| **B2B**        | `/api/admin/variants/:productId` | Admin product variant CRUD                                |
| **B2B**        | `/api/admin/option-types`      | Admin option type/value CRUD                                 |
| **B2B**        | `/api/admin/procurement-lists` | Admin procurement list view                                  |
| **B2B**        | `/api/admin/companies`         | Company CRUD + approve/reject + sub-user management          |
| **Media**      | `/api/admin/products/:id/media` | Product media gallery — list, upload images, add video links, set primary, reorder, delete, update metadata |
| **Media**      | `/api/admin/products/:id/media/images` | Upload multiple product images (multipart, 5MB limit, JPEG/PNG/WebP) |
| **Media**      | `/api/admin/products/:id/media/videos` | Add YouTube/Vimeo external video link                    |
| **Media**      | `/api/admin/products/:id/media/:mediaId/primary` | Set image as primary (videos cannot be primary)      |
| **Media**      | `/api/admin/products/:id/media/reorder` | Bulk-reorder media by sort order                      |
| **Media**      | `/api/admin/products/:id/media/:mediaId` | PATCH: update alt_text, title, sort_order, thumbnail_url; DELETE: remove media |

## API Coverage

The entire API is **REST-based**. There is no GraphQL layer currently — it is on the future roadmap as an optional integration for complex data fetching (see *Roadmap*). Content management is handled directly via admin REST endpoints; no separate CMS module exists.

## Database

### PostgreSQL

The database runs in Docker (see `docker-compose.yml`). Key tables:

| Table                 | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `users`               | Customers, admins, sales, ops — with roles and credit |
| `addresses`           | User shipping/billing addresses                       |
| `categories`          | Product categories (solar panels, inverters, etc.)    |
| `products`            | Product catalog with pricing, specs, variants         |
| `product_images`      | Product image gallery                                 |
| `product_attributes`  | Key-value product attributes                          |
| `rfqs`                | Requests for quotation                                |
| `quotations`          | Quotations linked to RFQs                             |
| `quotation_items`     | Line items within quotations                          |
| `quotation_events`    | Audit trail for quotation lifecycle                   |
| `orders`              | Customer orders with payment tracking                 |
| `order_payments`      | Manual payment records                                |
| `payments`            | Payment records                                       |
| `invoices`            | Invoices generated from orders                        |
| `bank_transfers`      | Bank transfer submissions for manual verification      |
| `service_bookings`    | Service installation bookings                         |
| `leads`               | CRM leads                                             |
| `lead_stages`         | CRM pipeline stages (New → Won/Lost)                  |
| `activities`          | Activity feed for CRM and entity audit trails         |
| `tasks`               | CRM tasks                                             |
| `email_logs`          | Notification/email event log                          |
| `companies`           | B2B company accounts (status, group, credit, sales rep) |
| `customer_groups`     | Pricing tiers (Standard, Silver, Gold, Platinum)       |
| `company_prices`      | Company-specific & group-specific custom pricing       |
| `product_variants`    | Configurable product variants (SKU, price, options)    |
| `option_types`        | Variant option types (Size, Color, etc.)               |
| `option_values`       | Values for each option type                            |
| `product_attachments` | Product media gallery (images + video links) with `media_type`, `is_primary`, `embed_url`, `thumbnail_url` |
| `carts`               | B2B shopping carts per user                            |
| `cart_items`          | Items within carts                                     |
| `quick_orders`        | Quick order audit log                                  |
| `store_credit_transactions` | Store credit adjustment audit trail              |
| `company_payment_methods` | Per-company payment method restrictions            |
| `shipping_methods`    | Available shipping methods                             |
| `company_shipping_methods` | Per-company shipping assignments + custom rates    |
| `procurement_lists`   | Company procurement list headers                       |
| `procurement_list_items` | Items within procurement lists                      |

Run all PostgreSQL migrations through the tracked migration runner:
```bash
cd backend
npm run migrate
```

The runner applies all PostgreSQL migrations in dependency order, records checksums in
`schema_migrations`, and fails if an applied migration is edited. Elasticsearch indexing remains
a separate optional step: `npm run migrate:es`.

A `npm run seed` command is available to populate the product catalog with sample data (solar panels, inverters, batteries, etc.).

### Elasticsearch

Elasticsearch 8.17 runs in Docker with security disabled (`xpack.security.enabled=false`) for local development. The `products` index is created and populated by `npm run migrate:es`. Product search queries are routed through the backend API and indexed with fields: `name`, `description`, `category_name`, `price`, `stock_status`, `image`.

## Frontend

### Pages

| Route                | Access     | Description                          |
| -------------------- | ---------- | ------------------------------------ |
| `/`                  | Public     | Homepage with hero, featured products, testimonials |
| `/products`          | Public     | Product catalog with search & filter |
| `/products/[slug]`   | Public     | Product detail page                   |
| `/auth/login`        | Guest      | Customer login                        |
| `/auth/register`     | Guest      | Customer registration                 |
| `/account`           | Auth       | Customer dashboard                    |
| `/account/orders`    | Auth       | Customer order history                |
| `/account/billing`   | Auth       | Billing & credit summary              |
| `/account/bookings`  | Auth       | Service booking history               |
| `/account/rfqs`      | Auth       | Customer RFQs                         |
| `/orders/[id]`       | Auth       | Order detail with payment             |
| `/booking`           | Auth       | Create service booking                |
| `/rfq/new`           | Auth       | Submit request for quotation          |
| `/admin/login`       | Guest      | Admin login                           |
| `/admin/register`    | Guest      | Admin registration (requires secret)  |
| `/admin`             | Admin      | Admin dashboard with stats            |
| `/admin/products`    | Admin      | Product CRUD                          |
| `/admin/categories`  | Admin      | Category management                   |
| `/admin/orders`      | Admin      | Order management                      |
| `/admin/quotations`  | Admin      | Quotation management                  |
| `/admin/rfqs`        | Admin      | RFQ management                        |
| `/admin/bookings`    | Admin      | Booking management                    |
| `/admin/customers`   | Admin      | Customer management & credit          |
| `/admin/credit-customers` | Admin | Credit customer management            |
| `/admin/payments`    | Admin      | Payment & bank transfer verification  |
| `/admin/bank-transfers` | Admin   | Bank transfer approval               |
| `/admin/analytics`   | Admin      | Analytics dashboard                   |
| `/admin/overdue-orders` | Admin   | Overdue credit orders                 |
| `/admin/companies`      | Admin   | Company list with search/filter/pagination |
| `/admin/companies/[id]` | Admin   | Company detail — approve/reject, assign sales rep, manage sub-users, set credit/pricing |
| `/account/quick-order`  | Auth    | Quick order by SKU entry              |
| `/cart`                 | Auth    | Shopping cart                          |
| `/account/store-credit` | Auth    | Store credit balance & history         |

### Components

- `ProductMediaGallery.tsx` — Customer-facing product image/video gallery with main display + thumbnail strip
- `admin/ProductMediaGallery.tsx` — Admin product media management with upload, video links, reorder, set primary, edit metadata, and delete

### Media Gallery

Products support a full media gallery with multiple images and external video links.

**Images:**
- Uploaded via the admin panel (multipart, 5MB limit)
- Supported formats: JPEG, PNG, WebP
- Stored locally in `UPLOAD_DIR` (default: `uploads/`)
- First uploaded image auto-set as primary
- Only images can be primary (not videos)
- Used on product cards/listings as `primary_image`

**Videos:**
- Added as external YouTube/Vimeo links — no binary uploads
- Backend converts URLs to safe embed URLs and generates YouTube thumbnails automatically
- Supported providers: YouTube (watch, youtu.be, shorts, embed), Vimeo
- Displayed as embedded iframes on the product detail page
- Videos are not shown on product cards/listings

**API Response:**
- Product detail returns `media` (combined), `images` (filtered), `videos` (filtered), and `primary_image`
- Product listing returns `primary_image` for each product
- `hero-carousel.tsx` — Homepage hero slider
- `featured-products.tsx` — Featured product grid
- `testimonial-carousel.tsx` — Customer testimonials
- `admin/` — Admin-specific UI components

### Authentication Flow

1. Auth.js submits credentials server-side to `POST /api/auth/login`
2. Backend creates a revocable one-hour session and returns its signed token to Auth.js
3. Auth.js stores the backend credential only inside its encrypted HttpOnly session cookie
4. Browser API calls use the same-origin `/backend-api/*` proxy
5. The proxy attaches the backend credential server-side; browser JavaScript never receives it
6. Protected backend requests load current role and account/company status from PostgreSQL

Company registration creates the company and initial company-admin user in one database transaction. Welcome notifications run after commit and do not invalidate an otherwise successful registration.

### Observability

- Every response includes `X-Request-ID`; valid client-supplied IDs are propagated.
- API completion and unhandled-error logs are emitted as redacted JSON with latency, status, request ID, and authenticated user/company IDs when available.
- Critical readiness, Paystack mismatch, and email-delivery events are sent to `ALERT_WEBHOOK_URL` with a one-minute duplicate-alert cooldown.
- Error responses handled by the central middleware include the request ID for support correlation.

## Testing

Tests use Jest with Supertest. They run against a real database — ensure PostgreSQL is running.

```bash
cd backend
npm test                       # Run all tests (--forceExit --detectOpenHandles)
npm run test:payments          # Payment integration tests
npm run test:bookings          # Booking integration tests
npm test -- --watch            # Watch mode
npm run test:verbose           # Verbose output
```

**Current test status:** 137/137 passing across 7 suites. Backend TypeScript clean, frontend build clean.

Test files: `backend/src/__tests__/`

| Suite                    | Tests | Coverage                              |
| ------------------------ | ----- | ------------------------------------- |
| `payments.test.ts`       | 23    | Orders, Paystack webhook, overdue detection, credit transactions |
| `b2b-security.test.ts`   | 38    | Quote-first pricing, guest RFQ, company isolation |
| `b2b-pdf-email.test.ts`  | 16    | Quotation/invoice PDF email flow, product links, resend |
| `bookings.test.ts`       | 26    | Service booking CRUD, scheduling, eligibility |
| `order-types.test.ts`    | 15    | Service order types, status transitions |
| `customers.test.ts`      | 13    | Customer CRUD, credit management |
| `concurrency.test.ts`    | 6     | Transaction isolation, race condition guards |

## Build Commands

```bash
# Backend — compile TypeScript to dist/
cd backend && npm run build

# Frontend — Next.js production build
cd frontend && npm run build

# TypeScript type checking
cd backend && npm run typecheck
```

## Paystack Webhook Setup

1. Go to [Paystack Dashboard → Settings → Webhooks](https://dashboard.paystack.com/#/settings/developer)
2. Add URL: `https://your-domain.com/api/orders/paystack-webhook`
3. The webhook handles `charge.success` events to mark orders as paid
4. In development, webhook behavior is covered by integration tests
5. Paystack signature verification is skipped when `PAYSTACK_SECRET_KEY` is empty (dev mode)

## Roadmap & Limitations

| Area | Status | Notes |
|------|--------|-------|
| **CMS / Content Management** | N/A | No CMS module exists. Content (products, categories, pages) is managed via admin REST endpoints directly against PostgreSQL. A headless CMS (Strapi, Sanity) can be integrated in the future. |
| **GraphQL API** | Backlog | The API is fully REST-based. GraphQL is not implemented. If needed, a future integration (e.g., Apollo Server wrapper) could be added to serve complex nested B2B queries. |
| **Inventory / Stock Tracking** | Partial | Products track `stock_status` (in_stock / out_of_stock) but there is no real-time inventory deduction on order placement. |
| **Multi-currency** | Not implemented | All pricing is in GH₵ (Ghana Cedi). Future: add currency table + exchange rate support. |

## Admin Registration & Security

- Admin registration requires `ADMIN_SECRET_KEY` set in `backend/.env`
- Register at `/admin/register` with email, password, and the admin secret key
- Admin roles: `admin`, `super_admin`
- All admin API routes are protected by the `requireAdmin` middleware (`backend/src/middleware/auth.ts:32`)
- Rate limiting applies to auth routes (10 requests per 15 min) via `authLimiter`
- Global API rate limit: 100 requests per 15 min
- Security headers are applied via Helmet
- CORS is restricted to `FRONTEND_URL` and `http://localhost:3000`

## Notification / Email Logs

### Supplier opportunity reminders

Run the idempotent reminder job hourly in production. It sends one reminder per
matching provider for open sourcing requests that are at least 24 hours old and
still have no response from that provider:

```bash
npm --workspace backend run reminders:opportunities
```

An authenticated super-admin can trigger the same job with
`POST /api/super-admin/opportunities/send-reminders`. Repeated runs are safe;
the notifications table's unique deduplication key prevents duplicate reminders.

All key events are logged to the `email_logs` table:

| Event Type                         | Description                          |
| ---------------------------------- | ------------------------------------ |
| `user.registered`                  | New user signup                      |
| `order.created`                    | Order placed                         |
| `order.updated`                    | Order status change                  |
| `quotation.created`                | Quotation drafted                    |
| `quotation.sent`                   | Quotation sent to customer (PDF attachment via Resend)           |
| `quotation.accepted`               | Customer accepted quotation          |
| `quotation.rejected`               | Customer rejected quotation          |
| `payment.verified`                 | Paystack payment confirmed           |
| `payment.bank_transfer_submitted`  | Customer submitted bank transfer     |
| `payment.bank_transfer_approved`   | Admin approved bank transfer         |
| `booking.requested`                | Customer requested service booking   |
| `booking.confirmed`                | Booking confirmed by admin           |
| `booking.completed`                | Service completed                    |
| `rfq.submitted`                    | Customer submitted RFQ               |
| `customer.credit_updated`          | Admin updated credit limit           |

- **Status values:** `pending` (queued), `sent` (delivered), `failed` (error)
- SMTP/Resend integration is optional — email sending is disabled when `RESEND_API_KEY` is empty, but all notifications are still persisted to the database
- The notification service is at `backend/src/services/notifications.ts`

## PDF Email Delivery

Quotation and invoice PDFs are generated server-side using **pdfkit** and attached to transactional emails sent via **Resend**.

| Flow | Endpoint | Description |
| ---- | -------- | ----------- |
| **Quotation send** | `POST /api/admin/quotations/:id/send` | Generates a branded quotation PDF with line items, totals, and per-product "View Product" links. Snapshots `product_slug`/`product_url` on each `quotation_item` at send time for stable historical PDFs. Marks quotation `sent` and updates RFQ to `quote_sent` only after email succeeds (fail-closed). Logs to `email_logs`. |
| **Invoice on order conversion** | `POST /api/orders/from-quotation/:id` | Converts an accepted quotation to an order + invoice, generates an invoice PDF, and emails it. Email failures are logged but do not roll back the conversion — a "Resend Invoice" action is available. |
| **Manual invoice resend** | `POST /api/orders/admin/invoices/:id/send` | Regenerates and re-emails an invoice PDF. Each attempt is logged to `email_logs`. |

**Important:** PDFs include clickable product links using `FRONTEND_URL` as the base domain. These links point to public product pages (`/products/[slug]`) and never expose prices to unauthenticated or pending/rejected company users.

**Dependencies:** `pdfkit` (server-side PDF generation), `Resend` (email delivery). Configure via `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `FRONTEND_URL` in `backend/.env`.

## Docker Compose

The `docker-compose.yml` starts two services:

- **PostgreSQL 16** (`db`): Port 5432, persistent volume `pgdata`, credentials `sslplan:sslplan_dev`
- **Elasticsearch 8.17** (`es`): Port 9200, single-node, security disabled, persistent volume `esdata`, 512MB heap

Start with: `docker compose up -d`
Stop with: `docker compose down`

## Scripts Reference

| Command                              | Works in     | Description                          |
| ------------------------------------ | ------------ | ------------------------------------ |
| `npm run dev`                        | Root         | Start both frontend + backend in dev |
| `npm run install:all`               | Root         | Install all workspace dependencies    |
| `npm run dev`                        | backend      | `tsx watch src/index.ts`              |
| `npm run build`                      | backend      | `tsc`                                 |
| `npm start`                          | backend      | `node dist/src/index.js`             |
| `npm run migrate`                    | backend      | All tracked PostgreSQL migrations     |
| `npm run migrate:core`               | backend      | Legacy core migration only            |
| `npm run migrate:es`                 | backend      | Elasticsearch index                   |
| `npm run seed`                       | backend      | Seed product catalog                   |
| `npm test`                           | backend      | Run all Jest tests                     |
| `npm run test:verbose`               | backend      | Run tests with verbose output          |
| `npm run typecheck`                  | backend      | TypeScript type checking               |
| `npm run dev`                        | frontend     | `next dev`                             |
| `npm run build`                      | frontend     | `next build`                           |
| `npm run start`                      | frontend     | `next start`                           |
| `npm run lint`                       | frontend     | `next lint`                            |
