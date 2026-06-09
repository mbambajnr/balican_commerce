import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import app from "../app";
import http from "http";
import { query } from "../config/db";
import { createTestUserFast, cleanupTestData, generateToken, TEST_PREFIX, makeUnique } from "./helpers";

let server: http.Server;
let baseUrl: string;

let buyerToken: string;
let buyerUserId: string;
let buyerCompanyId: string;

let providerToken: string;
let providerUserId: string;
let providerCompanyId: string;

let otherProviderToken: string;
let otherProviderCompanyId: string;

let adminToken: string;

let scoutRequestId: string;
let proposalId: string;
let otherProposalId: string;
let agreementId: string;

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

async function patch(url: string, body: any, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() } as any;
}

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  // Buyer
  const buyCo = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type)
     VALUES ($1,$2,'active',false,'buyer') RETURNING id`,
    [makeUnique("agr-buyer"), `${makeUnique("agr-buyer")}@test.com`]
  );
  buyerCompanyId = buyCo.rows[0].id;
  const buyerUser = await createTestUserFast({
    email: makeUnique("agr-buyer-user"),
    companyId: buyerCompanyId,
  });
  buyerUserId = buyerUser.id;
  buyerToken = generateToken(buyerUserId, "customer");

  // Provider
  const provCo = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1,$2,'active',true,'supplier','approved') RETURNING id`,
    [makeUnique("agr-prov"), `${makeUnique("agr-prov")}@test.com`]
  );
  providerCompanyId = provCo.rows[0].id;
  const provUser = await createTestUserFast({
    email: makeUnique("agr-prov-user"),
    companyId: providerCompanyId,
  });
  providerUserId = provUser.id;
  providerToken = generateToken(providerUserId, "customer");

  // Other provider
  const otherCo = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1,$2,'active',true,'supplier','approved') RETURNING id`,
    [makeUnique("agr-other"), `${makeUnique("agr-other")}@test.com`]
  );
  otherProviderCompanyId = otherCo.rows[0].id;
  const otherUser = await createTestUserFast({
    email: makeUnique("agr-other-user"),
    companyId: otherProviderCompanyId,
  });
  otherProviderToken = generateToken(otherUser.id, "customer");

  // Admin
  const adminUser = await createTestUserFast({
    email: makeUnique("agr-admin"),
    role: "admin",
  });
  adminToken = generateToken(adminUser.id, "admin");

  // Scout request (open)
  const reqResult = await query(
    `INSERT INTO scout_requests (company_id, created_by, title, description, quantity, unit,
       delivery_location, desired_delivery_date, budget_min, budget_max, request_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open')
     RETURNING id`,
    [buyerCompanyId, buyerUserId, makeUnique("agr-request"), "Test agreement request",
     10, "units", "Accra",
     new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
     5000, 15000, "product"]
  );
  scoutRequestId = reqResult.rows[0].id;

  // Proposal from provider
  const quoteResult = await query(
    `INSERT INTO scout_quotes (request_id, provider_company_id, submitted_by, quoted_price,
       delivery_date, payment_terms, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [scoutRequestId, providerCompanyId, providerUserId, 10000,
     new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
     "Net 30", "We can supply 10 units at 10,000 each. Full warranty."]
  );
  proposalId = quoteResult.rows[0].id;

  // Another proposal from the other provider
  const otherQuoteResult = await query(
    `INSERT INTO scout_quotes (request_id, provider_company_id, submitted_by, quoted_price,
       delivery_date, payment_terms, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [scoutRequestId, otherProviderCompanyId, otherUser.id, 12000,
     new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0],
     "Net 15", "Can deliver in 3 weeks at 12,000 each."]
  );
  otherProposalId = otherQuoteResult.rows[0].id;
});

afterAll(async () => {
  await cleanupTestData();
  server.close();
});

/* ── Accept Proposal ── */

describe("POST /api/scout/proposals/:id/accept", () => {
  it("accepts a pending proposal and creates an agreement", async () => {
    const { status, body } = await post(`/scout/proposals/${proposalId}/accept`, {}, buyerToken);
    expect(status).toBe(201);
    expect(body.agreement).toBeDefined();
    expect(body.agreement.status).toBe("active");
    expect(body.agreement.scoutRequestId).toBe(scoutRequestId);
    expect(Number(body.agreement.agreedPrice)).toBe(10000);
    agreementId = body.agreement.id;
  });

  it("marks the accepted quote status", async () => {
    const r = await query("SELECT status FROM scout_quotes WHERE id = $1", [proposalId]);
    expect(r.rows[0].status).toBe("accepted");
  });

  it("declines other pending quotes on the request", async () => {
    const r = await query("SELECT status FROM scout_quotes WHERE id = $1", [otherProposalId]);
    expect(r.rows[0].status).toBe("declined");
  });

  it("marks scout request as awarded", async () => {
    const r = await query("SELECT status FROM scout_requests WHERE id = $1", [scoutRequestId]);
    expect(r.rows[0].status).toBe("awarded");
  });

  it("returns 400 for duplicate acceptance (request already awarded)", async () => {
    const { status, body } = await post(`/scout/proposals/${proposalId}/accept`, {}, buyerToken);
    expect(status).toBe(400);
    expect(body.error).toContain("not open");
  });

  it("returns 404 for non-existent proposal", async () => {
    const { status } = await post(`/scout/proposals/00000000-0000-0000-0000-000000000000/accept`, {}, buyerToken);
    expect(status).toBe(404);
  });

  it("returns 403 for non-owner buyer", async () => {
    const { status } = await post(`/scout/proposals/${proposalId}/accept`, {}, providerToken);
    expect(status).toBe(403);
  });

  it("returns 401 for unauthenticated", async () => {
    const { status } = await post(`/scout/proposals/${proposalId}/accept`, {});
    expect(status).toBe(401);
  });
});

/* ── List Agreements ── */

describe("GET /api/agreements", () => {
  it("lists agreements for the buyer", async () => {
    const { status, body } = await get("/agreements", buyerToken);
    expect(status).toBe(200);
    expect(body.agreements.length).toBeGreaterThanOrEqual(1);
    expect(body.agreements[0].requestTitle).toBeTruthy();
    expect(body.agreements[0].buyerCompanyName).toBeTruthy();
    expect(body.agreements[0].providerCompanyName).toBeTruthy();
    expect(body.pagination).toBeDefined();
  });

  it("lists agreements for the provider", async () => {
    const { status, body } = await get("/agreements", providerToken);
    expect(status).toBe(200);
    expect(body.agreements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows filtered by status", async () => {
    const { status, body } = await get("/agreements?status=active", buyerToken);
    expect(status).toBe(200);
    for (const a of body.agreements) {
      expect(a.status).toBe("active");
    }
  });

  it("returns empty for unrelated user", async () => {
    const { status, body } = await get("/agreements", otherProviderToken);
    expect(status).toBe(200);
    expect(body.agreements.length).toBe(0);
  });

  it("admin sees all", async () => {
    const { status, body } = await get("/agreements", adminToken);
    expect(status).toBe(200);
    expect(body.agreements.length).toBeGreaterThanOrEqual(1);
  });
});

/* ── Agreement Detail ── */

describe("GET /api/agreements/:id", () => {
  it("returns agreement detail for buyer", async () => {
    const { status, body } = await get(`/agreements/${agreementId}`, buyerToken);
    expect(status).toBe(200);
    expect(body.agreement.id).toBe(agreementId);
    expect(body.agreement.requestTitle).toBeTruthy();
    expect(Number(body.agreement.agreedPrice)).toBe(10000);
    expect(body.agreement.buyerCompanyName).toBeTruthy();
    expect(body.agreement.providerCompanyName).toBeTruthy();
    expect(body.agreement.timeline).toBeDefined();
    expect(Array.isArray(body.agreement.timeline)).toBe(true);
    expect(body.agreement.timeline.length).toBeGreaterThanOrEqual(5);
  });

  it("timeline includes request_posted and proposal_submitted steps", async () => {
    const { body } = await get(`/agreements/${agreementId}`, buyerToken);
    const types = body.agreement.timeline.map((t: any) => t.type);
    expect(types).toContain("request_posted");
    expect(types).toContain("proposal_submitted");
    expect(types).toContain("proposal_accepted");
    expect(types).toContain("agreement_created");
  });

  it("returns agreement detail for provider", async () => {
    const { status } = await get(`/agreements/${agreementId}`, providerToken);
    expect(status).toBe(200);
  });

  it("returns agreement detail for admin", async () => {
    const { status } = await get(`/agreements/${agreementId}`, adminToken);
    expect(status).toBe(200);
  });

  it("returns 403 for unrelated user", async () => {
    const { status } = await get(`/agreements/${agreementId}`, otherProviderToken);
    expect(status).toBe(403);
  });

  it("returns 404 for non-existent agreement", async () => {
    const { status } = await get(`/agreements/00000000-0000-0000-0000-000000000000`, buyerToken);
    expect(status).toBe(404);
  });
});

/* ── Convert to Order ── */

describe("POST /api/agreements/:id/convert-to-order", () => {
  let orderId: string;

  it("converts active agreement to order", async () => {
    const { status, body } = await post(`/agreements/${agreementId}/convert-to-order`, {}, buyerToken);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.order).toBeDefined();
    expect(body.order.order_number).toContain("AGR-");
    orderId = body.order.id;
  });

  it("marks agreement as completed after conversion", async () => {
    const r = await query("SELECT status, order_id FROM scout_agreements WHERE id = $1", [agreementId]);
    expect(r.rows[0].status).toBe("completed");
    expect(r.rows[0].order_id).toBe(orderId);
  });

  it("returns 400 for duplicate conversion (agreement already completed)", async () => {
    const { status, body } = await post(`/agreements/${agreementId}/convert-to-order`, {}, buyerToken);
    expect(status).toBe(400);
    expect(body.error).toContain("must be active");
  });

  it("returns 403 for non-buyer", async () => {
    const { status } = await post(`/agreements/${agreementId}/convert-to-order`, {}, providerToken);
    expect(status).toBe(403);
  });

  it("returns 404 for non-existent agreement", async () => {
    const { status } = await post(`/agreements/00000000-0000-0000-0000-000000000000/convert-to-order`, {}, buyerToken);
    expect(status).toBe(404);
  });

  it("converted timeline includes order_created and agreement_completed", async () => {
    const { body } = await get(`/agreements/${agreementId}`, buyerToken);
    const types = body.agreement.timeline.map((t: any) => t.type);
    expect(types).toContain("order_created");
    expect(types).toContain("agreement_completed");
    const orderCreated = body.agreement.timeline.find((t: any) => t.type === "order_created");
    expect(orderCreated.status).toBe("completed");
    expect(orderCreated.href).toContain("/account/orders/");
    expect(orderCreated.actorLabel).toBe("Buyer");
    const completed = body.agreement.timeline.find((t: any) => t.type === "agreement_completed");
    expect(completed.status).toBe("completed");
  });
});

/* ── Cancel Agreement ── */

describe("PATCH /api/agreements/:id/status", () => {
  let secondAgreementId: string;

  beforeAll(async () => {
    // Create another request + proposal for cancel test
    const req2Result = await query(
      `INSERT INTO scout_requests (company_id, created_by, title, description, quantity, unit, request_type, status)
       VALUES ($1,$2,$3,$4,1,'unit','product','open') RETURNING id`,
      [buyerCompanyId, buyerUserId, makeUnique("agr-cancel-req"), "Cancel test"]
    );
    const req2Id = req2Result.rows[0].id;

    const quote2Result = await query(
      `INSERT INTO scout_quotes (request_id, provider_company_id, submitted_by, quoted_price, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req2Id, providerCompanyId, providerUserId, 5000, "Cancel test proposal"]
    );
    const quote2Id = quote2Result.rows[0].id;

    const res = await post(`/scout/proposals/${quote2Id}/accept`, {}, buyerToken);
    secondAgreementId = res.body.agreement.id;
  });

  it("cancels an active agreement and reopens the scout request", async () => {
    const { status } = await patch(`/agreements/${secondAgreementId}/status`,
      { status: "cancelled", reason: "Changed mind" }, buyerToken);
    expect(status).toBe(200);

    const r = await query("SELECT status FROM scout_agreements WHERE id = $1", [secondAgreementId]);
    expect(r.rows[0].status).toBe("cancelled");

    // Scout request should be reopened
    const sr = await query("SELECT status FROM scout_requests WHERE id = $1",
      [(await query("SELECT scout_request_id FROM scout_agreements WHERE id = $1", [secondAgreementId])).rows[0].scout_request_id]);
    expect(sr.rows[0].status).toBe("open");
  });

  it("returns 400 for completed agreement", async () => {
    const { status } = await patch(`/agreements/${agreementId}/status`,
      { status: "cancelled" }, buyerToken);
    expect(status).toBe(400);
  });

  it("returns 403 for unrelated user", async () => {
    const { status } = await patch(`/agreements/${secondAgreementId}/status`,
      { status: "active" }, otherProviderToken);
    expect(status).toBe(403);
  });

  it("cancelled agreement timeline includes agreement_cancelled step", async () => {
    const { body } = await get(`/agreements/${secondAgreementId}`, buyerToken);
    const types = body.agreement.timeline.map((t: any) => t.type);
    expect(types).toContain("agreement_cancelled");
    const cancelled = body.agreement.timeline.find((t: any) => t.type === "agreement_cancelled");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.description).toContain("reopened");
    expect(cancelled.href).toContain("/scout/");
    // Should NOT have convert_to_order or order_created for cancelled agreements
    expect(types).not.toContain("convert_to_order");
    expect(types).not.toContain("order_created");
  });
});
