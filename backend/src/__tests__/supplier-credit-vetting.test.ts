import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany, createTestProduct,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let adminToken: string;
let nonAdminToken: string;

let providerCompany: any;
let providerAdminToken: string;

let newProviderCompany: any;
let newProviderAdminToken: string;

let buyerCompany: any;
let buyerToken: string;

const makeProvider = async (name: string, overrides: any = {}) => {
  const company = await createTestCompany(makeUnique(name));
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier',
     verification_status = $1, status = 'active',
     description = $2, website = $3
     WHERE id = $4`,
    [overrides.verificationStatus || "approved", overrides.description || "A test provider company with a full description", overrides.website || "https://testprovider.com", company.id]
  );
  // Create provider profile
  await query(
    `INSERT INTO provider_profiles (company_id, display_name, provider_type, description, years_experience,
      certifications, licenses, service_areas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (company_id) DO UPDATE SET display_name = $2`,
    [company.id, `${name} Display`, "supplier", overrides.profileDescription || "Full profile description for testing", 5,
     overrides.certifications || ["ISO 9001"], overrides.licenses || ["License-001"], ["Greater Accra"]]
  );
  // Create supplier credit profile
  await query(
    "INSERT INTO supplier_credit_profiles (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING",
    [company.id]
  );
  return company;
};

const makeProviderUser = async (company: any) => {
  const user = await createTestUser({
    email: makeEmail(makeUnique("prov-user")),
    companyId: company.id,
    role: "customer",
    companyRole: "company_admin",
  });
  return generateToken(user.id, "customer");
};

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("scv-admin"), role: "admin" });
  adminToken = generateToken(admin.id, "admin");

  const nonAdmin = await createTestUser({ email: makeEmail("scv-nonadmin"), role: "customer" });
  nonAdminToken = generateToken(nonAdmin.id, "customer");

  // Established provider with orders, quotes, products, badge
  providerCompany = await makeProvider("SCV-Established", { verificationStatus: "approved" });
  providerAdminToken = await makeProviderUser(providerCompany);

  // Add products
  await query(
    `INSERT INTO products (name, slug, description, price, provider_company_id, is_active, credit_eligible)
     VALUES ($1, $2, 'Test product', 100, $3, true, true)`,
    ["SCV Product 1", `scv-product-1-${Date.now()}`, providerCompany.id]
  );

  // New provider (no orders, no quotes)
  newProviderCompany = await makeProvider("SCV-New", { verificationStatus: "approved" });
  newProviderAdminToken = await makeProviderUser(newProviderCompany);

  // Buyer (non-provider — for cross-company tests)
  buyerCompany = await createTestCompany(makeUnique("SCV-Buyer"));
  const buyer = await createTestUser({ email: makeEmail("scv-buyer"), companyId: buyerCompany.id, companyRole: "buyer" });
  buyerToken = generateToken(buyer.id, "customer");
});

afterAll(async () => {
  await query("DELETE FROM supplier_credit_profiles WHERE company_id IN ($1, $2)", [providerCompany?.id, newProviderCompany?.id].filter(Boolean)).catch(() => {});
  await query("DELETE FROM provider_profiles WHERE company_id IN ($1, $2)", [providerCompany?.id, newProviderCompany?.id].filter(Boolean)).catch(() => {});
  await query("DELETE FROM products WHERE name LIKE 'SCV-%'").catch(() => {});
  await cleanupTestData();
});

/* ── Heuristic Assessment ── */
describe("GET /admin/providers/:id/credit-vetting", () => {
  it("returns vetting assessment for established provider", async () => {
    const res = await request(app)
      .get(`/api/admin/providers/${providerCompany.id}/credit-vetting`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vetting).toBeDefined();
    expect(res.body.vetting.suggestedTier).toBeDefined();
    expect(res.body.vetting.scores).toBeDefined();
    expect(res.body.vetting.details).toBeDefined();
    expect(res.body.vetting.warnings).toBeInstanceOf(Array);
  });

  it("returns lower tier for new provider with no data", async () => {
    const res = await request(app)
      .get(`/api/admin/providers/${newProviderCompany.id}/credit-vetting`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vetting.suggestedTier).toBe("unrated");
    expect(res.body.vetting.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for non-existent provider", async () => {
    const res = await request(app)
      .get("/api/admin/providers/00000000-0000-0000-0000-000000000000/credit-vetting")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects non-admin users", async () => {
    const res = await request(app)
      .get(`/api/admin/providers/${providerCompany.id}/credit-vetting`)
      .set("Authorization", `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .get(`/api/admin/providers/${providerCompany.id}/credit-vetting`);
    expect(res.status).toBe(401);
  });
});

/* ── Admin Approve ── */
describe("POST /admin/providers/:id/credit-vetting/approve", () => {
  it("approves provider with tier and limit", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${providerCompany.id}/credit-vetting/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ creditTier: "premium", creditLimit: 50000, reviewNotes: "Strong provider" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.vetting_status).toBe("approved");
    expect(res.body.profile.credit_tier).toBe("premium");
    expect(parseFloat(res.body.profile.credit_limit)).toBe(50000);
  });

  it("rejects non-admin users", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${providerCompany.id}/credit-vetting/approve`)
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ creditTier: "premium" });
    expect(res.status).toBe(403);
  });

  it("rejects invalid tier value", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${providerCompany.id}/credit-vetting/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ creditTier: "platinum" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-provider company", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${buyerCompany.id}/credit-vetting/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ creditTier: "standard" });
    expect(res.status).toBe(404);
  });
});

/* ── Admin Reject ── */
describe("POST /admin/providers/:id/credit-vetting/reject", () => {
  it("rejects provider credit vetting", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${newProviderCompany.id}/credit-vetting/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rejectionReason: "Insufficient track record", reviewNotes: "Need more order history" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile.vetting_status).toBe("rejected");
    expect(res.body.profile.rejection_reason).toBe("Insufficient track record");
  });

  it("requires rejection reason", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${newProviderCompany.id}/credit-vetting/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects non-admin users", async () => {
    const res = await request(app)
      .post(`/api/admin/providers/${newProviderCompany.id}/credit-vetting/reject`)
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ rejectionReason: "Test" });
    expect(res.status).toBe(403);
  });
});

/* ── Marketplace Integration ── */
describe("Marketplace provider detail exposes credit_tier", () => {
  it("returns credit_tier in provider detail for approved provider", async () => {
    const res = await request(app)
      .get(`/api/marketplace/providers/${providerCompany.id}`);
    expect(res.status).toBe(200);
    expect(res.body.provider.credit_tier).toBe("premium");
    expect(res.body.provider.supplier_credit_status).toBe("approved");
  });
});

/* ── Procurement Integration ── */
describe("Procurement provider list supports creditTier filter", () => {
  it("lists providers filtered by creditTier=premium", async () => {
    const res = await request(app)
      .get(`/api/procurement/providers?creditTier=premium`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeInstanceOf(Array);
    // The premium provider should appear, basic might not
    for (const p of res.body.providers) {
      expect(p.credit_tier).toBe("premium");
    }
  });

  it("lists providers with credit_tier field visible", async () => {
    const res = await request(app)
      .get("/api/procurement/providers")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.providers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.providers[0]).toHaveProperty("credit_tier");
  });
});
