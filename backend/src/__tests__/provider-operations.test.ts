import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let providerToken: string;
let providerCompanyId: string;
let buyerToken: string;
let customerToken: string;

beforeAll(async () => {
  // Provider
  providerCompanyId = (await createTestCompany(makeUnique("PrOps-Prov"))).id;
  await query(
    "UPDATE companies SET is_provider = true, company_type = 'supplier', verification_status = 'approved', status = 'active' WHERE id = $1",
    [providerCompanyId]
  );
  await query(
    `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier, credit_limit)
     VALUES ($1, 'approved', 'standard', 50000)
     ON CONFLICT (company_id) DO UPDATE SET vetting_status = 'approved', credit_tier = 'standard', credit_limit = 50000`,
    [providerCompanyId]
  );
  const pUser = await createTestUser({
    email: makeEmail("props-provider"),
    companyId: providerCompanyId,
    companyRole: "company_admin",
  });
  providerToken = generateToken(pUser.id, "customer");

  // Non-provider customer
  const customer = await createTestUser({ email: makeEmail("props-customer"), role: "customer" });
  customerToken = generateToken(customer.id, "customer");

  // Buyer for creating procurement requests
  const buyerCo = await createTestCompany(makeUnique("PrOps-Buyer"));
  const buyer = await createTestUser({
    email: makeEmail("props-buyer"),
    companyId: buyerCo.id,
    companyRole: "buyer",
  });
  buyerToken = generateToken(buyer.id, "customer");
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/provider/operations/summary", () => {
  it("returns 200 with all fields for provider", async () => {
    const res = await request(app)
      .get("/api/provider/operations/summary")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("incomingRequests");
    expect(res.body).toHaveProperty("quotedCount");
    expect(res.body).toHaveProperty("acceptedCount");
    expect(res.body).toHaveProperty("declinedCount");
    expect(res.body).toHaveProperty("creditProfile");
    expect(typeof res.body.incomingRequests).toBe("number");
    expect(typeof res.body.quotedCount).toBe("number");
  });

  it("returns credit profile when available", async () => {
    const res = await request(app)
      .get("/api/provider/operations/summary")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.creditProfile).not.toBeNull();
    expect(res.body.creditProfile.vetting_status).toBe("approved");
    expect(res.body.creditProfile.credit_tier).toBe("standard");
    expect(Number(res.body.creditProfile.credit_limit)).toBe(50000);
  });

  it("returns accurate counts for incoming and quoted requests", async () => {
    // Create two procurement requests inviting this provider
    const req1 = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `PrOps Incoming ${Date.now()}`,
        items: [{ productName: "Item A", quantity: 1 }],
        providerIds: [providerCompanyId],
      });
    const req1Id = req1.body.request.id;

    const req2 = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `PrOps Incoming 2 ${Date.now()}`,
        items: [{ productName: "Item B", quantity: 2 }],
        providerIds: [providerCompanyId],
      });
    const req2Id = req2.body.request.id;

    // Submit both so providers are invited
    await request(app)
      .patch(`/api/procurement/requests/${req1Id}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });
    await request(app)
      .patch(`/api/procurement/requests/${req2Id}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    // Respond to one (move it from invited→quoted)
    await request(app)
      .patch(`/api/provider/procurement/requests/${req1Id}/respond`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ response: "quote", quoteAmount: 25000 });

    // Check counts
    const res = await request(app)
      .get("/api/provider/operations/summary")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.incomingRequests).toBe(1); // req2 still invited
    expect(res.body.quotedCount).toBeGreaterThanOrEqual(1);

    // Cleanup
    await query("DELETE FROM procurement_request_providers WHERE request_id = ANY($1)", [[req1Id, req2Id]]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = ANY($1)", [[req1Id, req2Id]]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = ANY($1)", [[req1Id, req2Id]]).catch(() => {});
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/provider/operations/summary");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-provider", async () => {
    const res = await request(app)
      .get("/api/provider/operations/summary")
      .set("Authorization", `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });
});
