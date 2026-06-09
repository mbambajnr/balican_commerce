import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import app from "../app";
import http from "http";
import { query } from "../config/db";
import { createTestUserFast, cleanupTestData, generateToken, TEST_PREFIX } from "./helpers";

let server: http.Server;
let baseUrl: string;
let providerToken: string;
let otherProviderToken: string;
let nonProviderToken: string;
let pendingProviderToken: string;
let adminToken: string;
let scoutRequestId1: string;
let scoutRequestId2: string;
let scoutRequestId3: string;
let buyerCompanyId: string;
let categoryId: string;

async function post(url: string, body?: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { method: "POST", headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() } as any;
}

async function get(url: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { headers });
  return { status: res.status, body: await res.json() } as any;
}

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  const catSlug = `${TEST_PREFIX}hvac-${Date.now()}`.toLowerCase();
  const catResult = await query(
    `INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) RETURNING id`,
    [`${TEST_PREFIX}HVAC`, catSlug, "Test HVAC"]
  );
  categoryId = catResult.rows[0].id;

  const buyerCompany = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type)
     VALUES ($1,$2,'active',false,'buyer') RETURNING id`,
    [`${TEST_PREFIX}Buyer Co`, `${TEST_PREFIX}buyer-${Date.now()}@test.com`]
  );
  buyerCompanyId = buyerCompany.rows[0].id;

  const buyerUser = await createTestUserFast({
    email: `${TEST_PREFIX}buyer-user-${Date.now()}@test.com`,
    companyId: buyerCompanyId,
  });

  const providerCompany = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1,$2,'active',true,'supplier','approved') RETURNING id`,
    [`${TEST_PREFIX}Provider Co`, `${TEST_PREFIX}prov-${Date.now()}@test.com`]
  );
  const providerCompanyId = providerCompany.rows[0].id;

  const providerUser = await createTestUserFast({
    email: `${TEST_PREFIX}provider-user-${Date.now()}@test.com`,
    companyId: providerCompanyId,
  });
  providerToken = generateToken(providerUser.id, "customer");

  const otherProvider = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1,$2,'active',true,'supplier','approved') RETURNING id`,
    [`${TEST_PREFIX}Other Prov`, `${TEST_PREFIX}other-prov-${Date.now()}@test.com`]
  );
  const otherProviderCompanyId = otherProvider.rows[0].id;

  const otherProvUser = await createTestUserFast({
    email: `${TEST_PREFIX}other-prov-user-${Date.now()}@test.com`,
    companyId: otherProviderCompanyId,
  });
  otherProviderToken = generateToken(otherProvUser.id, "customer");

  const nonProvCompany = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type)
     VALUES ($1,$2,'active',false,'buyer') RETURNING id`,
    [`${TEST_PREFIX}Non Prov`, `${TEST_PREFIX}non-prov-${Date.now()}@test.com`]
  );
  const nonProvUser = await createTestUserFast({
    email: `${TEST_PREFIX}non-prov-user-${Date.now()}@test.com`,
    companyId: nonProvCompany.rows[0].id,
  });
  nonProviderToken = generateToken(nonProvUser.id, "customer");

  const pendingCompany = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1,$2,'active',true,'supplier','pending') RETURNING id`,
    [`${TEST_PREFIX}Pending Prov`, `${TEST_PREFIX}pend-prov-${Date.now()}@test.com`]
  );
  const pendingUser = await createTestUserFast({
    email: `${TEST_PREFIX}pend-user-${Date.now()}@test.com`,
    companyId: pendingCompany.rows[0].id,
  });
  pendingProviderToken = generateToken(pendingUser.id, "customer");

  const adminUser = await createTestUserFast({
    email: `${TEST_PREFIX}admin-${Date.now()}@test.com`,
    role: "admin",
  });
  adminToken = generateToken(adminUser.id, "admin");

  const r1 = await query(
    `INSERT INTO scout_requests (company_id, created_by, title, description, quantity, unit,
       delivery_location, desired_delivery_date, budget_min, budget_max, category_id, request_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open')
     RETURNING id`,
    [buyerCompanyId, buyerUser.id, `${TEST_PREFIX}HVAC Installation`, "Need 5 units installed",
     5, "units", "Accra",
     new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
     10000, 25000, categoryId, "service"]
  );
  scoutRequestId1 = r1.rows[0].id;

  const r2 = await query(
    `INSERT INTO scout_requests (company_id, created_by, title, description, quantity, unit,
       delivery_location, desired_delivery_date, budget_min, budget_max, category_id, request_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open')
     RETURNING id`,
    [buyerCompanyId, buyerUser.id, `${TEST_PREFIX}Electrical Cable Supply`, "200m of 11kV cable",
     200, "metres", "Kumasi",
     new Date(Date.now() + 45 * 86400000).toISOString().split("T")[0],
     50000, 80000, categoryId, "product"]
  );
  scoutRequestId2 = r2.rows[0].id;

  const r3 = await query(
    `INSERT INTO scout_requests (company_id, created_by, title, description, quantity, unit,
       delivery_location, category_id, request_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'awarded')
     RETURNING id`,
    [buyerCompanyId, buyerUser.id, `${TEST_PREFIX}Awarded Request`, "Already done",
     1, "lot", "Takoradi", categoryId, "service"]
  );
  scoutRequestId3 = r3.rows[0].id;

  await query(
    `INSERT INTO scout_quotes (request_id, provider_company_id, submitted_by, quoted_price, notes)
     VALUES ($1,$2,$3,$4,$5)`,
    [scoutRequestId1, otherProviderCompanyId, otherProvUser.id, 15000, "We can do this job"]
  );
});

afterAll(async () => {
  await cleanupTestData();
  server.close();
});

/* ── Opportunities listing ── */

describe("GET /api/provider/opportunities", () => {

  it("returns open opportunities for active provider", async () => {
    const { status, body } = await get("/provider/opportunities", providerToken);
    expect(status).toBe(200);
    expect(body.opportunities).toBeDefined();
    expect(Array.isArray(body.opportunities)).toBe(true);
    expect(body.opportunities.length).toBeGreaterThanOrEqual(2);
    expect(body.pagination).toBeDefined();

    const opp = body.opportunities.find((o: any) => o.id === scoutRequestId1);
    expect(opp).toBeDefined();
    expect(opp.title).toContain(TEST_PREFIX);
    expect(parseInt(opp.proposal_count)).toBeGreaterThanOrEqual(1);
    expect(opp.my_proposal_status).toBeNull();
    expect(opp.buyer_company_name).toBeUndefined();
    expect(opp.company_name).toBeUndefined();
  });

  it("filters by requestType", async () => {
    const { status, body } = await get("/provider/opportunities?requestType=service", providerToken);
    expect(status).toBe(200);
    for (const opp of body.opportunities) {
      expect(opp.request_type).toBe("service");
    }
  });

  it("filters by deadline=closing_soon", async () => {
    const { status, body } = await get("/provider/opportunities?deadline=closing_soon", providerToken);
    expect(status).toBe(200);
    for (const opp of body.opportunities) {
      const days = Math.ceil((new Date(opp.desired_delivery_date).getTime() - Date.now()) / 86400000);
      expect(days).toBeLessThanOrEqual(7);
    }
  });

  it("returns 403 for non-provider", async () => {
    const { status } = await get("/provider/opportunities", nonProviderToken);
    expect(status).toBe(403);
  });

  it("returns 403 for pending provider", async () => {
    const { status } = await get("/provider/opportunities", pendingProviderToken);
    expect(status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    const { status } = await get("/provider/opportunities");
    expect(status).toBe(401);
  });

  it("shows my_proposal_status when provider has submitted", async () => {
    const { status, body } = await get("/provider/opportunities", otherProviderToken);
    expect(status).toBe(200);
    const opp = body.opportunities.find((o: any) => o.id === scoutRequestId1);
    expect(opp.my_proposal_status).toBe("pending");
  });

  it("does not expose buyer contact fields", async () => {
    const { status, body } = await get("/provider/opportunities", providerToken);
    expect(status).toBe(200);
    for (const opp of body.opportunities) {
      expect(opp.contact_name).toBeUndefined();
      expect(opp.email).toBeUndefined();
      expect(opp.phone).toBeUndefined();
      expect(opp.address).toBeUndefined();
      expect(opp.company_name).toBeUndefined();
    }
  });

  it("supports search filter", async () => {
    const { status, body } = await get("/provider/opportunities?search=HVAC", providerToken);
    expect(status).toBe(200);
    expect(body.opportunities.length).toBeGreaterThanOrEqual(1);
    for (const opp of body.opportunities) {
      expect(opp.title).toContain("HVAC");
    }
  });
});

/* ── Single opportunity detail ── */

describe("GET /api/provider/opportunities/:id", () => {

  it("returns opportunity detail", async () => {
    const { status, body } = await get(`/provider/opportunities/${scoutRequestId1}`, providerToken);
    expect(status).toBe(200);
    expect(body.opportunity).toBeDefined();
    expect(body.opportunity.id).toBe(scoutRequestId1);
    expect(body.opportunity.proposalCount).toBeGreaterThanOrEqual(1);
    expect(body.opportunity.myProposalStatus).toBeNull();
    expect(body.opportunity.buyerLabel).toBe("Verified buyer");
  });

  it("returns 404 for non-existent opportunity", async () => {
    const { status } = await get(`/provider/opportunities/00000000-0000-0000-0000-000000000000`, providerToken);
    expect(status).toBe(404);
  });
});

/* ── Proposals ── */

describe("POST /api/provider/opportunities/:id/proposals", () => {

  it("submits a proposal", async () => {
    const { status, body } = await post(`/provider/opportunities/${scoutRequestId2}/proposals`, {
      amount: 60000,
      deliveryDate: new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0],
      creditTerms: "30 days net",
      proposalText: "We can supply 200m of 11kV XLPE cable. 3-week delivery. Full warranty.",
    }, providerToken);
    expect(status).toBe(201);
    expect(body.proposal).toBeDefined();
    expect(parseFloat(body.proposal.amount)).toBe(60000);
    expect(body.proposal.deliveryDate).toBeTruthy();
    expect(body.proposal.status).toBe("pending");
  });

  it("updates existing proposal (upsert, no 409)", async () => {
    const { status, body } = await post(`/provider/opportunities/${scoutRequestId2}/proposals`, {
      amount: 58000,
      deliveryDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      proposalText: "Updated offer. 2-week delivery at 58,000.",
    }, providerToken);
    expect(status).toBe(201);
    expect(parseFloat(body.proposal.amount)).toBe(58000);
    expect(body.proposal.deliveryDate).toBeTruthy();
  });

  it("returns 400 for non-open request", async () => {
    const { status, body } = await post(`/provider/opportunities/${scoutRequestId3}/proposals`, {
      proposalText: "Testing awarded request block",
    }, providerToken);
    expect(status).toBe(400);
    expect(body.error).toContain("no longer accepting");
  });

  it("returns 403 for non-provider", async () => {
    const { status } = await post(`/provider/opportunities/${scoutRequestId2}/proposals`, {
      proposalText: "Testing non-provider block",
    }, nonProviderToken);
    expect(status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    const { status } = await post(`/provider/opportunities/${scoutRequestId2}/proposals`, {
      proposalText: "No auth",
    });
    expect(status).toBe(401);
  });

  it("returns 400 when proposalText is too short", async () => {
    const { status } = await post(`/provider/opportunities/${scoutRequestId2}/proposals`, {
      proposalText: "Short",
    }, providerToken);
    expect(status).toBe(400);
  });
});

describe("GET /api/provider/opportunities/:id/my-proposal", () => {

  it("returns own proposal", async () => {
    const { status, body } = await get(`/provider/opportunities/${scoutRequestId2}/my-proposal`, providerToken);
    expect(status).toBe(200);
    expect(body.proposal).toBeDefined();
    expect(parseFloat(body.proposal.amount)).toBe(58000);
  });

  it("returns null when no proposal exists", async () => {
    const { status, body } = await get(`/provider/opportunities/${scoutRequestId2}/my-proposal`, otherProviderToken);
    expect(status).toBe(200);
    expect(body.proposal).toBeNull();
  });
});

/* ── Buyer proposals view ── */

describe("GET /api/scout/requests/:id/proposals", () => {

  it("returns 403 for non-owner non-admin", async () => {
    const { status } = await get(`/scout/requests/${scoutRequestId1}/proposals`, providerToken);
    expect(status).toBe(403);
  });

  it("returns 404 for non-existent request", async () => {
    const { status } = await get(`/scout/requests/00000000-0000-0000-0000-000000000000/proposals`, adminToken);
    expect(status).toBe(404);
  });
});
