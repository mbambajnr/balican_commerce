import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany, createTestOrder,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let adminToken: string;
let customerToken: string;

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("ops-admin"), role: "admin" });
  adminToken = generateToken(admin.id, "admin");
  const customer = await createTestUser({ email: makeEmail("ops-customer"), role: "customer" });
  customerToken = generateToken(customer.id, "customer");
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/admin/operations/summary", () => {
  it("returns 200 with all summary fields for admin", async () => {
    const res = await request(app)
      .get("/api/admin/operations/summary")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("openProcurementRequests");
    expect(res.body).toHaveProperty("pendingSupplierCreditReviews");
    expect(res.body).toHaveProperty("acceptedRequestsAwaitingConversion");
    expect(res.body).toHaveProperty("recentConvertedOrders");
    expect(Array.isArray(res.body.recentConvertedOrders)).toBe(true);
  });

  it("returns counts that match DB state", async () => {
    // Create a company + buyer to set up real data
    const company = await createTestCompany(makeUnique("Ops-Test-Co"));
    const buyer = await createTestUser({
      email: makeEmail("ops-buyer"),
      companyId: company.id,
      companyRole: "buyer",
    });
    const buyerToken = generateToken(buyer.id, "customer");

    // Create a submitted procurement request
    const req1 = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `Ops Test Submitted ${Date.now()}`,
        items: [{ productName: "Test Item", quantity: 1 }],
      });
    const req1Id = req1.body.request.id;
    await request(app)
      .patch(`/api/procurement/requests/${req1Id}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    // Create a supplier with pending credit
    const provider = await createTestCompany(makeUnique("Ops-Provider"));
    await query("UPDATE companies SET is_provider = true WHERE id = $1", [provider.id]);
    await query(
      `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier)
       VALUES ($1, 'unrated', 'unrated')
       ON CONFLICT (company_id) DO UPDATE SET vetting_status = 'unrated', credit_tier = 'unrated'`,
      [provider.id]
    );

    const res = await request(app)
      .get("/api/admin/operations/summary")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.openProcurementRequests).toBeGreaterThanOrEqual(1);
    expect(res.body.pendingSupplierCreditReviews).toBeGreaterThanOrEqual(1);

    // Cleanup test artifacts
    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [req1Id]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [req1Id]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [req1Id]).catch(() => {});
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/operations/summary");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin role", async () => {
    const res = await request(app)
      .get("/api/admin/operations/summary")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/ops-report", () => {
  it("rejects non-admin users and invalid windows", async () => {
    const forbidden = await request(app)
      .get("/api/admin/ops-report?days=7")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(forbidden.status).toBe(403);

    const invalid = await request(app)
      .get("/api/admin/ops-report?days=0")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(invalid.status).toBe(400);
  });

  it("aggregates the seeded deal loop and credit metrics correctly", async () => {
    const before = await request(app)
      .get("/api/admin/ops-report?days=1")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(before.status).toBe(200);

    const buyerCompany = await createTestCompany(makeUnique("Ops-Report-Buyer"));
    const providerOne = await createTestCompany(makeUnique("Ops-Report-Provider-A"));
    const providerTwo = await createTestCompany(makeUnique("Ops-Report-Provider-B"));
    const buyer = await createTestUser({ email: makeEmail(`ops-report-buyer-${Date.now()}`), companyId: buyerCompany.id });
    const supplierOne = await createTestUser({ email: makeEmail(`ops-report-supplier-a-${Date.now()}`), companyId: providerOne.id });
    const supplierTwo = await createTestUser({ email: makeEmail(`ops-report-supplier-b-${Date.now()}`), companyId: providerTwo.id });

    await query(
      `UPDATE companies SET credit_status = 'approved', approved_credit_limit = 1000, credit_used = 250
       WHERE id = $1`,
      [buyerCompany.id]
    );

    const scout = (await query(
      `INSERT INTO scout_requests (company_id, created_by, title, quantity, status, created_at)
       VALUES ($1, $2, $3, 1, 'open', NOW() - INTERVAL '2 hours') RETURNING id`,
      [buyerCompany.id, buyer.id, makeUnique("Ops report request")]
    )).rows[0];

    const quoteOne = (await query(
      `INSERT INTO scout_quotes
         (request_id, provider_company_id, submitted_by, quoted_price, status, created_at)
       VALUES ($1, $2, $3, 500, 'accepted', NOW() - INTERVAL '1 hour') RETURNING id`,
      [scout.id, providerOne.id, supplierOne.id]
    )).rows[0];
    await query(
      `INSERT INTO scout_quotes
         (request_id, provider_company_id, submitted_by, quoted_price, status, created_at)
       VALUES ($1, $2, $3, 550, 'declined', NOW() - INTERVAL '30 minutes')`,
      [scout.id, providerTwo.id, supplierTwo.id]
    );

    const agreement = (await query(
      `INSERT INTO scout_agreements
         (scout_request_id, buyer_company_id, provider_company_id, accepted_quote_id,
          status, agreed_price, agreed_at)
       VALUES ($1, $2, $3, $4, 'active', 500, NOW() - INTERVAL '20 minutes') RETURNING id`,
      [scout.id, buyerCompany.id, providerOne.id, quoteOne.id]
    )).rows[0];

    const fulfilledOrder = await createTestOrder({
      userId: buyer.id,
      total: 500,
      paymentMethod: "credit",
      paymentStatus: "partially_paid",
      amountPaid: 100,
      status: "completed",
    });
    await query(
      `UPDATE orders SET scout_request_id = $1, agreement_id = $2,
         payment_due_date = CURRENT_DATE + 1 WHERE id = $3`,
      [scout.id, agreement.id, fulfilledOrder.id]
    );
    await query(
      `INSERT INTO order_payments (order_id, user_id, amount, method, reference, recorded_by, paid_at)
       VALUES ($1, $2, 100, 'bank_transfer', $3, $2, NOW())`,
      [fulfilledOrder.id, buyer.id, makeUnique("OPS-REPAYMENT")]
    );

    const overdueOrder = await createTestOrder({
      userId: buyer.id,
      total: 200,
      paymentMethod: "credit",
      paymentStatus: "unpaid",
      status: "pending",
    });
    await query(
      "UPDATE orders SET payment_due_date = CURRENT_DATE - 1 WHERE id = $1",
      [overdueOrder.id]
    );

    const after = await request(app)
      .get("/api/admin/ops-report?days=1")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(after.status).toBe(200);

    expect(after.body.window.days).toBe(1);
    expect(after.body.sourcing.requestsCreated - before.body.sourcing.requestsCreated).toBe(1);
    expect(after.body.sourcing.requestsWithOneResponse48h - before.body.sourcing.requestsWithOneResponse48h).toBe(1);
    expect(after.body.sourcing.requestsWithTwoResponses48h - before.body.sourcing.requestsWithTwoResponses48h).toBe(1);
    expect(after.body.proposals.submitted - before.body.proposals.submitted).toBe(2);
    expect(after.body.proposals.accepted - before.body.proposals.accepted).toBe(1);
    expect(after.body.deals.agreementsCreated - before.body.deals.agreementsCreated).toBe(1);
    expect(after.body.deals.procurementOrdersCreated - before.body.deals.procurementOrdersCreated).toBe(1);
    expect(after.body.deals.ordersFulfilled - before.body.deals.ordersFulfilled).toBe(1);
    expect(after.body.credit.totalApprovedLimits - before.body.credit.totalApprovedLimits).toBe(1000);
    expect(after.body.credit.creditUsed - before.body.credit.creditUsed).toBe(250);
    expect(after.body.credit.overdueOrdersCount - before.body.credit.overdueOrdersCount).toBe(1);
    expect(after.body.credit.overdueOrdersValue - before.body.credit.overdueOrdersValue).toBe(200);
    expect(after.body.repayments.received - before.body.repayments.received).toBe(1);
    expect(after.body.repayments.value - before.body.repayments.value).toBe(100);
    expect(after.body.repayments.onTime - before.body.repayments.onTime).toBe(1);
    expect(after.body.sourcing.oneResponseRate48h).toBeCloseTo(
      after.body.sourcing.requestsWithOneResponse48h / after.body.sourcing.requestsCreated * 100,
      2
    );

    await query("DELETE FROM order_payments WHERE order_id = ANY($1)", [[fulfilledOrder.id, overdueOrder.id]]);
    await query("DELETE FROM orders WHERE id = ANY($1)", [[fulfilledOrder.id, overdueOrder.id]]);
    await query("DELETE FROM scout_agreements WHERE id = $1", [agreement.id]);
    await query("DELETE FROM scout_quotes WHERE request_id = $1", [scout.id]);
    await query("DELETE FROM scout_requests WHERE id = $1", [scout.id]);
  });
});

describe("Operations summary accepted→order conversion count", () => {
  it("accepted count decreases when an order is converted", async () => {
    // Setup
    const company = await createTestCompany(makeUnique("Ops-Accept-Co"));
    const buyer = await createTestUser({
      email: makeEmail("ops-accept-buyer"),
      companyId: company.id,
      companyRole: "buyer",
    });
    const buyerToken = generateToken(buyer.id, "customer");

    const provider = await createTestCompany(makeUnique("Ops-Accept-Prov"));
    await query("UPDATE companies SET is_provider = true, status = 'active', verification_status = 'approved' WHERE id = $1", [provider.id]);
    await query(
      `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier)
       VALUES ($1, 'approved', 'premium')
       ON CONFLICT (company_id) DO UPDATE SET vetting_status = 'approved', credit_tier = 'premium'`,
      [provider.id]
    );
    const pUser = await createTestUser({
      email: makeEmail("ops-accept-prov-user"),
      companyId: provider.id,
      companyRole: "company_admin",
    });
    const pToken = generateToken(pUser.id, "customer");

    // Create + submit + accept a request
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `Ops Conversion Test ${Date.now()}`,
        items: [{ productName: "Conv Item", quantity: 2 }],
        providerIds: [provider.id],
      });
    const rid = createRes.body.request.id;

    await request(app)
      .patch(`/api/procurement/requests/${rid}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/respond`)
      .set("Authorization", `Bearer ${pToken}`)
      .send({ response: "quote", quoteAmount: 10000 });

    await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${provider.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});

    // Check: 1 accepted awaiting conversion
    const before = await request(app)
      .get("/api/admin/operations/summary")
      .set("Authorization", `Bearer ${adminToken}`);
    const awaitingBefore = before.body.acceptedRequestsAwaitingConversion;

    // Convert to order
    await request(app)
      .post(`/api/procurement/requests/${rid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);

    // Check: count decreased by 1
    const after = await request(app)
      .get("/api/admin/operations/summary")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(after.body.acceptedRequestsAwaitingConversion).toBe(awaitingBefore - 1);

    // The new order appears in recent orders
    const recentNumbers = after.body.recentConvertedOrders.map((o: any) => o.order_number);
    expect(recentNumbers.some((n: string) => n.startsWith("PROC-"))).toBe(true);

    // Cleanup
    await query(
      "DELETE FROM orders WHERE procurement_request_id = $1",
      [rid]
    ).catch(() => {});
    await query(
      "DELETE FROM procurement_request_providers WHERE request_id = $1",
      [rid]
    ).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
  });
});
