import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  cleanupTestData,
  createTestCategory,
  createTestCompany,
  createTestUser,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

describe("Commission ledger", () => {
  let buyerCompanyId: string;
  let providerCompanyId: string;
  let otherProviderCompanyId: string;
  let buyerUserId: string;
  let providerUserId: string;
  let adminUserId: string;
  let buyerToken: string;
  let providerToken: string;
  let otherProviderToken: string;
  let adminToken: string;
  let categoryId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const buyerCompany = await createTestCompany(makeUnique("commission-buyer"));
    buyerCompanyId = buyerCompany.id;

    const providerCompany = await createTestCompany(makeUnique("commission-provider"));
    providerCompanyId = providerCompany.id;
    await query(
      `UPDATE companies
       SET is_provider = true, company_type = 'supplier',
           verification_status = 'approved', status = 'active'
       WHERE id = $1`,
      [providerCompanyId]
    );

    const otherProviderCompany = await createTestCompany(makeUnique("commission-other-provider"));
    otherProviderCompanyId = otherProviderCompany.id;
    await query(
      `UPDATE companies
       SET is_provider = true, company_type = 'supplier',
           verification_status = 'approved', status = 'active'
       WHERE id = $1`,
      [otherProviderCompanyId]
    );

    const buyer = await createTestUser({
      email: makeEmail(`commission-buyer-${Date.now()}`),
      companyId: buyerCompanyId,
    });
    buyerUserId = buyer.id;
    buyerToken = generateToken(buyer.id, "customer");

    const provider = await createTestUser({
      email: makeEmail(`commission-provider-${Date.now()}`),
      companyId: providerCompanyId,
    });
    providerUserId = provider.id;
    providerToken = generateToken(provider.id, "customer");

    const otherProvider = await createTestUser({
      email: makeEmail(`commission-other-provider-${Date.now()}`),
      companyId: otherProviderCompanyId,
    });
    otherProviderToken = generateToken(otherProvider.id, "customer");

    const admin = await createTestUser({
      email: makeEmail(`commission-admin-${Date.now()}`),
      role: "admin",
    });
    adminUserId = admin.id;
    adminToken = generateToken(admin.id, "admin");

    const category = await createTestCategory(makeUnique("commission-category"));
    categoryId = category.id;

    await query("UPDATE commission_rates SET rate_percent = 5, is_active = true WHERE category_id IS NULL");
    await query(
      `INSERT INTO commission_rates (category_id, rate_percent, is_active, created_by)
       VALUES ($1, 7.5, true, $2)
       ON CONFLICT (category_id) WHERE category_id IS NOT NULL
       DO UPDATE SET rate_percent = 7.5, is_active = true, updated_at = NOW()`,
      [categoryId, adminUserId]
    );
  });

  afterAll(async () => {
    await query("DELETE FROM commission_ledger WHERE order_id = ANY($1)", [createdOrderIds]).catch(() => {});
    await query("DELETE FROM order_status_history WHERE order_id = ANY($1)", [createdOrderIds]).catch(() => {});
    await query("DELETE FROM orders WHERE id = ANY($1)", [createdOrderIds]).catch(() => {});
    await query("DELETE FROM scout_agreements WHERE buyer_company_id = $1", [buyerCompanyId]).catch(() => {});
    await query("DELETE FROM scout_quotes WHERE provider_company_id = $1", [providerCompanyId]).catch(() => {});
    await query("DELETE FROM scout_requests WHERE company_id = $1", [buyerCompanyId]).catch(() => {});
    await query("DELETE FROM users WHERE id = ANY($1)", [[buyerUserId, providerUserId, adminUserId]]).catch(() => {});
    await query("DELETE FROM companies WHERE id = ANY($1)", [[buyerCompanyId, providerCompanyId, otherProviderCompanyId]]).catch(() => {});
    await cleanupTestData();
  });

  async function createDeliveredOrder(total: number, category: string | null = categoryId) {
    const request = await query(
      `INSERT INTO scout_requests
         (company_id, created_by, title, description, quantity, unit, status, category_id)
       VALUES ($1, $2, $3, 'Commission test request', 1, 'unit', 'awarded', $4)
       RETURNING id`,
      [buyerCompanyId, buyerUserId, makeUnique("commission-request"), category]
    );
    const requestId = request.rows[0].id;

    const quote = await query(
      `INSERT INTO scout_quotes
         (request_id, provider_company_id, submitted_by, quoted_price, status)
       VALUES ($1, $2, $3, $4, 'accepted')
       RETURNING id`,
      [requestId, providerCompanyId, providerUserId, total]
    );

    const agreement = await query(
      `INSERT INTO scout_agreements
         (scout_request_id, buyer_company_id, provider_company_id, accepted_quote_id,
          status, agreed_price)
       VALUES ($1, $2, $3, $4, 'completed', $5)
       RETURNING id`,
      [requestId, buyerCompanyId, providerCompanyId, quote.rows[0].id, total]
    );

    const order = await query(
      `INSERT INTO orders
         (user_id, order_number, items, subtotal, tax, total, status,
          payment_status, amount_paid, outstanding_amount, payment_method,
          order_source, scout_request_id, agreement_id)
       VALUES ($1, $2, $3, $4, 0, $4, 'delivered',
          'paid', $4, 0, 'bank_transfer', 'scout', $5, $6)
       RETURNING id`,
      [
        buyerUserId,
        `COMM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        JSON.stringify([{ name: "Commission test item", price: total, quantity: 1 }]),
        total,
        requestId,
        agreement.rows[0].id,
      ]
    );
    createdOrderIds.push(order.rows[0].id);
    return order.rows[0].id;
  }

  test("accrues category commission exactly once when buyer completes delivered order", async () => {
    const orderId = await createDeliveredOrder(1000, categoryId);

    const complete = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "complete" });
    expect(complete.status).toBe(200);
    expect(complete.body.transition.to).toBe("completed");

    const replay = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "complete" });
    expect(replay.status).toBe(400);

    const ledger = await query("SELECT * FROM commission_ledger WHERE order_id = $1", [orderId]);
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].base_amount)).toBe(1000);
    expect(Number(ledger.rows[0].rate_percent)).toBe(7.5);
    expect(Number(ledger.rows[0].commission_amount)).toBe(75);
    expect(ledger.rows[0].currency).toBe("GHS");
  });

  test("falls back to global default rate when no category override exists", async () => {
    const orderId = await createDeliveredOrder(1000, null);
    const complete = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "complete" });
    expect(complete.status).toBe(200);

    const ledger = await query("SELECT * FROM commission_ledger WHERE order_id = $1", [orderId]);
    expect(Number(ledger.rows[0].rate_percent)).toBe(5);
    expect(Number(ledger.rows[0].commission_amount)).toBe(50);
  });

  test("admin report returns commission totals", async () => {
    const res = await request(app)
      .get("/api/admin/commissions?days=30")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.count).toBeGreaterThanOrEqual(2);
    expect(res.body.summary.commissionTotal).toBeGreaterThanOrEqual(125);
    expect(res.body.commissions.some((row: any) => row.provider_company_id === providerCompanyId)).toBe(true);
  });

  test("provider statement is tenant-scoped", async () => {
    const own = await request(app)
      .get("/api/provider/commissions")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(own.status).toBe(200);
    expect(own.body.commissions.length).toBeGreaterThanOrEqual(2);
    expect(own.body.commissions.every((row: any) => row.provider_company_id === providerCompanyId)).toBe(true);

    const other = await request(app)
      .get("/api/provider/commissions")
      .set("Authorization", `Bearer ${otherProviderToken}`);
    expect(other.status).toBe(200);
    expect(other.body.commissions).toHaveLength(0);
  });
});
