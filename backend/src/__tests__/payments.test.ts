import request from "supertest";
import app from "../app";
import { query, transaction } from "../config/db";
import {
  createTestUser, createTestCategory, createTestProduct,
  createTestQuotation, createTestQuotationItem,
  createTestOrder, createTestInvoice, createTestBankTransfer,
  generateToken, cleanupTestData,
} from "./helpers";

// ── Test-level state ──
const state: Record<string, any> = {};

beforeAll(async () => {
  // Ensure clean state from any previously interrupted runs
  await cleanupTestData();

  // Create test users
  state.adminUser = await createTestUser({
    email: "test-qa-admin@test.com",
    firstName: "QA",
    lastName: "Admin",
    role: "admin",
  });

  state.superAdminUser = await createTestUser({
    email: "test-qa-superadmin@test.com",
    firstName: "QA",
    lastName: "SuperAdmin",
    role: "super_admin",
  });

  state.salesUser = await createTestUser({
    email: "test-qa-sales@test.com",
    firstName: "QA",
    lastName: "Sales",
    role: "sales",
  });

  state.opsUser = await createTestUser({
    email: "test-qa-ops@test.com",
    firstName: "QA",
    lastName: "Ops",
    role: "ops",
  });

  state.customerUser = await createTestUser({
    email: "test-qa-customer@test.com",
    firstName: "QA",
    lastName: "Customer",
    role: "customer",
  });

  state.creditCustomer = await createTestUser({
    email: "test-qa-credit@test.com",
    firstName: "QA",
    lastName: "Credit",
    role: "customer",
    isCreditApproved: true,
    creditLimit: 500000,
    paymentTermsDays: 30,
    companyName: "Credit Corp Ltd",
  });

  state.creditCustomerNoLimit = await createTestUser({
    email: "test-qa-credit-unlimited@test.com",
    firstName: "QA",
    lastName: "CreditUnlimited",
    role: "customer",
    isCreditApproved: true,
    creditLimit: 0, // 0 = unlimited
    paymentTermsDays: 30,
    companyName: "Unlimited Corp Ltd",
  });

  state.anotherCustomer = await createTestUser({
    email: "test-qa-other-customer@test.com",
    firstName: "Other",
    lastName: "Customer",
    role: "customer",
  });

  state.noCreditCustomer = await createTestUser({
    email: "test-qa-nocredit@test.com",
    firstName: "No",
    lastName: "Credit",
    role: "customer",
    isCreditApproved: false,
  });

  // Create category and products
  state.category = await createTestCategory("QA Test Category");
  state.activeProduct = await createTestProduct({
    name: "QA Active Product",
    price: 10000,
    categoryId: state.category.id,
    isActive: true,
  });
  state.inactiveProduct = await createTestProduct({
    name: "QA Inactive Product",
    price: 5000,
    categoryId: state.category.id,
    isActive: false,
  });
  state.cheapProduct = await createTestProduct({
    name: "QA Cheap Product",
    price: 1000,
    categoryId: state.category.id,
    isActive: true,
  });

  // Generate tokens
  state.adminToken = generateToken(state.adminUser.id, "admin");
  state.superAdminToken = generateToken(state.superAdminUser.id, "super_admin");
  state.salesToken = generateToken(state.salesUser.id, "sales");
  state.opsToken = generateToken(state.opsUser.id, "ops");
  state.customerToken = generateToken(state.customerUser.id, "customer");
  state.creditToken = generateToken(state.creditCustomer.id, "customer");
  state.creditUnlimitedToken = generateToken(state.creditCustomerNoLimit.id, "customer");
  state.otherCustomerToken = generateToken(state.anotherCustomer.id, "customer");
  state.noCreditToken = generateToken(state.noCreditCustomer.id, "customer");
});

afterAll(async () => {
  // Collect all IDs from state (both objects with .id and raw string arrays)
  const ids: string[] = [];
  for (const key of Object.keys(state)) {
    const val = state[key];
    if (val && typeof val === "object" && val.id) {
      ids.push(val.id);
    }
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && item.id) {
          ids.push(item.id);
        } else if (typeof item === "string") {
          ids.push(item);
        }
      }
    }
  }

  if (ids.length > 0) {
    await query("DELETE FROM quotation_events WHERE quotation_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM quotation_items WHERE quotation_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM quotations WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM order_payments WHERE order_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM bank_transfers WHERE order_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM invoices WHERE order_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM activities WHERE entity_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM rfqs WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM product_images WHERE product_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM product_attributes WHERE product_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM products WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
    await query("DELETE FROM categories WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
  }

  // Also clean up using email pattern (catches any records missed by ID-based cleanup)
  // Order-dependent delete: first delete child records, then parent records
  // Use CASCADE-friendly direct SQL for any remaining test-qa records
  await query("DELETE FROM order_payments USING orders, users WHERE order_payments.order_id = orders.id AND orders.user_id = users.id AND users.email LIKE 'test-qa-%'").catch(() => {});
  await query("DELETE FROM bank_transfers USING orders, users WHERE bank_transfers.order_id = orders.id AND orders.user_id = users.id AND users.email LIKE 'test-qa-%'").catch(() => {});
  await query("DELETE FROM invoices USING orders, users WHERE invoices.order_id = orders.id AND orders.user_id = users.id AND users.email LIKE 'test-qa-%'").catch(() => {});
  await query("DELETE FROM activities WHERE entity_id IN (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-qa-%'))").catch(() => {});
  await query("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-qa-%')").catch(() => {});
  await query("DELETE FROM quotation_events USING quotations, users WHERE quotation_events.quotation_id = quotations.id AND quotations.customer_id = users.id AND users.email LIKE 'test-qa-%'").catch(() => {});
  await query("DELETE FROM quotation_items USING quotations, users WHERE quotation_items.quotation_id = quotations.id AND quotations.customer_id = users.id AND users.email LIKE 'test-qa-%'").catch(() => {});
  await query("DELETE FROM quotations WHERE customer_id IN (SELECT id FROM users WHERE email LIKE 'test-qa-%')").catch(() => {});
  await query("DELETE FROM rfqs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-qa-%')").catch(() => {});
  await query("DELETE FROM product_images USING products WHERE product_images.product_id = products.id AND products.name LIKE 'QA%'").catch(() => {});
  await query("DELETE FROM product_attributes USING products WHERE product_attributes.product_id = products.id AND products.name LIKE 'QA%'").catch(() => {});
  await query("DELETE FROM products WHERE name LIKE 'QA%'").catch(() => {});
  await query("DELETE FROM categories WHERE name LIKE 'QA%'").catch(() => {});
  await query("DELETE FROM users WHERE email LIKE 'test-qa-%'").catch(() => {});
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 1: Quotation → Order Conversion
// ════════════════════════════════════════════════════════════════════

describe("Quotation → Order Conversion", () => {
  let acceptedQuotation: any;
  let sentQuotation: any;
  let draftQuotation: any;
  let rejectedQuotation: any;

  beforeAll(async () => {
    // Create an RFQ for each quotation
    const rfq = await query(
      `INSERT INTO rfqs (user_id, product_id, quantity, status, notes)
       VALUES ($1, $2, 1, 'accepted', 'Test RFQ') RETURNING *`,
      [state.creditCustomer.id, state.activeProduct.id]
    );
    state.rfq = rfq.rows[0];

    // Accepted quotation
    acceptedQuotation = await createTestQuotation({
      rfqId: state.rfq.id,
      customerId: state.creditCustomer.id,
      status: "accepted",
      totalAmount: 10000,
    });
    await createTestQuotationItem({
      quotationId: acceptedQuotation.id,
      productId: state.activeProduct.id,
      description: "Test Item",
      quantity: 1,
      unitPrice: 10000,
    });

    // Sent quotation (not accepted)
    sentQuotation = await createTestQuotation({
      rfqId: state.rfq.id,
      customerId: state.creditCustomer.id,
      status: "sent",
      totalAmount: 10000,
    });
    await createTestQuotationItem({
      quotationId: sentQuotation.id,
      productId: state.activeProduct.id,
      description: "Test Item",
      quantity: 1,
      unitPrice: 10000,
    });

    // Draft quotation
    draftQuotation = await createTestQuotation({
      rfqId: state.rfq.id,
      customerId: state.creditCustomer.id,
      status: "draft",
      totalAmount: 10000,
    });
    await createTestQuotationItem({
      quotationId: draftQuotation.id,
      productId: state.activeProduct.id,
      description: "Test Item",
      quantity: 1,
      unitPrice: 10000,
    });

    // Rejected quotation
    rejectedQuotation = await createTestQuotation({
      rfqId: state.rfq.id,
      customerId: state.creditCustomer.id,
      status: "rejected",
      totalAmount: 10000,
    });
    await createTestQuotationItem({
      quotationId: rejectedQuotation.id,
      productId: state.activeProduct.id,
      description: "Test Item",
      quantity: 1,
      unitPrice: 10000,
    });

    state.acceptedQuotation = acceptedQuotation;
    state.sentQuotation = sentQuotation;
    state.draftQuotation = draftQuotation;
    state.rejectedQuotation = rejectedQuotation;
  });

  // 1. Accepted quotation can convert to order only once
  test("TC-1: Accepted quotation converts to order exactly once", async () => {
    const res1 = await request(app)
      .post(`/api/orders/from-quotation/${acceptedQuotation.id}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send();

    expect(res1.status).toBe(201);
    expect(res1.body.order).toBeDefined();
    expect(res1.body.order.quotation_id).toBe(acceptedQuotation.id);

    // Store the order for cleanup tracking
    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(res1.body.order.id);

    // Verify quotation is marked as converted
    const qCheck = await query("SELECT status FROM quotations WHERE id = $1", [acceptedQuotation.id]);
    expect(qCheck.rows[0].status).toBe("converted_to_order");

    // Verify order links back to quotation
    const orderLink = await query("SELECT id FROM orders WHERE quotation_id = $1", [acceptedQuotation.id]);
    expect(orderLink.rows.length).toBe(1);
    expect(orderLink.rows[0].id).toBe(res1.body.order.id);

    // Second attempt should fail
    const res2 = await request(app)
      .post(`/api/orders/from-quotation/${acceptedQuotation.id}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send();

    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain("Cannot convert quotation with status");
  });

  // 2. Non-accepted quotation cannot convert to order
  test("TC-2: Non-accepted quotation cannot be converted to order", async () => {
    for (const q of [state.draftQuotation, state.sentQuotation, state.rejectedQuotation]) {
      const res = await request(app)
        .post(`/api/orders/from-quotation/${q.id}`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Cannot convert quotation with status");
    }
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 2: Order Access Control
// ════════════════════════════════════════════════════════════════════

describe("Order Access Control", () => {
  let customerOrder: any;

  beforeAll(async () => {
    customerOrder = await createTestOrder({
      userId: state.creditCustomer.id,
      paymentMethod: "credit",
      total: 50000,
    });

    // Create invoice for the order
    await createTestInvoice({
      orderId: customerOrder.id,
      total: 50000,
    });

    state.customerOrder = customerOrder;
  });

  // 3. Customer cannot access another customer's order
  test("TC-3: Customer cannot access another customer's order", async () => {
    // Other customer tries to access creditCustomer's order
    const res = await request(app)
      .get(`/api/orders/${customerOrder.id}`)
      .set("Authorization", `Bearer ${state.otherCustomerToken}`);

    expect(res.status).toBe(404);

    // Owner can access
    const resOwner = await request(app)
      .get(`/api/orders/${customerOrder.id}`)
      .set("Authorization", `Bearer ${state.creditToken}`);

    expect(resOwner.status).toBe(200);
    expect(resOwner.body.order.id).toBe(customerOrder.id);
  });

  // 15. Admin-only finance endpoints reject customer users
  test("TC-15: Admin-only finance endpoints reject customer users", async () => {
    const adminEndpoints = [
      { method: "get" as const, url: "/api/admin/payments" },
      { method: "post" as const, url: "/api/admin/bank-transfers/00000000-0000-0000-0000-000000000000/approve" },
      { method: "post" as const, url: "/api/admin/bank-transfers/00000000-0000-0000-0000-000000000000/reject" },
      { method: "post" as const, url: "/api/admin/orders/00000000-0000-0000-0000-000000000000/record-payment" },
      { method: "post" as const, url: "/api/admin/orders/check-overdue" },
      { method: "get" as const, url: "/api/admin/customers/00000000-0000-0000-0000-000000000000/credit-summary" },
      { method: "patch" as const, url: "/api/admin/customers/00000000-0000-0000-0000-000000000000/credit-settings" },
    ];

    for (const ep of adminEndpoints) {
      const res = await (request(app) as any)[ep.method](ep.url)
        .set("Authorization", `Bearer ${state.customerToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Admin access required");
    }

    // Verify admin CAN access them (they'll 404 due to fake IDs but that proves auth passed)
    for (const ep of adminEndpoints) {
      const res = await (request(app) as any)[ep.method](ep.url)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send({});

      expect(res.status).not.toBe(403);
    }
  });

  // 16. Sales/ops/admin/super_admin permissions work correctly
  test("TC-16: Role-based permissions for admin endpoints", async () => {
    // requireAdmin checks for ["admin", "super_admin"] only
    const adminRoles = [
      { token: state.adminToken, name: "admin" },
      { token: state.superAdminToken, name: "super_admin" },
    ];

    for (const role of adminRoles) {
      const res = await request(app)
        .get("/api/admin/payments")
        .set("Authorization", `Bearer ${role.token}`);
      expect(res.status).toBe(200);
    }

    // sales and ops are not admin roles - should be rejected
    const nonAdminRoles = [
      { token: state.salesToken, name: "sales" },
      { token: state.opsToken, name: "ops" },
    ];

    for (const role of nonAdminRoles) {
      const res = await request(app)
        .get("/api/admin/payments")
        .set("Authorization", `Bearer ${role.token}`);
      expect(res.status).toBe(403);
    }

    // Customer should also be rejected
    const resCustomer = await request(app)
      .get("/api/admin/payments")
      .set("Authorization", `Bearer ${state.customerToken}`);
    expect(resCustomer.status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 3: Checkout & Product Validation
// ════════════════════════════════════════════════════════════════════

describe("Checkout & Product Validation", () => {
  // 4. Public checkout cannot use inactive products
  test("TC-4: Checkout rejects inactive products", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        items: [{ productId: state.inactiveProduct.id, name: "Inactive", price: 5000, quantity: 1 }],
        subtotal: 5000,
        tax: 0,
        total: 5000,
        paymentMethod: "paystack",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not active");
  });

  test("TC-4b: Checkout accepts active products", async () => {
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, name: "Active", price: 10000, quantity: 1 }],
        subtotal: 10000,
        tax: 0,
        total: 10000,
        paymentMethod: "paystack",
      });

    expect(res.status).toBe(201);
    expect(res.body.order).toBeDefined();

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(res.body.order.id);
    state.paystackOrder = res.body.order;
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 4: Bank Transfer
// ════════════════════════════════════════════════════════════════════

describe("Bank Transfer Flow", () => {
  let btOrder: any;
  let btTransfer: any;

  beforeAll(async () => {
    btOrder = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "bank_transfer",
      total: 25000,
    });
    await createTestInvoice({ orderId: btOrder.id, total: 25000 });
    state.btOrder = btOrder;
  });

  test("TC-5: Bank transfer approval is idempotent - cannot be approved twice", async () => {
    // Submit a bank transfer
    btTransfer = await createTestBankTransfer({
      orderId: btOrder.id,
      userId: state.customerUser.id,
      amount: 25000,
    });

    // First approval should succeed
    const res1 = await request(app)
      .post(`/api/admin/bank-transfers/${btTransfer.id}/approve`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send();

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.paymentStatus).toBe("paid");

    // Second approval should fail (idempotent)
    const res2 = await request(app)
      .post(`/api/admin/bank-transfers/${btTransfer.id}/approve`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send();

    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain("Cannot approve");
  });

  // 6. Rejected bank transfer does not affect order balance
  test("TC-6: Rejected bank transfer does not affect order balance", async () => {
    // Create a separate order for this test
    const rejectOrder = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "bank_transfer",
      total: 15000,
    });
    await createTestInvoice({ orderId: rejectOrder.id, total: 15000 });

    const rejectTransfer = await createTestBankTransfer({
      orderId: rejectOrder.id,
      userId: state.customerUser.id,
      amount: 15000,
    });

    // Get initial order state
    const beforeReject = await query("SELECT amount_paid, outstanding_amount, payment_status FROM orders WHERE id = $1", [rejectOrder.id]);

    // Reject the transfer
    const resReject = await request(app)
      .post(`/api/admin/bank-transfers/${rejectTransfer.id}/reject`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ reason: "Insufficient proof" });

    expect(resReject.status).toBe(200);

    // Verify transfer is rejected
    const btCheck = await query("SELECT status FROM bank_transfers WHERE id = $1", [rejectTransfer.id]);
    expect(btCheck.rows[0].status).toBe("rejected");

    // Verify order balance is unchanged
    const afterReject = await query("SELECT amount_paid, outstanding_amount, payment_status FROM orders WHERE id = $1", [rejectOrder.id]);
    expect(afterReject.rows[0].amount_paid).toBe(beforeReject.rows[0].amount_paid);
    expect(afterReject.rows[0].outstanding_amount).toBe(beforeReject.rows[0].outstanding_amount);

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(rejectOrder.id);
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 5: Partial & Full Payments
// ════════════════════════════════════════════════════════════════════

describe("Partial and Full Payments", () => {
  // 7. Partial payment updates order, invoice, and customer outstanding balance correctly
  test("TC-7: Partial payment updates all balances correctly", async () => {
    // Create a credit order via API to properly set up outstanding balance
    const createRes = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.creditToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 10, unitPrice: 10000 }],
        subtotal: 100000,
        total: 100000,
      });

    expect(createRes.status).toBe(201);
    const partialOrder = createRes.body.order;

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(partialOrder.id);

    const beforeBalance = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    const initialOutstanding = parseFloat(beforeBalance.rows[0].outstanding_balance);
    expect(initialOutstanding).toBeGreaterThanOrEqual(100000);

    // Record a partial payment of GH₵30,000
    const res = await request(app)
      .post(`/api/admin/orders/${partialOrder.id}/record-payment`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        amount: 30000,
        method: "bank_transfer",
        reference: "PARTIAL-001",
      });

    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe("partially_paid");
    expect(res.body.amountPaid).toBe(30000);
    expect(res.body.outstandingAmount).toBe(70000);

    // Verify order in DB
    const orderCheck = await query("SELECT * FROM orders WHERE id = $1", [partialOrder.id]);
    expect(parseFloat(orderCheck.rows[0].amount_paid)).toBe(30000);
    expect(parseFloat(orderCheck.rows[0].outstanding_amount)).toBe(70000);
    expect(orderCheck.rows[0].payment_status).toBe("partially_paid");

    // Verify invoice
    const invCheck = await query("SELECT * FROM invoices WHERE order_id = $1", [partialOrder.id]);
    expect(parseFloat(invCheck.rows[0].amount_paid)).toBe(30000);
    expect(parseFloat(invCheck.rows[0].outstanding_amount)).toBe(70000);
    expect(invCheck.rows[0].status).toBe("partially_paid");

    // Verify customer outstanding balance reduced by payment amount
    const afterBalance = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    const newOutstanding = parseFloat(afterBalance.rows[0].outstanding_balance);
    expect(newOutstanding).toBe(initialOutstanding - 30000);
  });

    // 8. Full payment marks order and invoice as paid
  test("TC-8: Full payment marks order and invoice as paid", async () => {
    // Create a credit order via API
    const createRes = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.creditToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 10, unitPrice: 10000 }],
        subtotal: 100000,
        total: 100000,
      });

    expect(createRes.status).toBe(201);
    const fullPayOrder = createRes.body.order;

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(fullPayOrder.id);

    // Pay the full amount in one shot
    const res = await request(app)
      .post(`/api/admin/orders/${fullPayOrder.id}/record-payment`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        amount: 100000,
        method: "bank_transfer",
        reference: "FULL-001",
      });

    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe("paid");
    expect(res.body.outstandingAmount).toBe(0);

    // Verify order
    const orderCheck = await query("SELECT * FROM orders WHERE id = $1", [fullPayOrder.id]);
    expect(orderCheck.rows[0].payment_status).toBe("paid");
    expect(parseFloat(orderCheck.rows[0].outstanding_amount)).toBe(0);

    // Verify invoice
    const invCheck = await query("SELECT * FROM invoices WHERE order_id = $1", [fullPayOrder.id]);
    expect(invCheck.rows[0].status).toBe("paid");
    expect(invCheck.rows[0].paid_at).not.toBeNull();
  });

  test("TC-8b: Over-payment is prevented", async () => {
    const orderRes = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.creditToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 10, unitPrice: 10000 }],
        subtotal: 100000,
        total: 100000,
      });

    expect(orderRes.status).toBe(201);
    const order = orderRes.body.order;
    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(order.id);

    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/record-payment`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        amount: 200000, // More than total
        method: "bank_transfer",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("exceeds order outstanding amount");
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 6: Credit Orders
// ════════════════════════════════════════════════════════════════════

describe("Credit Orders", () => {
  // 9. Credit order cannot exceed credit limit
  test("TC-9: Credit order exceeding limit is rejected", async () => {
    // creditCustomer has limit of 500,000; try to order for 600,000
    const res = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.creditToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 60, unitPrice: 10000 }],
        subtotal: 600000,
        total: 600000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("exceeds available credit");
    expect(res.body.availableCredit).toBeDefined();
  });

  test("TC-9b: Unlimted credit (limit=0) allows any amount", async () => {
    const res = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.creditUnlimitedToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 100, unitPrice: 10000 }],
        subtotal: 1000000,
        total: 1000000,
      });

    expect(res.status).toBe(201);
    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(res.body.order.id);
  });

  // 10. Credit order cannot be created by non-approved credit customer
  test("TC-10: Non-approved credit customer cannot create credit order", async () => {
    const res = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 1, unitPrice: 10000 }],
        subtotal: 10000,
        total: 10000,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Credit not approved");
  });

  // 11. Customer outstanding balance increases on credit order and decreases after payment
  test("TC-11: Outstanding balance tracks credit orders and payments", async () => {
    const beforeBalance = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    const initial = parseFloat(beforeBalance.rows[0].outstanding_balance);

    // Create a credit order
    const res = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${state.creditToken}`)
      .send({
        items: [{ productId: state.activeProduct.id, quantity: 2, unitPrice: 10000 }],
        subtotal: 20000,
        total: 20000,
      });

    expect(res.status).toBe(201);
    const creditOrder = res.body.order;

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(creditOrder.id);

    // Balance should have increased
    const afterCreate = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    expect(parseFloat(afterCreate.rows[0].outstanding_balance)).toBe(initial + 20000);

    // Create invoice for payment
    await createTestInvoice({ orderId: creditOrder.id, total: 20000 });

    // Record payment
    const payRes = await request(app)
      .post(`/api/admin/orders/${creditOrder.id}/record-payment`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        amount: 20000,
        method: "bank_transfer",
        reference: "CREDIT-FULL-PAY",
      });

    expect(payRes.status).toBe(200);

    // Balance should have decreased back
    const afterPayment = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    expect(parseFloat(afterPayment.rows[0].outstanding_balance)).toBe(initial);
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 7: Paystack Webhook
// ════════════════════════════════════════════════════════════════════

describe("Paystack Webhook", () => {
  let webhookOrder: any;

  beforeEach(() => {
    // Always clear env keys between tests to prevent cascading failures
    process.env.PAYSTACK_SECRET_KEY = "";
    process.env.PAYSTACK_WEBHOOK_SECRET = "";
  });

  beforeAll(async () => {
    // Clean any orders with the hardcoded test references to avoid stale data issues
    await query("DELETE FROM order_payments WHERE reference IN ('PAYSTACK-TEST-REF-001','PAYSTACK-TEST-VALID-001','PAYSTACK-TEST-DUP-001')").catch(() => {});
    await query("DELETE FROM orders WHERE paystack_reference IN ('PAYSTACK-TEST-REF-001','PAYSTACK-TEST-VALID-001','PAYSTACK-TEST-DUP-001')").catch(() => {});

    webhookOrder = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "paystack",
      total: 50000,
      paystackReference: "PAYSTACK-TEST-REF-001",
    });
    await createTestInvoice({ orderId: webhookOrder.id, total: 50000, status: "pending_payment" });
    state.webhookOrder = webhookOrder;
  });

  // 12. Paystack webhook verifies signature before updating order
  test("TC-12: Paystack webhook rejects invalid signature", async () => {
    process.env.PAYSTACK_SECRET_KEY = "test-key-for-signature-test";
    const res = await request(app)
      .post("/api/orders/paystack-webhook")
      .send({
        event: "charge.success",
        data: {
          reference: "PAYSTACK-TEST-REF-001",
          amount: 5000000,
        },
      })
      .set("x-paystack-signature", "invalid-signature");

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Invalid Paystack signature");

    // Order should remain unpaid
    const orderCheck = await query("SELECT payment_status FROM orders WHERE id = $1", [webhookOrder.id]);
    expect(orderCheck.rows[0].payment_status).not.toBe("paid");
  });

  test("TC-12b: Webhook without signature is rejected", async () => {
    process.env.PAYSTACK_SECRET_KEY = "test-key-for-signature-test";
    const res = await request(app)
      .post("/api/orders/paystack-webhook")
      .send({
        event: "charge.success",
        data: { reference: "PAYSTACK-TEST-REF-001", amount: 5000000 },
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Missing Paystack signature");
  });

  test("TC-12c: Valid signature with raw body processes webhook successfully", async () => {
    const crypto = require("crypto");
    const key = "test-key-for-valid-sig";
    process.env.PAYSTACK_SECRET_KEY = key;

    const payload = {
      event: "charge.success",
      data: { reference: "PAYSTACK-TEST-VALID-001", amount: 5000000 },
    };

    // Compute HMAC over the JSON string (which becomes the raw body via capture middleware)
    const bodyStr = JSON.stringify(payload);
    const expectedSig = crypto.createHmac("sha512", key).update(bodyStr).digest("hex");

    const order = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "paystack",
      total: 50000,
      paystackReference: "PAYSTACK-TEST-VALID-001",
    });
    await createTestInvoice({ orderId: order.id, total: 50000, status: "pending_payment" });
    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(order.id);

    const res = await request(app)
      .post("/api/orders/paystack-webhook")
      .send(payload)
      .set("x-paystack-signature", expectedSig);

    expect(res.status).toBe(200);

    const check = await query("SELECT payment_status FROM orders WHERE id = $1", [order.id]);
    expect(check.rows[0].payment_status).toBe("paid");
  });

  test("TC-12d: Webhook fails closed in production without secret key", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    // PAYSTACK_SECRET_KEY already cleared by beforeEach

    const res = await request(app)
      .post("/api/orders/paystack-webhook")
      .send({ event: "charge.success", data: { reference: "test", amount: 100 } });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Webhook not configured");

    process.env.NODE_ENV = origEnv;
  });

  // 13. Duplicate Paystack webhook does not double-count payment
  test("TC-13: Duplicate webhook does not double-count payment", async () => {
    // PAYSTACK_SECRET_KEY cleared by beforeEach — webhook skips signature verification
    const payload = {
      event: "charge.success",
      data: {
        reference: "PAYSTACK-TEST-DUP-001",
        amount: 5000000,
      },
    };

    // Create order with this reference
    const dupOrder = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "paystack",
      total: 50000,
      paystackReference: "PAYSTACK-TEST-DUP-001",
    });
    await createTestInvoice({ orderId: dupOrder.id, total: 50000, status: "pending_payment" });

    // Verify the paystack_reference was set correctly
    const refCheck = await query("SELECT paystack_reference FROM orders WHERE id = $1", [dupOrder.id]);
    expect(refCheck.rows[0].paystack_reference).toBe("PAYSTACK-TEST-DUP-001");

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(dupOrder.id);

    // First webhook call (no signature needed when PAYSTACK_SECRET_KEY is empty)
    const res1 = await request(app)
      .post("/api/orders/paystack-webhook")
      .send(payload);

    expect(res1.status).toBe(200);

    // Verify order is paid
    const order1 = await query("SELECT payment_status, amount_paid FROM orders WHERE id = $1", [dupOrder.id]);
    expect(order1.rows[0].payment_status).toBe("paid");
    expect(parseFloat(order1.rows[0].amount_paid)).toBe(50000);

    // Count payments
    const payments1 = await query(
      "SELECT COUNT(*) as cnt FROM order_payments WHERE reference = $1 AND method = 'paystack'",
      ["PAYSTACK-TEST-DUP-001"]
    );
    expect(parseInt(payments1.rows[0].cnt)).toBe(1);

    // Second webhook call (duplicate)
    const res2 = await request(app)
      .post("/api/orders/paystack-webhook")
      .send(payload);

    expect(res2.status).toBe(200); // Paystack expects 200 always

    // Verify amount_paid did NOT double
    const order2 = await query("SELECT payment_status, amount_paid FROM orders WHERE id = $1", [dupOrder.id]);
    expect(parseFloat(order2.rows[0].amount_paid)).toBe(50000); // Still 50000

    // Still only 1 payment record
    const payments2 = await query(
      "SELECT COUNT(*) as cnt FROM order_payments WHERE reference = $1 AND method = 'paystack'",
      ["PAYSTACK-TEST-DUP-001"]
    );
    expect(parseInt(payments2.rows[0].cnt)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 8: Overdue Detection
// ════════════════════════════════════════════════════════════════════

describe("Overdue Detection", () => {
  // 14. Overdue detection only marks unpaid/partially_paid credit orders overdue
  test("TC-14: Check-overdue only marks unpaid/partially_paid credit orders", async () => {
    // Create orders with past due dates (simulating overdue)
    const overdueOrder1 = await createTestOrder({
      userId: state.creditCustomer.id,
      paymentMethod: "credit",
      total: 30000,
      paymentStatus: "unpaid",
    });
    // Manually set past due date
    await query(
      `UPDATE orders SET payment_due_date = '2024-01-01', payment_status = 'unpaid' WHERE id = $1`,
      [overdueOrder1.id]
    );

    const overdueOrder2 = await createTestOrder({
      userId: state.creditCustomer.id,
      paymentMethod: "credit",
      total: 20000,
      paymentStatus: "partially_paid",
      amountPaid: 5000,
    });
    await query(
      `UPDATE orders SET payment_due_date = '2024-01-01', payment_status = 'partially_paid' WHERE id = $1`,
      [overdueOrder2.id]
    );

    // This order is paid and should NOT be marked overdue
    const paidCreditOrder = await createTestOrder({
      userId: state.creditCustomer.id,
      paymentMethod: "credit",
      total: 10000,
      paymentStatus: "paid",
      amountPaid: 10000,
    });
    await query(
      `UPDATE orders SET payment_due_date = '2024-01-01' WHERE id = $1`,
      [paidCreditOrder.id]
    );

    // This is a paystack order (not credit) should NOT be marked overdue
    const paystackOrder = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "paystack",
      total: 5000,
      paymentStatus: "unpaid",
    });
    await query(
      `UPDATE orders SET payment_due_date = '2024-01-01' WHERE id = $1`,
      [paystackOrder.id]
    );

    if (!state.createdOrderIds) state.createdOrderIds = [];
    state.createdOrderIds.push(overdueOrder1.id, overdueOrder2.id, paidCreditOrder.id, paystackOrder.id);

    // Run overdue check
    const res = await request(app)
      .post("/api/admin/orders/check-overdue")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2); // Only 2 should be overdue

    // Verify specific orders
    const o1 = await query("SELECT payment_status FROM orders WHERE id = $1", [overdueOrder1.id]);
    expect(o1.rows[0].payment_status).toBe("overdue");

    const o2 = await query("SELECT payment_status FROM orders WHERE id = $1", [overdueOrder2.id]);
    expect(o2.rows[0].payment_status).toBe("overdue");

    // These should NOT be overdue
    const paidCheck = await query("SELECT payment_status FROM orders WHERE id = $1", [paidCreditOrder.id]);
    expect(paidCheck.rows[0].payment_status).toBe("paid");

    const psCheck = await query("SELECT payment_status FROM orders WHERE id = $1", [paystackOrder.id]);
    expect(psCheck.rows[0].payment_status).not.toBe("overdue");
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 9: Transaction Error Recovery
// ════════════════════════════════════════════════════════════════════

describe("Transaction Integrity", () => {
  test("TC-TX: Transaction rollback on error prevents partial state", async () => {
    const beforeBalance = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    const initial = parseFloat(beforeBalance.rows[0].outstanding_balance);

    // Attempt to create a credit order with invalid data (should fail mid-transaction)
    try {
      await transaction(async (client) => {
        const orderNumber = `ORD-TX-${Date.now()}`;
        await client.query(
          `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, payment_status, amount_paid, outstanding_amount)
           VALUES ($1, $2, $3, 0, 0, 0, 'pending', 'credit', 'unpaid', 0, 0)`,
          [state.creditCustomer.id, orderNumber, JSON.stringify([{ productId: "nonexistent" }])]
        );

        // This should cause an integrity error (exceeding constraint)
        await client.query(
          `UPDATE users SET outstanding_balance = outstanding_balance + $1, updated_at = NOW() WHERE id = $2`,
          [999999999, state.creditCustomer.id]
        );

        // Force a constraint failure by inserting with invalid FK
        await client.query(
          `INSERT INTO invoices (order_id, invoice_number, status, subtotal, tax, total, amount_paid, outstanding_amount)
           VALUES ('00000000-0000-0000-0000-000000000000', 'INV-TX', 'issued', 0, 0, 0, 0, 0)`
        );
      });
    } catch {
      // Expected - transaction should roll back
    }

    // Balance should be unchanged
    const afterBalance = await query("SELECT outstanding_balance FROM users WHERE id = $1", [state.creditCustomer.id]);
    expect(parseFloat(afterBalance.rows[0].outstanding_balance)).toBe(initial);
  });
});
