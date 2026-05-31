import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let buyerToken: string;
let buyerCompanyId: string;
let buyerId: string;

let providerCompany: any;
let providerToken: string;
let providerId: string;

let adminToken: string;

const testRequests: string[] = [];

beforeAll(async () => {
  buyerCompanyId = (await createTestCompany(makeUnique("ACT-Buyer"))).id;
  const buyer = await createTestUser({
    email: makeEmail("act-buyer"),
    companyId: buyerCompanyId,
    companyRole: "buyer",
  });
  buyerId = buyer.id;
  buyerToken = generateToken(buyer.id, "customer");

  providerCompany = await createTestCompany(makeUnique("ACT-Provider"));
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier',
     verification_status = 'approved', status = 'active' WHERE id = $1`,
    [providerCompany.id]
  );
  await query(
    `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier)
     VALUES ($1, 'approved', 'premium')
     ON CONFLICT (company_id) DO UPDATE SET vetting_status = 'approved', credit_tier = 'premium'`,
    [providerCompany.id]
  );
  const pUser = await createTestUser({
    email: makeEmail("act-provider"),
    companyId: providerCompany.id,
    companyRole: "company_admin",
  });
  providerId = pUser.id;
  providerToken = generateToken(pUser.id, "customer");

  const admin = await createTestUser({
    email: makeEmail("act-admin"),
    role: "admin",
  });
  adminToken = generateToken(admin.id, "admin");
});

afterAll(async () => {
  for (const rid of testRequests) {
    await query("DELETE FROM orders WHERE procurement_request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
  }
  await query("DELETE FROM procurement_activity_log WHERE company_id = $1", [buyerCompanyId]).catch(() => {});
  await query("DELETE FROM procurement_activity_log WHERE provider_company_id = $1", [providerCompany.id]).catch(() => {});
  await cleanupTestData();
});

/** Helper: create + submit + accept a request */
async function fullFlowRequest(): Promise<string> {
  const createRes = await request(app)
    .post("/api/procurement/requests")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      title: `ACT Full ${Date.now()}`,
      items: [{ productName: "Widget", quantity: 2, unit: "pcs" }],
      providerIds: [providerCompany.id],
    });
  const rid = createRes.body.request.id;
  testRequests.push(rid);

  await request(app)
    .patch(`/api/procurement/requests/${rid}/status`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ status: "submitted" });

  await request(app)
    .patch(`/api/provider/procurement/requests/${rid}/view`)
    .set("Authorization", `Bearer ${providerToken}`);

  await request(app)
    .patch(`/api/provider/procurement/requests/${rid}/respond`)
    .set("Authorization", `Bearer ${providerToken}`)
    .send({ response: "quote", quoteAmount: 25000 });

  await request(app)
    .post(`/api/procurement/requests/${rid}/accept-provider/${providerCompany.id}`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({});

  return rid;
}

/* ═══════════════════════════════════════════════
   ACTIVITY LOG EVENTS
   ═══════════════════════════════════════════════ */

describe("Procurement activity logging", () => {
  it("logs request.created when a request is created", async () => {
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: "ACT Created Event",
        items: [{ productName: "Test", quantity: 1 }],
      });
    const rid = createRes.body.request.id;
    testRequests.push(rid);

    const log = await query(
      "SELECT event_type, description, company_id FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'request.created'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].event_type).toBe("request.created");
    expect(log.rows[0].company_id).toBe(buyerCompanyId);
  });

  it("logs provider.invited when providers are invited on creation", async () => {
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: "ACT Invite Event",
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [providerCompany.id],
      });
    const rid = createRes.body.request.id;
    testRequests.push(rid);

    const log = await query(
      "SELECT event_type, description FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'provider.invited'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].event_type).toBe("provider.invited");
  });

  it("logs request.submitted when request is submitted", async () => {
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: "ACT Submit Event",
        items: [{ productName: "Test", quantity: 1 }],
      });
    const rid = createRes.body.request.id;
    testRequests.push(rid);

    await request(app)
      .patch(`/api/procurement/requests/${rid}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    const log = await query(
      "SELECT event_type FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'request.submitted'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
  });

  it("logs request.cancelled when request is cancelled", async () => {
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: "ACT Cancel Event",
        items: [{ productName: "Test", quantity: 1 }],
      });
    const rid = createRes.body.request.id;
    testRequests.push(rid);

    await request(app)
      .patch(`/api/procurement/requests/${rid}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "cancelled" });

    const log = await query(
      "SELECT event_type FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'request.cancelled'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
  });

  it("logs provider.viewed when provider views a request", async () => {
    const rid = await (async () => {
      const r = await request(app)
        .post("/api/procurement/requests")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          title: `ACT View Event ${Date.now()}`,
          items: [{ productName: "Test", quantity: 1 }],
          providerIds: [providerCompany.id],
        });
      return r.body.request.id;
    })();
    testRequests.push(rid);

    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/view`)
      .set("Authorization", `Bearer ${providerToken}`);

    const log = await query(
      "SELECT event_type, provider_company_id FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'provider.viewed'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].provider_company_id).toBe(providerCompany.id);
  });

  it("logs provider.quoted when provider submits a quote", async () => {
    const rid = await (async () => {
      const r = await request(app)
        .post("/api/procurement/requests")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          title: `ACT Quote Event ${Date.now()}`,
          items: [{ productName: "Test", quantity: 1 }],
          providerIds: [providerCompany.id],
        });
      return r.body.request.id;
    })();
    testRequests.push(rid);

    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/respond`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ response: "quote", quoteAmount: 15000 });

    const log = await query(
      "SELECT event_type, description FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'provider.quoted'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].description).toContain("GH₵15,000");
  });

  it("logs provider.selected and request.accepted when buyer accepts a quote", async () => {
    const rid = await fullFlowRequest();

    const selectedLog = await query(
      "SELECT event_type FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'provider.selected'",
      [rid]
    );
    expect(selectedLog.rows.length).toBe(1);

    const acceptedLog = await query(
      "SELECT event_type FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'request.accepted'",
      [rid]
    );
    expect(acceptedLog.rows.length).toBe(1);
  });

  it("logs request.converted_to_order when converted", async () => {
    const rid = await fullFlowRequest();

    await request(app)
      .post(`/api/procurement/requests/${rid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);

    const log = await query(
      "SELECT event_type, description FROM procurement_activity_log WHERE procurement_request_id = $1 AND event_type = 'request.converted_to_order'",
      [rid]
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].description).toContain("PROC-");

    await query("DELETE FROM orders WHERE procurement_request_id = $1", [rid]).catch(() => {});
  });
});

/* ═══════════════════════════════════════════════
   ACTIVITY FEED ENDPOINTS
   ═══════════════════════════════════════════════ */

describe("GET /procurement/activity (buyer feed)", () => {
  let rid: string;

  beforeAll(async () => {
    rid = await fullFlowRequest();
  });

  it("returns activities for the buyer's company", async () => {
    const res = await request(app)
      .get("/api/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it("returns activities in reverse chronological order", async () => {
    const res = await request(app)
      .get("/api/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    const dates = res.body.activities.map((a: any) => new Date(a.created_at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it("filters by eventType", async () => {
    const res = await request(app)
      .get("/api/procurement/activity?eventType=request.created")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(200);
    for (const a of res.body.activities) {
      expect(a.event_type).toBe("request.created");
    }
  });

  it("supports pagination", async () => {
    const res = await request(app)
      .get("/api/procurement/activity?page=1&limit=2")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/procurement/activity");
    expect(res.status).toBe(401);
  });
});

describe("GET /provider/procurement/activity (provider feed)", () => {
  let rid: string;

  beforeAll(async () => {
    rid = await fullFlowRequest();
  });

  it("returns activities for the provider's company", async () => {
    const res = await request(app)
      .get("/api/provider/procurement/activity")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
  });

  it("includes provider-scoped events", async () => {
    const res = await request(app)
      .get("/api/provider/procurement/activity")
      .set("Authorization", `Bearer ${providerToken}`);
    const types = res.body.activities.map((a: any) => a.event_type);
    expect(types).toContain("provider.viewed");
    expect(types).toContain("provider.quoted");
  });

  it("returns 403 for non-provider user", async () => {
    const res = await request(app)
      .get("/api/provider/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/provider/procurement/activity");
    expect(res.status).toBe(401);
  });
});

describe("GET /admin/procurement/activity (admin feed)", () => {
  let rid: string;

  beforeAll(async () => {
    rid = await fullFlowRequest();
  });

  it("returns all procurement activity", async () => {
    const res = await request(app)
      .get("/api/admin/procurement/activity")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
  });

  it("filters by companyId", async () => {
    const res = await request(app)
      .get(`/api/admin/procurement/activity?companyId=${buyerCompanyId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const a of res.body.activities) {
      expect(a.company_id).toBe(buyerCompanyId);
    }
  });

  it("filters by eventType", async () => {
    const res = await request(app)
      .get("/api/admin/procurement/activity?eventType=provider.quoted")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const a of res.body.activities) {
      expect(a.event_type).toBe("provider.quoted");
    }
  });

  it("returns 403 for non-admin users", async () => {
    const res = await request(app)
      .get("/api/admin/procurement/activity")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/admin/procurement/activity");
    expect(res.status).toBe(401);
  });
});
