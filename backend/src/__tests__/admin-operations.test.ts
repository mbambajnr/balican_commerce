import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany,
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
