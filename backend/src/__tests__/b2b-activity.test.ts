import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let buyerToken: string;
let buyerCompanyId: string;
let providerToken: string;
let providerCompanyId: string;
let adminToken: string;
let requestId: string;

beforeAll(async () => {
  adminToken = generateToken((await createTestUser({ email: makeEmail("act-admin"), role: "admin" })).id, "admin");

  buyerCompanyId = (await createTestCompany(makeUnique("ACT-Buyer"))).id;
  const buyer = await createTestUser({
    email: makeEmail("act-buyer"), companyId: buyerCompanyId, companyRole: "buyer",
  });
  buyerToken = generateToken(buyer.id, "customer");

  const pc = await createTestCompany(makeUnique("ACT-Provider"));
  providerCompanyId = pc.id;
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier',
     verification_status = 'approved', status = 'active' WHERE id = $1`,
    [providerCompanyId]
  );
  const provider = await createTestUser({
    email: makeEmail("act-provider"), companyId: providerCompanyId, companyRole: "buyer",
  });
  providerToken = generateToken(provider.id, "customer");

  // Create a procurement request
  const r = await request(app)
    .post("/api/procurement/requests")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      title: "Activity Test Request",
      description: "Test",
      requestType: "product_supply",
      items: [{ productName: "Test Widget", quantity: 5 }],
      providerCompanyIds: [providerCompanyId],
    });
  requestId = r.body.request?.id || r.body.id;
});

afterAll(async () => {
  await cleanupTestData();
});

describe("Procurement Activity Feed", () => {
  it("buyer can see own company's activity feed", async () => {
    const r = await request(app)
      .get("/api/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities).toBeDefined();
    expect(Array.isArray(r.body.activities)).toBe(true);
    expect(r.body.activities.length).toBeGreaterThanOrEqual(1);
    expect(r.body.pagination).toBeDefined();
    // All activities should belong to buyer's company
    for (const a of r.body.activities) {
      expect(a.procurement_request_id).toBe(requestId);
    }
  });

  it("buyer activity does not include other companies' activities", async () => {
    // Create a request from a different company (anonymous — just log an activity)
    const otherCo = await createTestCompany(makeUnique("ACT-Other"));
    await query(
      `INSERT INTO procurement_activity_log (company_id, event_type, description, metadata)
       VALUES ($1, 'request.created', 'Other company request', '{}')`,
      [otherCo.id]
    );

    const r = await request(app)
      .get("/api/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    // None of the returned activities should reference the other company
    const otherCompanyActivities = r.body.activities.filter(
      (a: any) => a.description === "Other company request"
    );
    expect(otherCompanyActivities.length).toBe(0);
  });

  it("buyer can filter activity by event type", async () => {
    const r = await request(app)
      .get(`/api/procurement/activity?eventType=request.created`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities.length).toBeGreaterThanOrEqual(1);
    for (const a of r.body.activities) {
      expect(a.event_type).toBe("request.created");
    }
  });

  it("provider can see own company's activity feed", async () => {
    const r = await request(app)
      .get("/api/provider/procurement/activity")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities).toBeDefined();
    expect(Array.isArray(r.body.activities)).toBe(true);
    expect(r.body.pagination).toBeDefined();
  });

  it("provider activity feed respects filtering", async () => {
    await query(
      `INSERT INTO procurement_activity_log (provider_company_id, event_type, description, metadata)
       VALUES ($1, 'provider.invited', 'You were invited', '{}')`,
      [providerCompanyId]
    );

    const r = await request(app)
      .get(`/api/provider/procurement/activity?eventType=provider.invited`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities.length).toBeGreaterThanOrEqual(1);
    for (const a of r.body.activities) {
      expect(a.event_type).toBe("provider.invited");
    }
  });

  it("provider does not see other providers' activities", async () => {
    const otherProvider = await createTestCompany(makeUnique("ACT-OtherProv"));
    await query(
      `INSERT INTO procurement_activity_log (provider_company_id, event_type, description, metadata)
       VALUES ($1, 'provider.invited', 'Other provider invite', '{}')`,
      [otherProvider.id]
    );

    const r = await request(app)
      .get("/api/provider/procurement/activity")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(r.status).toBe(200);
    const otherProvActivities = r.body.activities.filter(
      (a: any) => a.description === "Other provider invite"
    );
    expect(otherProvActivities.length).toBe(0);
  });

  it("unauthenticated user cannot access activity feeds", async () => {
    const r1 = await request(app).get("/api/procurement/activity");
    expect(r1.status).toBe(401);

    const r2 = await request(app).get("/api/provider/procurement/activity");
    expect(r2.status).toBe(401);

    const r3 = await request(app).get("/api/admin/procurement/activity");
    expect(r3.status).toBe(401);
  });

  it("non-admin cannot access admin activity feed", async () => {
    const r = await request(app)
      .get("/api/admin/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(403);
  });

  it("admin can see all procurement activity", async () => {
    const r = await request(app)
      .get("/api/admin/procurement/activity")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities).toBeDefined();
    expect(Array.isArray(r.body.activities)).toBe(true);
    expect(r.body.activities.length).toBeGreaterThanOrEqual(1);
    expect(r.body.pagination).toBeDefined();
    // Admin feed includes buyer_name and provider_name
    const hasBuyerName = r.body.activities.some((a: any) => !!a.buyer_name);
    expect(hasBuyerName).toBe(true);
  });

  it("admin can filter activity by event type", async () => {
    const r = await request(app)
      .get("/api/admin/procurement/activity?eventType=request.created")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    for (const a of r.body.activities) {
      expect(a.event_type).toBe("request.created");
    }
  });

  it("admin can filter activity by company ID", async () => {
    const r = await request(app)
      .get(`/api/admin/procurement/activity?companyId=${buyerCompanyId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    for (const a of r.body.activities) {
      expect(a.company_id).toBe(buyerCompanyId);
    }
  });

  it("activity feed paginates correctly", async () => {
    // Log many activities to force pagination
    for (let i = 0; i < 15; i++) {
      await query(
        `INSERT INTO procurement_activity_log (company_id, event_type, description, metadata)
         VALUES ($1, 'request.created', $2, '{}')`,
        [buyerCompanyId, `Pagination test activity ${i}`]
      );
    }

    const r = await request(app)
      .get("/api/procurement/activity?page=1&limit=10")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities.length).toBeLessThanOrEqual(10);
    expect(r.body.pagination.page).toBe(1);
    expect(r.body.pagination.pages).toBeGreaterThanOrEqual(2);

    const r2 = await request(app)
      .get("/api/procurement/activity?page=2&limit=10")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r2.status).toBe(200);
    expect(r2.body.activities.length).toBeGreaterThanOrEqual(1);
    expect(r2.body.pagination.page).toBe(2);
  });

  it("empty event type filter returns no results", async () => {
    const r = await request(app)
      .get("/api/procurement/activity?eventType=nonexistent_event")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    expect(r.body.activities.length).toBe(0);
  });

  it("activity feed returns activities in reverse chronological order", async () => {
    const r = await request(app)
      .get("/api/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    const dates = r.body.activities.map((a: any) => new Date(a.created_at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });
});
