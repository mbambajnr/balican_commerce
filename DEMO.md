# Phase 1 Demo — Bali-Can Limited B2B Industrial Platform

> **Duration**: ~15 minutes · **Stakeholder walkthrough** of the complete money loop from product browse to service completion.

---

## Prerequisites

| Item | Check |
|---|---|
| App running at `http://localhost:3000` (frontend) and `http://localhost:4000` (backend) | |
| A **customer account** registered at `/auth/register` (e.g. `customer@demo.com` / `Demo123!`) | |
| An **admin account** registered at `/admin/register` (e.g. `admin@demo.com` / `Admin123!`) | |
| At least **one product** in a **published category** (seeded or created via `/admin/products/new`) | |
| Customer has **credit approved** by admin via `/admin/credit-customers` (for Step 8) | |

---

## Step 1 — Customer Browses Products

| Field | Detail |
|---|---|
| **Actor** | Customer (logged out or logged in) |
| **Navigation** | Visit `/` (homepage), then click "Products" in navbar or visit `/products` |
| **Action** | (a) See hero carousel, featured products, and service cards on homepage. (b) Click **Products** in nav → `/products`. (c) Use the **search bar** to type a product name. (d) Use the **category dropdown** to filter by category. (e) Click any product card → `/products/[slug]`. |
| **Expected Result** | Product listing page shows a grid of cards with image, category badge, name, price, and stock status. Detail page shows full description, attributes list, images gallery, and action buttons (Pay Now, Buy on Credit, Request Quote). |
| **Verification** | URL changes to `/products/[slug]`. Product name matches what was clicked. Price and stock status are displayed. The "Request Quote" button is visible. |

---

## Step 2 — Customer Submits RFQ

| Field | Detail |
|---|---|
| **Actor** | Customer (must be logged in) |
| **Navigation** | From product detail page, click **Request Quote** button (pre-filled with product) OR visit `/rfq/new` directly |
| **Action** | (a) Select a **product** from the dropdown (pre-filled if coming from product page). (b) Enter **quantity** (e.g. 10). (c) Fill in **Delivery Requirements** (e.g. "Deliver to Lagos port, Week 22"). (d) Add **Additional Notes** as needed. (e) Click **Submit RFQ** button. |
| **Expected Result** | Toast "RFQ submitted". Browser redirects to `/account/rfqs` showing the new RFQ in the table with status `pending`. |
| **Verification** | In the RFQs table, the new row shows the product name, quantity, status `pending`, and today's date. Click **View** → `/account/rfqs/[id]` shows full RFQ detail with "No quotation received yet" message. |

---

## Step 3 — Admin Creates & Sends Quotation

| Field | Detail |
|---|---|
| **Actor** | Admin |
| **Navigation** | (a) Visit `/admin/login` → enter admin credentials → redirects to `/admin`. (b) Click **RFQs** in the Quick Manage section or visit `/admin/rfqs`. |
| **Action** | (a) See the RFQ table. Locate the customer's RFQ (status `pending`). Click **View** → `/admin/rfqs/[id]`. (b) Click **Create Quotation** button — a form panel appears. (c) Fill in **line items** (description, qty, unit price), adjust **Discount**, **Tax**, **Service Fee**, **Delivery Fee** as needed. Set **Valid Until** date. Add **Terms & Conditions** and **Notes to Customer**. (d) Click **Create Draft** button. (e) The quotation appears in the quotations list below with status `draft`. Click **Send** button on the quotation card. |
| **Expected Result** | After creating draft: quotation card shows with status `draft`, `Edit` / `Send` / `Cancel Draft` buttons visible. After sending: status changes to `sent`, RFQ status changes to `quote_sent`. A notification is logged to `email_logs` with event type `quotation.sent`. |
| **Verification** | The quotation card line items, subtotals, and total match what was entered. Timeline section shows "Draft quotation created" and "Quotation sent to customer" events. |

---

## Step 4 — Customer Accepts Quotation

| Field | Detail |
|---|---|
| **Actor** | Customer |
| **Navigation** | Visit `/account/rfqs` → click **View** on the RFQ → `/account/rfqs/[id]` |
| **Action** | (a) See the "Quotation Response" card with full pricing breakdown. (b) Click **Mark as Viewed** button (status changes to `viewed`). (c) Review terms and valid-until date. (d) Click **Accept Quotation** button → confirm in the browser dialog. |
| **Expected Result** | Toast "Quotation accepted!". Quotation status changes to `accepted`. RFQ status changes to `accepted`. A notification is logged with event type `quotation.accepted`. The Accept/Reject buttons disappear and the quotation shows a `badge-green` accepted badge. |
| **Verification** | The quotation card now shows status `accepted`. The timeline shows "Customer accepted quotation" event. Admin can see the same update by refreshing `/admin/rfqs/[id]`. |

---

## Step 5 — Admin Converts Quotation to Order

| Field | Detail |
|---|---|
| **Actor** | Admin |
| **Navigation** | Visit `/admin/rfqs` → click **View** on the accepted RFQ → `/admin/rfqs/[id]` |
| **Action** | (a) Verify the quotation shows status `accepted`. (b) Run the conversion by calling the API directly (or via a button if exposed in the UI — in this demo, use the API endpoint): `POST /api/orders/from-quotation/:quotationId`. This converts the accepted quotation into a **credit order**, creates an invoice, and updates the customer's outstanding balance. |
| **Expected Result** | A new order is created with `payment_method=credit`, `payment_status=unpaid`. A new invoice is created with `status=issued`. The quotation status changes to `converted_to_order`. The customer's `outstanding_balance` increases by the order total. |
| **Verification** | Admin can see the new order at `/admin/orders`. Customer can see it at `/account/orders` with order number, total, and status `pending` / payment `unpaid`. |

---

## Step 6 — Customer Submits Bank Transfer

| Field | Detail |
|---|---|
| **Actor** | Customer |
| **Navigation** | Visit `/account/orders` → click the order number link → `/account/orders/[id]/payment` |
| **Action** | (a) See the order summary card (total, paid, outstanding, method). (b) Scroll to the **Submit Bank Transfer** section. (c) Enter **Amount** (e.g. full order total). (d) Enter **Bank Name** (e.g. "GTBank"). (e) Enter **Account Name** (e.g. "ACME Corp"). (f) Enter **Transfer Reference** (e.g. "GTB-1234567890"). (g) Click **Submit Transfer Details**. |
| **Expected Result** | Toast "Bank transfer submitted for verification". A new record is created in `bank_transfers` table with `status=pending_verification`. An activity log entry `bank_transfer.submitted` is created. A notification is logged with event type `payment.bank_transfer_submitted`. |
| **Verification** | Admin can see the pending transfer at `/admin/bank-transfers` in the **Pending** tab — shows amount, bank, reference, customer name, and order number. |

---

## Step 7 — Admin Approves Payment

| Field | Detail |
|---|---|
| **Actor** | Admin |
| **Navigation** | Visit `/admin/bank-transfers` |
| **Action** | (a) See the **Pending** tab with the customer's transfer card. (b) Review the details (amount, bank, reference, date). (c) Click **Approve** button. |
| **Expected Result** | Toast "Bank transfer approved". Transfer status changes to `successful`. Order `payment_status` changes to `paid`, `amount_paid` updated, `outstanding_amount` = 0. Invoice status updates to `paid` with `paid_at` timestamp. Customer's `outstanding_balance` decreases by the amount. An activity log `bank_transfer.approved` and `invoice.paid` are created. Notification sent with event type `payment.bank_transfer_approved`. |
| **Verification** | The transfer moves to the **Approved** tab. Order at `/admin/orders` shows `payment_status=paid`. Invoice at `/admin/orders/[id]/payments` shows status `paid`. |

---

## Step 8 — OR: Customer Places Direct Credit Order

> *Alternative path to Step 6–7: skip bank transfer, use credit directly.*

| Field | Detail |
|---|---|
| **Actor** | Customer (must have credit approved by admin) |
| **Navigation** | Visit `/products/[slug]` |
| **Action** | (a) On the product detail page, click **Buy on Credit** button. (b) The system checks credit approval and available credit limit. (c) If approved, a credit order is created instantly. |
| **Expected Result** | Toast "Order placed on credit". Order created with `payment_method=credit`, `payment_status=unpaid`. Invoice created with `status=issued` and `due_date` = 30 days out. Customer's `outstanding_balance` increases by total. Notification event `payment.credit_order_created` is logged. |
| **Verification** | Customer sees order at `/account/orders` with method `credit` and status `pending`. Admin sees it at `/admin/orders` with method `credit`. Invoice lists as `issued`. |

---

## Step 9 — Invoice Updates to Paid

| Field | Detail |
|---|---|
| **Actor** | System (auto after Step 7) |
| **Navigation** | Admin: `/admin/orders/[id]/payments` · Customer: `/account/orders/[id]/payment` |
| **Action** | (No manual action — happens when bank transfer is approved in Step 7 or payment is recorded.) |
| **Expected Result** | Invoice status changes from `pending_payment` / `issued` to `paid`. The `paid_at` column is populated with a timestamp. `activities` table logs `invoice.paid`. A notification `payment.verified` or similar is sent to the customer. |
| **Verification** | In the admin order payments page, the Invoice section shows `badge-green` status `paid` and a paid date. Customer's payment page shows "Paid in Full" green card. |

---

## Step 10 — Customer Books Service

| Field | Detail |
|---|---|
| **Actor** | Customer |
| **Navigation** | Visit `/booking` (or click **Book Service** on the homepage `/` or account page `/account`) |
| **Action** | (a) See the "Book Installation Service" form. (b) Select the **paid order** from the dropdown (only paid or credit-eligible orders appear). (c) Select **Preferred Date** and **Preferred Time** slot. (d) Select **Service Type** (Installation / Maintenance / Repair / Consultation). (e) Enter **Installation Location** (full address). (f) Verify **Contact Name** and **Contact Phone** (pre-filled from profile). (g) Add any **Notes**. (h) Click **Book Service** button. |
| **Expected Result** | Toast "Service booking submitted". Redirected to `/account/bookings` showing the new booking with status `requested`. A notification is logged with event type `booking.requested`. |
| **Verification** | Booking table shows order number, preferred date, location, status `requested`. Admin can see it at `/admin/bookings` with status `requested`. |

---

## Step 11 — Admin Confirms, Starts & Completes Booking

| Field | Detail |
|---|---|
| **Actor** | Admin |
| **Navigation** | Visit `/admin/bookings` |
| **Action** | (a) See the booking in the `requested` tab. Click **Confirm** → status changes to `confirmed`, notification `booking.confirmed` logged. (b) Booking moves to `confirmed` tab. Click **Start** → status changes to `in_progress`, notification `booking.in_progress` logged. (c) Booking moves to `in_progress` tab. Click **Complete** → status changes to `completed`, `completed_at` timestamp set, notification `booking.completed` logged. |
| **Expected Result** | **Confirmed**: Status badge changes to `confirmed`. **In Progress**: Status badge changes to `in_progress`. **Complete**: Status badge changes to `completed`, `completed_at` populated. At each transition, a notification is logged in `email_logs` and an activity is recorded. |
| **Verification** | Admin can view the full booking timeline at `/admin/bookings/[id]`. Customer sees updated status at `/account/bookings/[id]`. The admin notes section can be used to add internal comments. |

---

## Step 12 — System Notifications (email_logs)

| Field | Detail |
|---|---|
| **Actor** | System |
| **Navigation** | Backend only: query the `email_logs` table directly (or build a simple admin viewer) |
| **Action** | Throughout the demo, every key event triggers `notifyAndLog()` which writes to the `email_logs` and `activities` tables. |
| **Expected Result** | The following records should exist (query: `SELECT * FROM email_logs ORDER BY created_at DESC`): |

| Event | Type |
|---|---|
| Quotation created | `quotation.created` |
| Quotation sent | `quotation.sent` |
| Quotation accepted | `quotation.accepted` |
| Order created from quotation | `order.converted_from_quotation` |
| Bank transfer submitted | `payment.bank_transfer_submitted` |
| Bank transfer approved | `payment.bank_transfer_approved` |
| Credit order created | `payment.credit_order_created` |
| Booking requested | `booking.requested` |
| Booking confirmed | `booking.confirmed` |
| Booking in progress | `booking.in_progress` |
| Booking completed | `booking.completed` |

**Verification** | Each row has: `recipient_email`, `subject`, `event_type`, `entity_type`, `entity_id`, `status` = `pending`, `created_at` timestamp.

---

## Complete Flow Diagram

```
Customer                    Admin                     System
   │                          │                         │
   ├─ Browse products ────────┤                         │
   ├─ Submit RFQ ─────────────┤                         │
   │                          ├─ Create quotation ──────┤
   │                          ├─ Send quotation ────────┤ → email_logs
   ├─ Accept quotation ───────┤                         │ → email_logs
   │                          ├─ Convert to order ──────┤ → invoice issued
   ├─ Submit bank transfer ───┤                         │ → email_logs
   │                          ├─ Approve payment ───────┤ → invoice paid
   │                          │                         │ → email_logs
   ├─ OR: Buy on credit ──────┤                         │ → invoice issued
   ├─ Book service ───────────┤                         │ → email_logs
   │                          ├─ Confirm booking ───────┤ → email_logs
   │                          ├─ Start service ─────────┤ → email_logs
   │                          ├─ Complete service ──────┤ → email_logs
```

---

## Key URLs Quick Reference

| Page | URL | Role |
|---|---|---|
| Home | `/` | Public |
| Products | `/products` | Public |
| Product Detail | `/products/[slug]` | Public |
| Request Quote | `/rfq/new` | Customer |
| Customer Login | `/auth/login` | Public |
| Customer Register | `/auth/register` | Public |
| My Account | `/account` | Customer |
| My RFQs | `/account/rfqs` | Customer |
| My RFQ Detail | `/account/rfqs/[id]` | Customer |
| My Orders | `/account/orders` | Customer |
| Order Payment | `/account/orders/[id]/payment` | Customer |
| My Bookings | `/account/bookings` | Customer |
| Booking Detail | `/account/bookings/[id]` | Customer |
| Billing | `/account/billing` | Customer |
| Book Service | `/booking` | Customer |
| Admin Login | `/admin/login` | Admin |
| Admin Dashboard | `/admin` | Admin |
| Admin RFQs | `/admin/rfqs` | Admin |
| Admin RFQ Detail | `/admin/rfqs/[id]` | Admin |
| Admin Quotations | `/admin/quotations` | Admin |
| Admin Orders | `/admin/orders` | Admin |
| Admin Order Payments | `/admin/orders/[id]/payments` | Admin |
| Admin Bank Transfers | `/admin/bank-transfers` | Admin |
| Admin Bookings | `/admin/bookings` | Admin |
| Admin Booking Detail | `/admin/bookings/[id]` | Admin |
| Admin Products | `/admin/products` | Admin |
| Admin Customers | `/admin/customers` | Admin |
| Admin Credit Customers | `/admin/credit-customers` | Admin |
