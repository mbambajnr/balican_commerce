import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany, cleanupTestData,
  generateToken, makeEmail, makeUnique,
} from "./helpers";
import { computeSupplierScore } from "../services/supplier-scoring";

/* ── helpers ── */

const makeProvider = async (name: string, opts: {
  creditTier?: string;
  creditStatus?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  yearsExperience?: number;
  certifications?: string[];
  serviceAreas?: string[];
} = {}) => {
  const company = await createTestCompany(makeUnique(name));
  await query(
    `UPDATE companies
     SET is_provider = true, company_type = 'supplier',
         verification_status = 'approved', status = 'active',
         description = $1, website = $2, logo_url = $3, phone = '0200000000', city = 'Accra'
     WHERE id = $4`,
    [opts.description ?? "A full description for this provider", opts.website ?? "https://provider.test", opts.logoUrl ?? "https://provider.test/logo.png", company.id]
  );
  await query(
    `INSERT INTO provider_profiles
       (company_id, display_name, provider_type, description, years_experience, certifications, service_areas)
     VALUES ($1, $2, 'supplier', 'Profile description', $3, $4, $5)
     ON CONFLICT (company_id) DO UPDATE SET display_name = $2`,
    [company.id, `${name} Co.`, opts.yearsExperience ?? 3, opts.certifications ?? ["ISO 9001"], opts.serviceAreas ?? ["Greater Accra"]]
  );
  await query(
    `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier)
     VALUES ($1, $2, $3)
     ON CONFLICT (company_id) DO UPDATE SET vetting_status = $2, credit_tier = $3`,
    [company.id, opts.creditStatus ?? "unrated", opts.creditTier ?? "basic"]
  );
  return company;
};

const makeProviderToken = async (companyId: string) => {
  const user = await createTestUser({
    email: makeEmail(makeUnique("rank-prov")),
    companyId,
    role: "customer",
    companyRole: "company_admin",
  });
  return generateToken(user.id, "customer");
};

const addProcurementHistory = async (
  providerCompanyId: string,
  invited: number,
  quoted: number,
  avgResponseHours: number | null
) => {
  // Create a fake procurement request from a buyer company
  const buyer = await createTestCompany(makeUnique("rank-buyer"));
  const buyerUser = await createTestUser({ email: makeEmail(makeUnique("rank-buyer-user")), companyId: buyer.id });

  for (let i = 0; i < invited; i++) {
    const pr = await query(
      `INSERT INTO procurement_requests (company_id, created_by, title, description, request_type, status)
       VALUES ($1, $2, $3, 'desc', 'product_supply', 'submitted')
       RETURNING id`,
      [buyer.id, buyerUser.id, `Rank test request ${i}`]
    );
    const requestId = pr.rows[0].id;
    const shouldQuote = i < quoted;
    if (shouldQuote && avgResponseHours !== null) {
      await query(
        `INSERT INTO procurement_request_providers
           (request_id, provider_company_id, status, responded_at, created_at)
         VALUES ($1, $2, 'quoted', NOW(), NOW() - ($3 || ' hours')::interval)`,
        [requestId, providerCompanyId, String(Math.max(1, avgResponseHours))]
      );
    } else {
      await query(
        `INSERT INTO procurement_request_providers
           (request_id, provider_company_id, status)
         VALUES ($1, $2, $3)`,
        [requestId, providerCompanyId, shouldQuote ? "quoted" : "invited"]
      );
    }
  }
};

const addCompletedOrder = async (providerCompanyId: string) => {
  const buyer = await createTestCompany(makeUnique("rank-ord-buyer"));
  const buyerUser = await createTestUser({ email: makeEmail(makeUnique("rank-ord-user")), companyId: buyer.id });
  const pr = await query(
    `INSERT INTO procurement_requests (company_id, created_by, title, description, request_type, status)
     VALUES ($1, $2, 'Order test', 'desc', 'product_supply', 'accepted') RETURNING id`,
    [buyer.id, buyerUser.id]
  );
  const requestId = pr.rows[0].id;
  await query(
    `INSERT INTO procurement_request_providers (request_id, provider_company_id, status)
     VALUES ($1, $2, 'selected')`,
    [requestId, providerCompanyId]
  );
  const orderNum = `ORD-RANK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await query(
    `INSERT INTO orders
       (user_id, order_number, items, subtotal, tax, total, status, procurement_request_id)
     VALUES ($1, $2, '[]'::jsonb, 100, 0, 100, 'completed', $3)`,
    [buyerUser.id, orderNum, requestId]
  );
};

let adminToken: string;

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("rank-admin"), role: "admin" });
  adminToken = generateToken(admin.id, "admin");
});

afterAll(async () => {
  await cleanupTestData();
});

/* ════════════════════════════════════════════
   1. SCORING UNIT TESTS (service layer)
   ════════════════════════════════════════════ */

describe("computeSupplierScore — unit", () => {
  test("premium approved supplier scores highest in credit component", async () => {
    const company = await makeProvider("ScorePremium", { creditTier: "premium", creditStatus: "approved" });
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.credit.score).toBe(30);
    expect(result.scoreBreakdown.credit.max).toBe(30);
    expect(result.trustSignals.creditTier).toBe("premium");
    expect(result.trustSignals.creditStatus).toBe("approved");
  });

  test("standard approved supplier scores 22 on credit", async () => {
    const company = await makeProvider("ScoreStandard", { creditTier: "standard", creditStatus: "approved" });
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.credit.score).toBe(22);
  });

  test("basic approved supplier scores 14 on credit", async () => {
    const company = await makeProvider("ScoreBasicApproved", { creditTier: "basic", creditStatus: "approved" });
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.credit.score).toBe(14);
  });

  test("unrated supplier scores 0 on credit", async () => {
    const company = await makeProvider("ScoreUnrated", { creditTier: "basic", creditStatus: "unrated" });
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.credit.score).toBe(0);
  });

  test("rejected supplier scores 0 on credit", async () => {
    const company = await makeProvider("ScoreRejected", { creditTier: "basic", creditStatus: "rejected" });
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.credit.score).toBe(0);
  });

  test("missing data handled gracefully — no division-by-zero", async () => {
    const company = await makeProvider("ScoreNew");
    const result = await computeSupplierScore(company.id);
    expect(result.supplierScore).toBeGreaterThanOrEqual(0);
    expect(result.supplierScore).toBeLessThanOrEqual(100);
    expect(result.trustSignals.quoteResponseRate).toBeNull();
    expect(result.trustSignals.averageResponseHours).toBeNull();
    expect(result.scoreBreakdown.responseRate.score).toBe(0);
    expect(result.scoreBreakdown.responseSpeed.score).toBe(0);
  });

  test("100% response rate scores full 25 on responseRate", async () => {
    const company = await makeProvider("ScoreFullRate");
    await addProcurementHistory(company.id, 5, 5, 2);
    const result = await computeSupplierScore(company.id);
    expect(result.trustSignals.quoteResponseRate).toBeCloseTo(1.0, 1);
    expect(result.scoreBreakdown.responseRate.score).toBe(25);
  });

  test("0% response rate scores 0 on responseRate", async () => {
    const company = await makeProvider("ScoreZeroRate");
    await addProcurementHistory(company.id, 4, 0, null);
    const result = await computeSupplierScore(company.id);
    expect(result.trustSignals.quoteResponseRate).toBeCloseTo(0, 1);
    expect(result.scoreBreakdown.responseRate.score).toBe(0);
  });

  test("fast response (≤2h) scores 20 on responseSpeed", async () => {
    const company = await makeProvider("ScoreFastResp");
    await addProcurementHistory(company.id, 3, 3, 1.5);
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.responseSpeed.score).toBe(20);
  });

  test("slow response (>96h) scores 0 on responseSpeed", async () => {
    const company = await makeProvider("ScoreSlowResp");
    await addProcurementHistory(company.id, 2, 2, 120);
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.responseSpeed.score).toBe(0);
  });

  test("25+ completed orders scores 15 on completedOrders", async () => {
    const company = await makeProvider("ScoreHighOrders", { creditStatus: "approved", creditTier: "premium" });
    for (let i = 0; i < 25; i++) await addCompletedOrder(company.id);
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.completedOrders.score).toBe(15);
    expect(result.trustSignals.completedProcurementOrders).toBeGreaterThanOrEqual(25);
  });

  test("0 completed orders scores 0 on completedOrders", async () => {
    const company = await makeProvider("ScoreNoOrders");
    const result = await computeSupplierScore(company.id);
    expect(result.scoreBreakdown.completedOrders.score).toBe(0);
  });

  test("profile completeness reflects filled fields", async () => {
    const company = await makeProvider("ScoreFullProfile", {
      description: "A full description",
      website: "https://test.com",
      logoUrl: "https://test.com/logo.png",
      yearsExperience: 5,
      certifications: ["ISO 9001"],
      serviceAreas: ["Greater Accra"],
    });
    const result = await computeSupplierScore(company.id);
    expect(result.trustSignals.profileCompleteness).toBeGreaterThan(0);
    expect(result.scoreBreakdown.profileCompleteness.score).toBeGreaterThan(0);
  });

  test("total score is bounded between 0 and 100", async () => {
    const company = await makeProvider("ScoreBounds", { creditTier: "premium", creditStatus: "approved" });
    await addProcurementHistory(company.id, 10, 10, 1);
    for (let i = 0; i < 30; i++) await addCompletedOrder(company.id);
    const result = await computeSupplierScore(company.id);
    expect(result.supplierScore).toBeGreaterThanOrEqual(0);
    expect(result.supplierScore).toBeLessThanOrEqual(100);
  });

  test("score breakdown keys are all present", async () => {
    const company = await makeProvider("ScoreShape");
    const result = await computeSupplierScore(company.id);
    expect(result).toHaveProperty("supplierScore");
    expect(result).toHaveProperty("scoreBreakdown.credit");
    expect(result).toHaveProperty("scoreBreakdown.responseRate");
    expect(result).toHaveProperty("scoreBreakdown.responseSpeed");
    expect(result).toHaveProperty("scoreBreakdown.completedOrders");
    expect(result).toHaveProperty("scoreBreakdown.profileCompleteness");
    expect(result).toHaveProperty("trustSignals.creditTier");
    expect(result).toHaveProperty("trustSignals.quoteResponseRate");
    expect(result).toHaveProperty("trustSignals.averageResponseHours");
    expect(result).toHaveProperty("trustSignals.completedProcurementOrders");
    expect(result).toHaveProperty("trustSignals.profileCompleteness");
  });
});

/* ════════════════════════════════════════════
   2. PRODUCT SUPPLIERS ENDPOINT
   ════════════════════════════════════════════ */

describe("GET /api/marketplace/products/:id/suppliers — score included", () => {
  let product: any;
  let supplierCompany: any;

  beforeAll(async () => {
    supplierCompany = await makeProvider("EndpointSupplier", { creditStatus: "approved", creditTier: "standard" });
    const productRes = await query(
      `INSERT INTO products (name, slug, description, price, price_visibility, provider_company_id, is_active, credit_eligible)
       VALUES ($1, $2, 'desc', 200, 'public', $3, true, false) RETURNING *`,
      ["Ranking Test Product", `ranking-test-product-${Date.now()}`, supplierCompany.id]
    );
    product = productRes.rows[0];
  });

  test("returns supplierScore, scoreBreakdown, and trustSignals in supplier list", async () => {
    const res = await request(app)
      .get(`/api/marketplace/products/${product.id}/suppliers`)
      .expect(200);
    expect(res.body.suppliers.length).toBeGreaterThan(0);
    const supplier = res.body.suppliers[0];
    expect(supplier).toHaveProperty("supplierScore");
    expect(supplier).toHaveProperty("scoreBreakdown");
    expect(supplier).toHaveProperty("trustSignals");
    expect(typeof supplier.supplierScore).toBe("number");
  });

  test("suppliers are sorted by supplierScore descending", async () => {
    const res = await request(app)
      .get(`/api/marketplace/products/${product.id}/suppliers`)
      .expect(200);
    const scores = res.body.suppliers.map((s: any) => s.supplierScore);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });
});

/* ════════════════════════════════════════════
   3. PROVIDER SELF-SCORE ENDPOINT
   ════════════════════════════════════════════ */

describe("GET /api/provider/supplier-score", () => {
  let providerCompany: any;
  let providerToken: string;
  let buyerToken: string;

  beforeAll(async () => {
    providerCompany = await makeProvider("SelfScoreProvider", { creditStatus: "approved", creditTier: "premium" });
    providerToken = await makeProviderToken(providerCompany.id);

    const buyerCompany = await createTestCompany(makeUnique("SelfScoreBuyer"));
    const buyerUser = await createTestUser({ email: makeEmail(makeUnique("self-score-buyer")), companyId: buyerCompany.id });
    buyerToken = generateToken(buyerUser.id, "customer");
  });

  test("provider can fetch their own score", async () => {
    const res = await request(app)
      .get("/api/provider/supplier-score")
      .set("Authorization", `Bearer ${providerToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("supplierScore");
    expect(res.body).toHaveProperty("scoreBreakdown");
    expect(res.body).toHaveProperty("trustSignals");
    expect(typeof res.body.supplierScore).toBe("number");
  });

  test("unauthenticated request returns 401", async () => {
    await request(app)
      .get("/api/provider/supplier-score")
      .expect(401);
  });

  test("buyer (non-provider) is rejected with 403", async () => {
    await request(app)
      .get("/api/provider/supplier-score")
      .set("Authorization", `Bearer ${buyerToken}`)
      .expect(403);
  });
});
