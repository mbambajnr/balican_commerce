import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCategory, createTestProduct,
  createTestQuotation, createTestQuotationItem,
  createTestOrder, createTestInvoice, createTestBankTransfer,
  generateToken, cleanupTestData,
} from "./helpers";

const state: Record<string, any> = {};

beforeAll(async () => {
  state.adminUser = await createTestUser({
    email: "test-qa-cust-admin@test.com",
    firstName: "Cust", lastName: "Admin", role: "admin",
  });
  state.superAdminUser = await createTestUser({
    email: "test-qa-cust-super@test.com",
    firstName: "Cust", lastName: "Super", role: "super_admin",
  });
  state.salesUser = await createTestUser({
    email: "test-qa-cust-sales@test.com",
    firstName: "Cust", lastName: "Sales", role: "sales",
  });
  state.opsUser = await createTestUser({
    email: "test-qa-cust-ops@test.com",
    firstName: "Cust", lastName: "Ops", role: "ops",
  });
  state.customerUser = await createTestUser({
    email: "test-qa-cust-customer@test.com",
    firstName: "Acme", lastName: "Corp",
    companyName: "Acme Corp",
    creditLimit: 100000,
    isCreditApproved: true,
    paymentTermsDays: 30,
  });
  state.customerUser2 = await createTestUser({
    email: "test-qa-cust-customer2@test.com",
    firstName: "Beta", lastName: "Inc",
    companyName: "Beta Inc",
    creditLimit: 0,
    isCreditApproved: false,
  });

  state.adminToken = generateToken(state.adminUser.id, "admin");
  state.superToken = generateToken(state.superAdminUser.id, "super_admin");
  state.salesToken = generateToken(state.salesUser.id, "sales");
  state.opsToken = generateToken(state.opsUser.id, "ops");
  state.customerToken = generateToken(state.customerUser.id, "customer");

  const cat = await createTestCategory("QA-Cust-Test");
  state.product = await createTestProduct({ categoryId: cat.id, price: 5000 });

  const order1 = await createTestOrder({
    userId: state.customerUser.id,
    total: 30000, paymentStatus: "unpaid",
  } as any);
  state.order1 = order1;
  const order2 = await createTestOrder({
    userId: state.customerUser.id,
    total: 20000, paymentStatus: "paid", amountPaid: 20000,
  } as any);
  await createTestInvoice({ orderId: order1.id, total: 30000, status: "issued", outstandingAmount: 30000 });
  await createTestInvoice({ orderId: order2.id, total: 20000, status: "paid", amountPaid: 20000, outstandingAmount: 0 });

  state.createdOrderIds = [order1.id, order2.id];

  const q = await createTestQuotation({ customerId: state.customerUser.id, status: "sent", totalAmount: 15000 });
  state.quotation = q;
  await createTestQuotationItem({ quotationId: q.id, productId: state.product.id });

  await query(
    "INSERT INTO activities (user_id, type, entity_type, entity_id, description, metadata) VALUES ($1, 'order.created', 'order', $2, 'Test activity', '{}')",
    [state.customerUser.id, order1.id]
  );
});

afterAll(async () => {
  await cleanupTestData();
});

describe("Admin Customer Endpoints", () => {

  /* ── List / Search / Filter ── */

  test("CUST-1: GET /admin/customers returns paginated list", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers).toBeDefined();
    expect(Array.isArray(res.body.customers)).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  test("CUST-2: GET /admin/customers filters by search (name/email/phone/company)", async () => {
    const res = await request(app)
      .get("/api/admin/customers?search=Acme")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.customers.some((c: any) => c.company_name === "Acme Corp")).toBe(true);
  });

  test("CUST-3: GET /admin/customers filters by creditApproved", async () => {
    const res = await request(app)
      .get("/api/admin/customers?creditApproved=true")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers.every((c: any) => c.is_credit_approved === true)).toBe(true);
  });

  test("CUST-4: GET /admin/customers filters by hasOutstanding", async () => {
    const res = await request(app)
      .get("/api/admin/customers?hasOutstanding=true")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBeGreaterThanOrEqual(1);
  });

  test("CUST-5: GET /admin/customers filters by company", async () => {
    const res = await request(app)
      .get("/api/admin/customers?company=Beta")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers.some((c: any) => c.company_name === "Beta Inc")).toBe(true);
  });

  test("CUST-6: GET /admin/customers supports sorting", async () => {
    const res = await request(app)
      .get("/api/admin/customers?sortBy=first_name&sortOrder=asc")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBeGreaterThanOrEqual(2);
  });

  /* ── Customer Detail ── */

  test("CUST-7: GET /admin/customers/:id returns full detail", async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${state.customerUser.id}`)
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customer).toBeDefined();
    expect(res.body.customer.email).toBe(state.customerUser.email);
    expect(res.body.customer.stats).toBeDefined();
    expect(res.body.customer.stats.totalOrders).toBeGreaterThanOrEqual(2);
    expect(res.body.customer.stats.totalSpent).toBeGreaterThan(0);
    expect(res.body.customer.recentOrders).toBeDefined();
    expect(res.body.customer.recentQuotations).toBeDefined();
  });

  test("CUST-8: GET /admin/customers/:id returns 404 for unknown customer", async () => {
    const res = await request(app)
      .get("/api/admin/customers/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(404);
  });

  /* ── Financial Summary ── */

  test("CUST-9: GET /admin/customers/:id/financial-summary returns aggregated data", async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${state.customerUser.id}/financial-summary`)
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalOrders).toBeGreaterThanOrEqual(2);
    expect(res.body.summary.totalOrderValue).toBeGreaterThan(0);
    expect(res.body.summary.creditLimit).toBe(100000);
    expect(res.body.summary.isCreditApproved).toBe(true);
    expect(typeof res.body.summary.availableCredit).toBe("number");
    expect(typeof res.body.summary.averageOrderValue).toBe("number");
  });

  /* ── Timeline ── */

  test("CUST-10: GET /admin/customers/:id/timeline returns events", async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${state.customerUser.id}/timeline`)
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.events).toBeDefined();
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  /* ── Profile Update ── */

  test("CUST-11: PATCH /admin/customers/:id updates customer profile", async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${state.customerUser.id}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ firstName: "AcmeUpdated", phone: "08012345678" });

    expect(res.status).toBe(200);
    expect(res.body.customer.first_name).toBe("AcmeUpdated");

    const check = await query("SELECT first_name FROM users WHERE id = $1", [state.customerUser.id]);
    expect(check.rows[0].first_name).toBe("AcmeUpdated");

    await query("UPDATE users SET first_name = 'Acme', phone = NULL WHERE id = $1", [state.customerUser.id]);
  });

  test("CUST-12: PATCH /admin/customers/:id rejects duplicate email", async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${state.customerUser.id}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ email: state.customerUser2.email });

    expect(res.status).toBe(409);
  });

  /* ── Credit Settings ── */

  test("CUST-13: PATCH /admin/customers/:id/credit-settings updates credit meta", async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${state.customerUser.id}/credit-settings`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ creditLimit: 200000, isCreditApproved: true, paymentTermsDays: 45 });

    expect(res.status).toBe(200);
    expect(Number(res.body.customer.credit_limit)).toBe(200000);
    expect(res.body.customer.is_credit_approved).toBe(true);
    expect(res.body.customer.payment_terms_days).toBe(45);

    await query(
      "UPDATE users SET credit_limit = 100000, is_credit_approved = true, payment_terms_days = 30 WHERE id = $1",
      [state.customerUser.id]
    );
  });

  test("CUST-14: PATCH /admin/customers/:id/credit-settings rejects non-admin", async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${state.customerUser.id}/credit-settings`)
      .set("Authorization", `Bearer ${state.salesToken}`)
      .send({ creditLimit: 50000 });

    expect(res.status).toBe(403);
  });

  /* ── Role-Based Access ── */

  test("CUST-15: admin and super_admin can access all customer endpoints", async () => {
    for (const token of [state.adminToken, state.superToken]) {
      const r1 = await request(app).get("/api/admin/customers").set("Authorization", `Bearer ${token}`);
      expect(r1.status).toBe(200);
      const r2 = await request(app).get(`/api/admin/customers/${state.customerUser.id}`).set("Authorization", `Bearer ${token}`);
      expect(r2.status).toBe(200);
    }
  });

  test("CUST-16: sales can view customer detail and financial summary but not credit settings", async () => {
    const r1 = await request(app).get(`/api/admin/customers/${state.customerUser.id}`).set("Authorization", `Bearer ${state.salesToken}`);
    expect(r1.status).toBe(200);

    const r2 = await request(app).get(`/api/admin/customers/${state.customerUser.id}/financial-summary`).set("Authorization", `Bearer ${state.salesToken}`);
    expect(r2.status).toBe(200);

    const r3 = await request(app).get(`/api/admin/customers/${state.customerUser.id}/timeline`).set("Authorization", `Bearer ${state.salesToken}`);
    expect(r3.status).toBe(200);
  });

  test("CUST-17: ops can view customer detail and timeline but not financial summary", async () => {
    const r1 = await request(app).get(`/api/admin/customers/${state.customerUser.id}`).set("Authorization", `Bearer ${state.opsToken}`);
    expect(r1.status).toBe(200);

    const r2 = await request(app).get(`/api/admin/customers/${state.customerUser.id}/financial-summary`).set("Authorization", `Bearer ${state.opsToken}`);
    expect(r2.status).toBe(403);
  });

  test("CUST-18: customer cannot access admin customer endpoints", async () => {
    const res = await request(app)
      .get("/api/admin/customers")
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(403);
  });
});
