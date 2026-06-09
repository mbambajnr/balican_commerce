# Restricted Access QA Checklist

Use this checklist to verify the restricted company access behavior across the platform.

## Prerequisites
- At least one user with a company in each status: `active`, `pending`, `rejected`, `suspended`, `payment_suspended`, `deactivated`
- At least one provider-type company with each verification status: `not_started`, `submitted`, `under_review`, `changes_requested`, `approved`, `rejected`
- At least one super_admin user

---

## 1. Account Status Page (`/account-status`)

- [ ] Pending company user is redirected to `/account-status` with the pending message
- [ ] Rejected company user sees rejection message
- [ ] Suspended company user sees suspension message
- [ ] Payment-suspended company user sees payment suspension message
- [ ] Deactivated company user sees deactivation message
- [ ] Active company user is redirected to dashboard (not shown the page)
- [ ] Provider with pending verification sees "Verification Required"
- [ ] Provider with submitted documents sees "Under Review"
- [ ] Provider with changes_requested sees "Changes Requested" with re-upload link
- [ ] Super admin is NOT redirected (bypasses all restrictions)

## 2. Cart (POST/PUT/DELETE `/api/cart*`)

- [ ] Active company → can add/update/delete cart items
- [ ] Pending company → 403 with company status info
- [ ] Rejected company → 403
- [ ] Suspended company → 403
- [ ] Payment-suspended company → 403
- [ ] Deactivated company → 403
- [ ] Unauthenticated → 401
- [ ] User without company → 403 (no company)
- [ ] Super admin → allowed regardless of company status

## 3. Checkout (POST `/api/cart/checkout`)

- [ ] Active company → can checkout
- [ ] Pending company → 403
- [ ] Rejected company → 403
- [ ] Suspended company → 403
- [ ] Deactivated company → 403
- [ ] Payment-suspended company → 403
- [ ] Super admin → allowed

## 4. Quick Order (POST `/api/quick-order`, POST `/api/quick-order/csv`)

- [ ] Active company → can submit quick orders
- [ ] Pending company → 403
- [ ] Rejected company → 403
- [ ] Super admin → allowed

## 5. Reorder (POST `/api/reorder/:id`)

- [ ] Active company → can reorder
- [ ] Pending company → 403
- [ ] Rejected company → 403
- [ ] Super admin → allowed

## 6. Provider Dashboard (GET/POST `/api/provider/*`)

- [ ] Active provider company → can access dashboard, products, services, inventory
- [ ] Pending provider company → 403
- [ ] Rejected provider company → 403
- [ ] Super admin (even without provider company) → can access provider routes
- [ ] Non-provider company → 403 (is_provider check still applies)

## 7. Provider Verification (POST `/api/provider/verification/submit`)

- [ ] Provider with pending company → 403
- [ ] Provider with active company → can submit documents
- [ ] Notification is sent to super admins on submission

## 8. Super Admin Verification Review (PATCH `/api/super-admin/verification/*`)

- [ ] Super admin can approve documents
- [ ] Super admin can reject with reason
- [ ] Super admin can request re-upload
- [ ] Re-upload request sends notification to company
- [ ] Non-admin user gets 403
- [ ] Regular admin gets 403 (super admin only)

## 9. Pricing (Products API)

- [ ] Unauthenticated user → no prices visible for hide_price products
- [ ] Active company → sees resolved custom prices
- [ ] Pending/rejected company → sees null prices (quote-first)
- [ ] Admin → sees base prices
- [ ] Super admin → sees base prices

## 10. Scout / RFQ

- [ ] Active company → can create scout requests
- [ ] Pending/rejected company → 403
- [ ] Super admin → allowed
- [ ] Guest users → can submit guest RFQ (separate flow)

---

## Edge Cases to Verify

- [ ] User with `account_status = 'active'` but company `status = 'pending'` → blocked
- [ ] User with `account_status = 'active'` but no company → blocked
- [ ] Super admin with a pending company → allowed (role bypasses company check)
- [ ] Company transitions from pending → active → previously blocked endpoints now work
- [ ] Company transitions from active → suspended → previously working endpoints now blocked

## Automated Tests

```bash
cd backend
npx jest src/__tests__/access-control-hardening.test.ts --verbose
```
