# B2B Launch Smoke Test — Manual Checklist

> Use this checklist to verify all B2B commerce flows work end-to-end before launching.
> Test against a clean deployment (fresh database, fresh migrations).
> Check each box only when the step passes.

---

## A. Company Onboarding

- [ ] **Register a new company**
  1. Visit `/auth/register`
  2. Fill in all fields: name, email, password, company name, business type, industry, address, tax ID
  3. Submit → Redirected to login with success message
  4. Verify a `companies` row exists with `status = 'pending'`
  5. Verify the user's `account_status` is `'pending'`

- [ ] **Pending account is restricted**
  1. Log in with the pending company credentials
  2. Try to access `/cart` → Should redirect to login or show restricted message
  3. Try `POST /api/cart/checkout` → Should return `403` with "not active" error
  4. Try `POST /api/quick-order` → Should return `403` with "not active" error
  5. Try `POST /api/reorder/:orderId` → Should return `403` with "not active" error

- [ ] **Admin approves company**
  1. Log in as admin
  2. Visit `/admin/companies` → New company appears in list
  3. Click company → View detail page
  4. Click **Approve**, optionally set: customer group, sales rep, credit limit, payment terms
  5. Verify company `status` changes to `'active'`
  6. Verify user's `account_status` changes to `'active'`

- [ ] **Approved company can transact**
  1. Log out, log in as the approved company user
  2. Access `/cart` → Cart page loads (may be empty)
  3. Verify company name appears in the navbar

- [ ] **Admin rejects company (optional)**
  1. Register another company with a different email
  2. As admin, click **Reject** and enter a reason
  3. Verify company `status` = `'rejected'`, `rejection_reason` is populated

---

## B. Product / Catalog

- [ ] **Guest sees hidden prices as null**
  1. Log out (or use incognito)
  2. Browse `/products` → Find a product with `hide_price = true`
  3. Verify price displays as "N/A" or hidden (not a number)
  4. Click product → Detail page also shows no price

- [ ] **Approved company sees real prices**
  1. Log in as an approved company user
  2. Browse the same products → Prices are visible
  3. Detail page shows correct price in GH₵

- [ ] **Custom company pricing applies**
  1. Admin: Set a company-specific price for a product via `/admin/companies/[id]`
  2. As customer, view that product → Price reflects the custom amount
  3. Verify the product card/modal shows "custom pricing" indicator

- [ ] **Group pricing fallback**
  1. Admin: Remove company-specific price, set a group-specific price
  2. As customer, view that product → Group price is shown (if company belongs to that group)

- [ ] **Product attachments**
  1. Admin: Add an attachment (spec sheet, manual) to a product
  2. As customer, view product detail → Attachment link/button appears
  3. Click to download → File opens correctly

---

## C. Cart / Checkout

- [ ] **Add item to cart**
  1. Logged in as approved company user
  2. On a product detail page, click **Add to Cart**
  3. Verify toast "Added to cart"
  4. Visit `/cart` → Item appears with correct name, price, quantity

- [ ] **Update quantity**
  1. In cart, change quantity (e.g. 1 → 3)
  2. Verify subtotal recalculates
  3. Refresh page → Quantity persisted

- [ ] **Remove item**
  1. Click remove/delete on a cart item
  2. Item disappears from cart
  3. Verify cart shows "Your cart is empty" if no items remain

- [ ] **Checkout flow**
  1. Cart has at least one item
  2. Click **Proceed to Checkout**
  3. Select payment method (paystack, bank_transfer, or credit)
  4. Enter PO number (optional)
  5. Enter notes (optional)
  6. Submit → Order created, cart cleared
  7. Verify order appears in `/account/orders`

- [ ] **Empty cart checkout rejected**
  1. Clear all items from cart
  2. Try to checkout → Error: "Cart is empty"

- [ ] **Payment methods filtered by company**
  1. Admin: Disable a payment method (e.g. "credit") for the company
  2. As customer, go to checkout → Disabled method should not appear

- [ ] **Shipping methods available**
  1. Admin: Configure shipping methods (standard, express)
  2. Assign methods to the company
  3. As customer, call `GET /api/shipping-methods` → Returns assigned methods

---

## D. Quick Order

- [ ] **Quick order by SKU (manual)**
  1. Logged in as approved company user
  2. Visit the quick order page (or submit directly)
  3. Enter a valid SKU and quantity
  4. Submit → Order created with prefix `QO-`
  5. Verify order in `/account/orders`

- [ ] **Quick order with multiple SKUs**
  1. Submit multiple SKUs at once
  2. All valid items create a single order
  3. Invalid SKUs are reported as errors, but valid ones still proceed

- [ ] **CSV upload quick order**
  1. Create a CSV with columns: `sku, quantity`
  2. Upload via the quick order CSV endpoint
  3. Verify order is created with prefix `QO-CSV-`

- [ ] **Invalid SKU validation**
  1. Submit a non-existent SKU
  2. Response: `400` with error "No valid items found"

- [ ] **Out-of-stock validation**
  1. Set a product's `stock_status` to `'out_of_stock'`
  2. Quick order that product → Error: "Out of stock"

---

## E. RFQ / Quotation

- [ ] **Customer submits RFQ**
  1. Logged in → Visit product detail → Click **Request Quote**
  2. (Or visit `/rfq/new` directly)
  3. Select product, enter quantity, add delivery requirements
  4. Submit → RFQ created with status `'pending'`
  5. Verify in `/account/rfqs`

- [ ] **Admin creates quotation**
  1. Log in as admin → Visit `/admin/rfqs` → Find the RFQ
  2. Click **Create Quotation**
  3. Add line items: description, quantity, unit price
  4. Set discount, tax, service fee, delivery fee
  5. Set Valid Until date
  6. Click **Create Draft** → Status `'draft'`
  7. Click **Send** → Status `'sent'`

- [ ] **Customer accepts quotation**
  1. Log in as customer → Visit `/account/rfqs/[id]`
  2. See the quotation card with pricing breakdown
  3. Click **Accept Quotation** → Status `'accepted'`

- [ ] **Customer rejects quotation (optional)**
  1. Create another RFQ and quotation
  2. Click **Reject Quotation** → Status `'rejected'`

- [ ] **Admin converts to order**
  1. Log in as admin → Visit the accepted RFQ
  2. Trigger `POST /api/orders/from-quotation/:quotationId`
  3. Order created with `payment_method = 'credit'`, invoice generated
  4. Quotation status → `'converted_to_order'`

---

## F. Credit / Store Credit

- [ ] **Admin adjusts store credit**
  1. Admin: Visit `/admin/customers` → Select a customer
  2. Find the Store Credit section
  3. Add GH₵ 50,000 with reason "Promotional credit"
  4. Verify success, balance = 50,000

- [ ] **Customer sees store credit balance**
  1. Logged in as the customer
  2. Visit `/account/store-credit` (or billing page)
  3. Balance of 50,000 is visible
  4. Transaction history shows the adjustment record

- [ ] **Admin deducts store credit**
  1. Admin: Deduct GH₵ 10,000 (negative amount) with reason
  2. Balance reduces to 40,000

- [ ] **Negative balance prevented**
  1. Admin: Try to deduct more than available balance
  2. Error: "Insufficient store credit"

- [ ] **Company credit limit**
  1. Admin: Set company's `credit_limit = 100,000`, `payment_terms_days = 30`
  2. Customer: Place an order on credit over the limit → Error or warning
  3. Place an order under the limit → Success

---

## G. Reorder

- [ ] **Reorder from previous order**
  1. Logged in as a customer with at least one past order
  2. Visit order detail → Click **Reorder** (or call `POST /api/reorder/:orderId`)
  3. New order created with prefix `RE-`
  4. Uses current product prices (not the original order's prices)

- [ ] **Reorder for another company's order blocked**
  1. User from Company A tries to reorder Company B's order
  2. Error: `404` (order not found — isolated)

---

## H. Service Booking

- [ ] **Customer books a service**
  1. Visit `/booking`
  2. Select a paid order from the dropdown
  3. Select preferred date/time, service type, location
  4. Submit → Booking status = `'requested'`

- [ ] **Admin manages booking lifecycle**
  1. Visit `/admin/bookings`
  2. Find the new booking → Click **Confirm** → Status `'confirmed'`
  3. Click **Start** → Status `'in_progress'`
  4. Click **Complete** → Status `'completed'`, `completed_at` populated

- [ ] **Service order (if supported)**
  1. Admin creates a service-only order from booking
  2. Verify `order_type = 'service'` in database

---

## I. Admin Operations

- [ ] **Company list with search/filter/pagination**
  1. Visit `/admin/companies`
  2. Table shows all companies with name, email, status, date
  3. Search returns filtered results
  4. Pagination works (next/prev pages)

- [ ] **Company detail page**
  1. Click a company → Detail page loads
  2. Shows: company info, contact, status badge, sales rep, group, credit settings
  3. Approve/reject buttons visible (for pending companies)

- [ ] **Assign sales rep**
  1. On company detail, assign a sales rep from the dropdown
  2. Save → Sales rep is linked

- [ ] **Create sub-user**
  1. On company detail, add a sub-user: email, password, role (buyer/finance/viewer)
  2. Sub-user can log in and see company-specific data
  3. Sub-user cannot see other companies' data

- [ ] **Customer groups**
  1. Visit the customer groups section
  2. See the 4 seeded groups (Standard, Silver, Gold, Platinum)
  3. Create/edit a group with name, description, minimum order amount

- [ ] **Custom pricing management**
  1. Assign a company-specific price for a product
  2. Assign a group-specific price for a product
  3. Verify prices apply correctly for the target company

- [ ] **Payment method assignment**
  1. Restrict a payment method for a company
  2. Verify the company sees only allowed methods during checkout

- [ ] **Shipping method assignment**
  1. Assign a shipping method to a company (optionally with custom rate)
  2. Verify the company sees only assigned methods

---

## Results

| Section | Tests | Passed | Failed | Notes |
|---------|-------|--------|--------|-------|
| A. Company Onboarding | 4 | — | — | |
| B. Product / Catalog | 5 | — | — | |
| C. Cart / Checkout | 7 | — | — | |
| D. Quick Order | 5 | — | — | |
| E. RFQ / Quotation | 5 | — | — | |
| F. Credit / Store Credit | 5 | — | — | |
| G. Reorder | 2 | — | — | |
| H. Service Booking | 3 | — | — | |
| I. Admin Operations | 9 | — | — | |
| **Total** | **45** | — | — | |

**Sign-off:**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA / Tester | | | |
| CTO | | | |
| Product Owner | | | |
