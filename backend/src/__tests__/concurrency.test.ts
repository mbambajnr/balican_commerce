import request from "supertest";
import app from "../app";
import { query, transaction } from "../config/db";
import {
  createTestUser, createTestCompany, createTestCategory, createTestProduct,
  createTestQuotation, createTestQuotationItem,
  createTestOrder, createTestInvoice, createTestBankTransfer,
  generateToken, cleanupTestData,
} from "./helpers";

const state: Record<string, any> = {};

beforeAll(async () => {
  state.customerCompany = await createTestCompany("Concurrency Customer Co");

  state.adminUser = await createTestUser({
    email: "test-qa-concurrency-admin@test.com",
    firstName: "Concurrency",
    lastName: "Admin",
    role: "admin",
  });

  state.customerUser = await createTestUser({
    email: "test-qa-concurrency-customer@test.com",
    firstName: "Concurrency",
    lastName: "Customer",
    role: "customer",
    companyId: state.customerCompany.id,
  });

  state.adminToken = generateToken(state.adminUser.id, "admin");
  state.customerToken = generateToken(state.customerUser.id, "customer");

  // Shared category/product for any test that needs items
  state.category = await createTestCategory("QA Concurrency Cat");
  state.product = await createTestProduct({
    name: "QA Concurrency Product",
    price: 10000,
    categoryId: state.category.id,
    isActive: true,
  });
});

afterAll(async () => {
  // service_bookings is not in cleanupTestData — clean it manually first
  await query(
    "DELETE FROM activities WHERE entity_type = 'booking' AND entity_id IN (SELECT id FROM service_bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-qa-%'))"
  ).catch(() => {});
  await query(
    "DELETE FROM service_bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'test-qa-%')"
  ).catch(() => {});
  await cleanupTestData();
});

describe("Concurrency hardening", () => {

  test("CON-1: Only one concurrent quotation conversion succeeds", async () => {
    const quotation = await createTestQuotation({
      customerId: state.customerUser.id,
      status: "sent",
      totalAmount: 50000,
    });
    await createTestQuotationItem({
      quotationId: quotation.id,
      productId: state.product.id,
      description: "Race item",
      quantity: 5,
      unitPrice: 10000,
    });
    await query("UPDATE quotations SET status = 'accepted' WHERE id = $1", [quotation.id]);

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/orders/from-quotation/${quotation.id}`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send(),
      request(app)
        .post(`/api/orders/from-quotation/${quotation.id}`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send(),
    ]);

    const successes = [res1, res2].filter(r => r.status === 201);
    expect(successes.length).toBe(1);

    const orders = await query("SELECT id FROM orders WHERE quotation_id = $1", [quotation.id]);
    expect(orders.rows.length).toBe(1);

    const qCheck = await query("SELECT status FROM quotations WHERE id = $1", [quotation.id]);
    expect(qCheck.rows[0].status).toBe("converted_to_order");
  });

  test("CON-2: Concurrent duplicate Paystack webhooks do not double-count", async () => {
    const reference = "CONCUR-PAYSTACK-" + Date.now();

    const order = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "paystack",
      total: 50000,
      paystackReference: reference,
    });
    await createTestInvoice({ orderId: order.id, total: 50000, status: "pending_payment" });

    const payload = {
      event: "charge.success",
      data: { reference, amount: 5000000, currency: "GHS" },
    };

    const [res1, res2] = await Promise.all([
      request(app).post("/api/orders/paystack-webhook").send(payload),
      request(app).post("/api/orders/paystack-webhook").send(payload),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const payments = await query(
      "SELECT COUNT(*) as cnt FROM order_payments WHERE reference = $1 AND method = 'paystack'",
      [reference]
    );
    expect(parseInt(payments.rows[0].cnt)).toBe(1);

    const orderCheck = await query("SELECT amount_paid FROM orders WHERE id = $1", [order.id]);
    expect(parseFloat(orderCheck.rows[0].amount_paid)).toBe(50000);
  });

  test("CON-3: Only one concurrent bank transfer approval succeeds", async () => {
    const order = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "bank_transfer",
      total: 30000,
    });
    await createTestInvoice({ orderId: order.id, total: 30000 });

    const transfer = await createTestBankTransfer({
      orderId: order.id,
      userId: state.customerUser.id,
      amount: 30000,
      status: "pending_verification",
    });

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/admin/bank-transfers/${transfer.id}/approve`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send(),
      request(app)
        .post(`/api/admin/bank-transfers/${transfer.id}/approve`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send(),
    ]);

    const successes = [res1, res2].filter(r => r.status === 200);
    expect(successes.length).toBe(1);

    const btCheck = await query("SELECT status FROM bank_transfers WHERE id = $1", [transfer.id]);
    expect(btCheck.rows[0].status).toBe("successful");

    const orderCheck = await query("SELECT amount_paid FROM orders WHERE id = $1", [order.id]);
    expect(parseFloat(orderCheck.rows[0].amount_paid)).toBe(30000);
  });

  test("CON-4: Only one concurrent credit order succeeds when near limit", async () => {
    const creditCompany = await createTestCompany("Concurrency Credit Co");
    const creditUser = await createTestUser({
      email: `test-qa-credit-race-${Date.now()}@test.com`,
      firstName: "Credit",
      lastName: "Race",
      role: "customer",
      isCreditApproved: true,
      creditLimit: 15000,
      companyId: creditCompany.id,
    });
    await query("UPDATE users SET outstanding_balance = 0 WHERE id = $1", [creditUser.id]);
    const creditToken = generateToken(creditUser.id, "customer");

    const item = { productId: state.product.id, quantity: 1, unitPrice: 10000 };

    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/orders/credit")
        .set("Authorization", `Bearer ${creditToken}`)
        .send({ items: [item], subtotal: 10000, total: 10000 }),
      request(app)
        .post("/api/orders/credit")
        .set("Authorization", `Bearer ${creditToken}`)
        .send({ items: [item], subtotal: 10000, total: 10000 }),
    ]);

    const successes = [res1, res2].filter(r => r.status === 201);
    expect(successes.length).toBe(1);

    const orders = await query("SELECT COUNT(*) as cnt FROM orders WHERE user_id = $1", [creditUser.id]);
    expect(parseInt(orders.rows[0].cnt)).toBe(1);

    const balanceCheck = await query("SELECT outstanding_balance FROM users WHERE id = $1", [creditUser.id]);
    expect(parseFloat(balanceCheck.rows[0].outstanding_balance)).toBe(10000);
  });

  test("CON-5: Only one concurrent booking creation succeeds per order", async () => {
    const order = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "paystack",
      paymentStatus: "paid",
      total: 50000,
      amountPaid: 50000,
    });
    await createTestInvoice({ orderId: order.id, total: 50000, status: "paid" });

    const body = {
      orderId: order.id,
      preferredDate: "2026-07-15",
      location: "14 Race Street, Lagos",
      contactName: "Race Customer",
      contactPhone: "08012345678",
      serviceType: "installation",
    };

    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${state.customerToken}`)
        .send(body),
      request(app)
        .post("/api/bookings")
        .set("Authorization", `Bearer ${state.customerToken}`)
        .send(body),
    ]);

    const successes = [res1, res2].filter(r => r.status === 201);
    expect(successes.length).toBe(1);

    const bookings = await query(
      "SELECT COUNT(*) as cnt FROM service_bookings WHERE order_id = $1 AND status NOT IN ('cancelled')",
      [order.id]
    );
    expect(parseInt(bookings.rows[0].cnt)).toBe(1);
  });

  test("CON-6: Only one concurrent full payment succeeds", async () => {
    const referencePrefix = `RACE-FULL-${Date.now()}`;
    const order = await createTestOrder({
      userId: state.customerUser.id,
      paymentMethod: "bank_transfer",
      total: 10000,
      paymentStatus: "unpaid",
    });
    await createTestInvoice({ orderId: order.id, total: 10000, status: "pending_payment" });

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/admin/orders/${order.id}/record-payment`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send({ amount: 10000, method: "bank_transfer", reference: `${referencePrefix}-1` }),
      request(app)
        .post(`/api/admin/orders/${order.id}/record-payment`)
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send({ amount: 10000, method: "bank_transfer", reference: `${referencePrefix}-2` }),
    ]);

    const successes = [res1, res2].filter(r => r.status === 200);
    expect(successes.length).toBe(1);
    const failures = [res1, res2].filter(r => r.status !== 200);
    expect(failures.length).toBe(1);
    expect(failures[0].status).toBe(400);

    const orderCheck = await query(
      "SELECT payment_status, amount_paid, outstanding_amount FROM orders WHERE id = $1",
      [order.id]
    );
    expect(orderCheck.rows[0].payment_status).toBe("paid");
    expect(parseFloat(orderCheck.rows[0].amount_paid)).toBe(10000);
    expect(parseFloat(orderCheck.rows[0].outstanding_amount)).toBe(0);

    const payments = await query(
      "SELECT COUNT(*) as cnt FROM order_payments WHERE order_id = $1",
      [order.id]
    );
    expect(parseInt(payments.rows[0].cnt)).toBe(1);
  });

});
