import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let buyerToken: string;
let buyerCompanyId: string;

let approvedProviderCompany: any;
let rejectedProviderCompany: any;
let pendingReviewProviderCompany: any;
let noProfileProviderCompany: any;

const makeProvider = async (name: string, creditOverrides: any = {}) => {
  const company = await createTestCompany(makeUnique(name));
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier',
     verification_status = 'approved', status = 'active'
     WHERE id = $1`,
    [company.id]
  );
  const { vetting_status, credit_tier, rejection_reason } = creditOverrides;
  if (vetting_status) {
    await query(
      `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier, rejection_reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id) DO UPDATE SET vetting_status = $2, credit_tier = $3, rejection_reason = $4`,
      [company.id, vetting_status, credit_tier || "unrated", rejection_reason || null]
    );
  }
  return company;
};

beforeAll(async () => {
  buyerCompanyId = (await createTestCompany(makeUnique("SCE-Buyer"))).id;
  const buyer = await createTestUser({
    email: makeEmail("sce-buyer"),
    companyId: buyerCompanyId,
    companyRole: "buyer",
  });
  buyerToken = generateToken(buyer.id, "customer");

  approvedProviderCompany = await makeProvider("SCE-Approved", { vetting_status: "approved", credit_tier: "premium" });
  rejectedProviderCompany = await makeProvider("SCE-Rejected", { vetting_status: "rejected", credit_tier: "basic", rejection_reason: "Poor track record" });
  pendingReviewProviderCompany = await makeProvider("SCE-Pending", { vetting_status: "pending_review", credit_tier: "unrated" });
  noProfileProviderCompany = await makeProvider("SCE-NoProfile", {}); // no credit profile inserted
});

afterAll(async () => {
  await cleanupTestData();
});

/** Create + submit a request with all 4 providers invited + quoted */
const createQuotedRequest = async (): Promise<string> => {
  const r = await request(app)
    .post("/api/procurement/requests")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      title: `SCE Test ${Date.now()}`,
      items: [{ productName: "SCE Widget", quantity: 10, unit: "pcs" }],
      providerIds: [
        approvedProviderCompany.id,
        rejectedProviderCompany.id,
        pendingReviewProviderCompany.id,
        noProfileProviderCompany.id,
      ],
    });
  const rid = r.body.request.id;

  await request(app)
    .patch(`/api/procurement/requests/${rid}/status`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ status: "submitted" });

  for (const prov of [approvedProviderCompany, rejectedProviderCompany, pendingReviewProviderCompany, noProfileProviderCompany]) {
    const user = await createTestUser({
      email: makeEmail(makeUnique("sce-quoter")),
      companyId: prov.id,
      companyRole: "company_admin",
    });
    const token = generateToken(user.id, "customer");
    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/respond`)
      .set("Authorization", `Bearer ${token}`)
      .send({ response: "quote", quoteAmount: 50000 });
  }

  return rid;
};

/** Clean up a request */
const cleanupRequest = async (rid: string) => {
  await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [rid]).catch(() => {});
  await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
  await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
};

/* ── Happy path: approved credit ── */
describe("POST /procurement/requests/:id/accept-provider/:pid", () => {
  let rid: string;

  beforeAll(async () => { rid = await createQuotedRequest(); });
  afterAll(async () => { await cleanupRequest(rid); });

  it("allows selecting an approved-credit provider", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${approvedProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.supplierCreditWarning).toBeUndefined();

    const prp = await query(
      "SELECT status FROM procurement_request_providers WHERE request_id = $1 AND provider_company_id = $2",
      [rid, approvedProviderCompany.id]
    );
    expect(prp.rows[0].status).toBe("selected");

    const reqStatus = await query("SELECT status FROM procurement_requests WHERE id = $1", [rid]);
    expect(reqStatus.rows[0].status).toBe("accepted");

    const others = await query(
      "SELECT status FROM procurement_request_providers WHERE request_id = $1 AND provider_company_id != $2",
      [rid, approvedProviderCompany.id]
    );
    for (const row of others.rows) {
      expect(row.status).toBe("declined");
    }
  });
});

/* ── Rejected credit → blocked ── */
describe("Rejected credit enforcement", () => {
  let rid: string;
  beforeAll(async () => { rid = await createQuotedRequest(); });
  afterAll(async () => { await cleanupRequest(rid); });

  it("blocks selecting a rejected-credit provider", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${rejectedProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CREDIT_REJECTED");
  });
});

/* ── Pending review credit → warn without override, allow with override ── */
describe("Pending review credit enforcement", () => {
  let rid: string;
  beforeAll(async () => { rid = await createQuotedRequest(); });
  afterAll(async () => { await cleanupRequest(rid); });

  it("returns 409 for pending-review provider without override", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${pendingReviewProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CREDIT_NOT_ASSESSED");
  });

  it("allows selecting pending-review provider with adminOverride=true", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${pendingReviewProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ adminOverride: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.supplierCreditWarning).toBeDefined();
  });
});

/* ── No credit profile → treat as unrated → warn without override, allow with override ── */
describe("Unrated (no profile) credit enforcement", () => {
  let rid: string;
  beforeAll(async () => { rid = await createQuotedRequest(); });
  afterAll(async () => { await cleanupRequest(rid); });

  it("returns 409 for unrated provider without override", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${noProfileProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CREDIT_NOT_ASSESSED");
  });

  it("allows selecting unrated provider with adminOverride=true", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${noProfileProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ adminOverride: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

/* ── Auth / validation errors ── */
describe("Auth and validation", () => {
  let rid: string;
  beforeAll(async () => { rid = await createQuotedRequest(); });
  afterAll(async () => { await cleanupRequest(rid); });

  it("requires authentication", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${approvedProviderCompany.id}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent request", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/00000000-0000-0000-0000-000000000000/accept-provider/${approvedProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("returns 404 for provider not on request", async () => {
    const otherCompany = await createTestCompany(makeUnique("SCE-Other"));
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${otherCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("returns 400 if provider hasn't quoted", async () => {
    const r = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `SCE NoQuote ${Date.now()}`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [approvedProviderCompany.id],
      });
    const nr = r.body.request.id;
    await request(app)
      .patch(`/api/procurement/requests/${nr}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    const res = await request(app)
      .post(`/api/procurement/requests/${nr}/accept-provider/${approvedProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(400);

    await cleanupRequest(nr);
  });

  it("returns 400 if request is draft", async () => {
    const r = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `SCE Draft ${Date.now()}`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [approvedProviderCompany.id],
      });
    const dr = r.body.request.id;

    const res = await request(app)
      .post(`/api/procurement/requests/${dr}/accept-provider/${approvedProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(res.status).toBe(400);

    await cleanupRequest(dr);
  });
});
