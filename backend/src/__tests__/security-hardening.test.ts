import request from "supertest";
import app from "../app";
import { query, pool } from "../config/db";
import {
  createTestUser, createTestCompany, createTestProduct, createTestCategory,
  createTestOrder, createTestInvoice, cleanupTestData, generateToken,
  makeEmail, createTestRFQ, createTestQuotation, createTestQuotationItem,
} from "./helpers";

let adminToken: string;
let approvedToken: string;
let pendingToken: string;
let rejectedToken: string;
let secondCompanyToken: string;
let regularCustomerUser: any;
let regularCustomerToken: string;
let adminUser: any;
let approvedUser: any;
let pendingUser: any;
let rejectedUser: any;
let secondCompanyUser: any;
let testProduct: any;
let testCategory: any;
let activeCompany: any;
let secondCompany: any;
let testOrder: any;

/* ── Shared setup ── */
beforeAll(async () => {
  activeCompany = await createTestCompany("Hardening Active Co");
  secondCompany = await createTestCompany("Hardening Second Co");

  // Create a rejected company
  const rc = await query(
    `INSERT INTO companies (name, email, contact_person_name, status)
     VALUES ($1, $2, $3, 'rejected')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [`Hardening-Rejected-${Date.now()}`, `harden-rejected@test-sslplan.com`, "Rejected Contact"]
  );
  const rejectedCompany = rc.rows[0] || await query(
    "SELECT * FROM companies WHERE name LIKE 'Hardening-Rejected-%'"
  ).then(r => r.rows[0]);

  adminUser = await createTestUser({ email: makeEmail("harden-admin"), role: "admin" });
  adminToken = generateToken(adminUser.id, "admin");

  approvedUser = await createTestUser({ email: makeEmail("harden-approved"), companyId: activeCompany.id, companyName: activeCompany.name });
  approvedToken = generateToken(approvedUser.id, "customer");

  pendingUser = await createTestUser({ email: makeEmail("harden-pending"), accountStatus: "pending", companyName: "Pending Hardening Co" });
  pendingToken = generateToken(pendingUser.id, "customer");

  rejectedUser = await createTestUser({ email: makeEmail("harden-rejected"), companyName: `Hardening-Rejected-${Date.now()}` });
  await query("UPDATE users SET company_id = $1, account_status = 'rejected' WHERE email = $2",
    [rejectedCompany.id, makeEmail("harden-rejected")]);
  rejectedToken = generateToken(rejectedUser.id, "customer");

  secondCompanyUser = await createTestUser({ email: makeEmail("harden-second"), companyId: secondCompany.id, companyName: secondCompany.name });
  secondCompanyToken = generateToken(secondCompanyUser.id, "customer");

  regularCustomerUser = await createTestUser({ email: makeEmail("harden-regular"), role: "customer" });
  regularCustomerToken = generateToken(regularCustomerUser.id, "customer");

  testCategory = await createTestCategory("Hardening Category");
  testProduct = await createTestProduct({ categoryId: testCategory.id, price: 5000, name: `Harden-Product-${Date.now()}` });

  testOrder = await createTestOrder({
    userId: approvedUser.id,
    paymentMethod: "bank_transfer",
    paymentStatus: "unpaid",
    total: 10000,
    items: [{ productId: testProduct.id, name: testProduct.name, price: 5000, quantity: 2 }],
  });
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

/* ═══════════════════════════════════════════════════════
   TC-SH-1: requireCompanyActive on order creation
   ═══════════════════════════════════════════════════════ */
describe("Company active status — order creation enforcement", () => {
  const orderPayload = {
    items: [{ productId: "00000000-0000-0000-0000-000000000001", name: "Test", price: 100, quantity: 1 }],
    subtotal: 100,
    tax: 0,
    total: 100,
    paymentMethod: "bank_transfer",
  };

  it("blocks pending company from creating orders", async () => {
    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send(orderPayload);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not active/i);
  });

  it("blocks rejected company from creating orders", async () => {
    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${rejectedToken}`)
      .send(orderPayload);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not active/i);
  });

  it("allows approved company to create orders", async () => {
    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({
        ...orderPayload,
        items: [{ productId: testProduct.id, name: testProduct.name, price: 5000, quantity: 1 }],
      });
    expect(r.status).toBe(201);
  });

  it("allows regular customer (no company) to create orders", async () => {
    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${regularCustomerToken}`)
      .send({
        ...orderPayload,
        items: [{ productId: testProduct.id, name: testProduct.name, price: 5000, quantity: 1 }],
      });
    expect(r.status).toBe(201);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-2: requireCompanyActive on credit orders
   ═══════════════════════════════════════════════════════ */
describe("Company active status — credit order", () => {
  it("blocks pending company from credit orders", async () => {
    const r = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({
        items: [{ productId: testProduct.id, quantity: 1, unitPrice: 5000 }],
        subtotal: 5000,
        total: 5000,
      });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not active/i);
  });

  it("blocks rejected company from credit orders", async () => {
    const r = await request(app)
      .post("/api/orders/credit")
      .set("Authorization", `Bearer ${rejectedToken}`)
      .send({
        items: [{ productId: testProduct.id, quantity: 1, unitPrice: 5000 }],
        subtotal: 5000,
        total: 5000,
      });
    expect(r.status).toBe(403);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-3: requireCompanyActive on bank transfer
   ═══════════════════════════════════════════════════════ */
describe("Company active status — bank transfer submission", () => {
  it("blocks pending company from submitting bank transfers", async () => {
    const r = await request(app)
      .post(`/api/orders/${testOrder.id}/bank-transfer`)
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({
        amount: 5000,
        transferReference: `TFR-SH-${Date.now()}`,
      });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not active/i);
  });

  it("blocks rejected company from submitting bank transfers", async () => {
    const r = await request(app)
      .post(`/api/orders/${testOrder.id}/bank-transfer`)
      .set("Authorization", `Bearer ${rejectedToken}`)
      .send({
        amount: 5000,
        transferReference: `TFR-SH-${Date.now()}`,
      });
    expect(r.status).toBe(403);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-4: requireCompanyActive on paystack init
   ═══════════════════════════════════════════════════════ */
describe("Company active status — paystack initialization", () => {
  it("blocks pending company from paystack init", async () => {
    const r = await request(app)
      .post(`/api/orders/${testOrder.id}/paystack-init`)
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ email: "test@test.com" });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not active/i);
  });

  it("blocks rejected company from paystack init", async () => {
    const r = await request(app)
      .post(`/api/orders/${testOrder.id}/paystack-init`)
      .set("Authorization", `Bearer ${rejectedToken}`)
      .send({ email: "test@test.com" });
    expect(r.status).toBe(403);
  });

  it("allows approved company to init paystack", async () => {
    const r = await request(app)
      .post(`/api/orders/${testOrder.id}/paystack-init`)
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ email: approvedUser.email });
    // Should get 400 (missing Paystack secret) rather than 403
    expect(r.status).not.toBe(403);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-5: requireCompanyActive on booking creation
   ═══════════════════════════════════════════════════════ */
describe("Company active status — booking creation", () => {
  it("blocks pending company from creating bookings", async () => {
    const r = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({
        orderId: testOrder.id,
        preferredDate: "2026-06-01",
        location: "Test Location",
        contactName: "Test",
        contactPhone: "+233500000000",
      });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not active/i);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-6: Cross-company data isolation
   ═══════════════════════════════════════════════════════ */
describe("Cross-company data isolation", () => {
  it("denies viewing another company's order", async () => {
    const r = await request(app)
      .get(`/api/orders/${testOrder.id}`)
      .set("Authorization", `Bearer ${secondCompanyToken}`);
    expect(r.status).toBe(404);
  });

  it("denies viewing another company's RFQ", async () => {
    const rfq = await createTestRFQ({ userId: approvedUser.id, productId: testProduct.id });
    const r = await request(app)
      .get(`/api/rfqs/${rfq.id}`)
      .set("Authorization", `Bearer ${secondCompanyToken}`);
    expect(r.status).toBe(404);
  });

  it("denies viewing another company's quotation", async () => {
    const q = await createTestQuotation({ customerId: approvedUser.id, status: "draft" });
    await createTestQuotationItem({ quotationId: q.id, productId: testProduct.id });
    const r = await request(app)
      .get(`/api/customer/quotations/${q.id}`)
      .set("Authorization", `Bearer ${secondCompanyToken}`);
    expect(r.status).toBe(404);
  });

  it("denies quoting another company's quotation", async () => {
    const q = await createTestQuotation({ customerId: approvedUser.id, status: "sent" });
    await createTestQuotationItem({ quotationId: q.id, productId: testProduct.id });
    const r = await request(app)
      .post(`/api/customer/quotations/${q.id}/accept`)
      .set("Authorization", `Bearer ${secondCompanyToken}`);
    expect(r.status).toBe(404);
  });

  it("denies viewing another company's booking", async () => {
    // Create a booking for approved user
    const bookingResult = await query(
      `INSERT INTO service_bookings (order_id, user_id, preferred_date, location, contact_name, contact_phone, status)
       VALUES ($1, $2, '2026-06-01', 'Test', 'Test', '+233500000000', 'requested')
       RETURNING *`,
      [testOrder.id, approvedUser.id]
    );
    const r = await request(app)
      .get(`/api/bookings/${bookingResult.rows[0].id}`)
      .set("Authorization", `Bearer ${secondCompanyToken}`);
    expect(r.status).toBe(404);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-7: Admin-only endpoint protection
   ═══════════════════════════════════════════════════════ */
describe("Admin-only endpoint protection", () => {
  it("denies non-admin from invoice resend", async () => {
    const inv = await createTestInvoice({ orderId: testOrder.id });
    const r = await request(app)
      .post(`/api/orders/admin/invoices/${inv.id}/send`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/admin/i);
  });

  it("denies non-admin from admin RFQ status update", async () => {
    const rfq = await createTestRFQ({ userId: approvedUser.id, productId: testProduct.id });
    const r = await request(app)
      .patch(`/api/rfqs/${rfq.id}/status`)
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ status: "quoted" });
    expect(r.status).toBe(403);
  });

  it("denies non-admin from admin quotation send", async () => {
    const q = await createTestQuotation({ customerId: approvedUser.id, status: "draft" });
    await createTestQuotationItem({ quotationId: q.id, productId: testProduct.id });
    const r = await request(app)
      .post(`/api/admin/quotations/${q.id}/send`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(403);
  });

  it("denies non-admin from admin dashboard", async () => {
    const r = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(403);
  });

  it("denies non-admin from company approval", async () => {
    const company = await createTestCompany(`SH-Deny-${Date.now()}`);
    await query("UPDATE companies SET status = 'pending' WHERE id = $1", [company.id]);
    const r = await request(app)
      .patch(`/api/admin/companies/${company.id}/approve`)
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ status: "active" });
    expect(r.status).toBe(403);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-8: hide_price implementation
   ═══════════════════════════════════════════════════════ */
describe("hide_price feature", () => {
  let hiddenProduct: any;
  let visibleProduct: any;

  beforeAll(async () => {
    hiddenProduct = await createTestProduct({
      categoryId: testCategory.id, price: 9999, name: `Hidden-${Date.now()}`,
    });
    await query("UPDATE products SET hide_price = true WHERE id = $1", [hiddenProduct.id]);
    // Assign company price for hiddenProduct too (hide_price overrides)
    await query(
      `INSERT INTO company_prices (company_id, product_id, price) VALUES ($1, $2, $3)`,
      [activeCompany.id, hiddenProduct.id, 8000]
    );

    visibleProduct = await createTestProduct({
      categoryId: testCategory.id, price: 8888, name: `Visible-${Date.now()}`,
    });
    // Assign company price — approved user sees this, not base price
    await query(
      `INSERT INTO company_prices (company_id, product_id, price) VALUES ($1, $2, $3)`,
      [activeCompany.id, visibleProduct.id, 7000]
    );
  });

  it("hide_price=true: guest sees null price", async () => {
    const r = await request(app).get(`/api/products/${hiddenProduct.slug}`);
    expect(r.body.product.price).toBeNull();
  });

  it("hide_price=false: guest sees null price (quote-first)", async () => {
    const r = await request(app).get(`/api/products/${visibleProduct.slug}`);
    expect(r.body.product.price).toBeNull();
  });

  it("hide_price=true: approved user sees null price (company price overridden by hide_price)", async () => {
    const r = await request(app)
      .get(`/api/products/${hiddenProduct.slug}`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.body.product.price).toBeNull();
  });

  it("hide_price=false: approved user sees company price (not base price)", async () => {
    const r = await request(app)
      .get(`/api/products/${visibleProduct.slug}`)
      .set("Authorization", `Bearer ${approvedToken}`);
    // Should see the company-specific price (7000), not the internal base price (8888)
    expect(parseFloat(r.body.product.price)).toBe(7000);
  });

  it("hide_price=true: admin sees null price (hidden from everyone)", async () => {
    const r = await request(app)
      .get(`/api/products/${hiddenProduct.slug}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.body.product.price).toBeNull();
  });

  it("hide_price=true: product listing hides price for approved user", async () => {
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${approvedToken}`);
    const found = r.body.products.find((p: any) => p.id === hiddenProduct.id);
    expect(found).toBeDefined();
    expect(found.price).toBeNull();
  });

  it("hide_price=false: product listing shows company price for approved user", async () => {
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${approvedToken}`);
    const found = r.body.products.find((p: any) => p.id === visibleProduct.id);
    expect(found).toBeDefined();
    // Should see the company-specific price (7000), not the internal base price (8888)
    expect(parseFloat(found.price)).toBe(7000);
  });
});

/* ═══════════════════════════════════════════════════════
   TC-SH-9: Unauthenticated access blocked
   ═══════════════════════════════════════════════════════ */
describe("Unauthenticated access blocked", () => {
  it("blocks guest from order creation", async () => {
    const r = await request(app)
      .post("/api/orders")
      .send({ items: [], subtotal: 0, tax: 0, total: 0, paymentMethod: "bank_transfer" });
    expect(r.status).toBe(401);
  });

  it("blocks guest from customer quotations", async () => {
    const r = await request(app).get("/api/customer/quotations");
    expect(r.status).toBe(401);
  });

  it("blocks guest from admin endpoints", async () => {
    const r = await request(app).get("/api/admin/dashboard");
    expect(r.status).toBe(401);
  });

  it("blocks guest from bookings list", async () => {
    const r = await request(app).get("/api/bookings");
    expect(r.status).toBe(401);
  });

  it("blocks guest from cart", async () => {
    const r = await request(app).get("/api/cart");
    expect(r.status).toBe(401);
  });
});
