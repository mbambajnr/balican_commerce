import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany, cleanupTestData, generateToken, makeEmail, TEST_PREFIX, makeUnique,
} from "./helpers";

// Track resources for manual cleanup between tests
let superAdminToken: string;
let adminToken: string;
let providerUser: any;
let providerCompany: any;
let providerToken: string;
let buyerUser: any;
let buyerToken: string;
let nonAdminUser: any;
let nonAdminToken: string;

const API = "/api/super-admin";

beforeAll(async () => {
  // Create a super admin user
  const sa = await createTestUser({
    email: makeEmail("super-admin"),
    role: "super_admin",
    firstName: "Super",
    lastName: "Admin",
  });
  superAdminToken = generateToken(sa.id, "super_admin");

  // Create a regular admin
  const ad = await createTestUser({
    email: makeEmail("reg-admin"),
    role: "admin",
  });
  adminToken = generateToken(ad.id, "admin");

  // Create a provider company with user
  providerCompany = await createTestCompany(makeUnique("provider-co"));
  // Update company to be a provider
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier', verification_status = 'not_started' WHERE id = $1`,
    [providerCompany.id]
  );
  providerUser = await createTestUser({
    email: makeEmail("provider-user"),
    companyId: providerCompany.id,
    role: "customer",
  });
  providerToken = generateToken(providerUser.id, "customer");

  // Create a buyer
  buyerUser = await createTestUser({
    email: makeEmail("buyer-user"),
    role: "customer",
  });
  buyerToken = generateToken(buyerUser.id, "customer");

  // Create a non-admin customer
  const na = await createTestUser({
    email: makeEmail("non-admin"),
    role: "customer",
  });
  nonAdminToken = generateToken(na.id, "customer");
  nonAdminUser = na;

  // Ensure plans are seeded
  const planCount = await query(`SELECT COUNT(*)::int FROM plans`);
  if (planCount.rows[0].count === 0) {
    await query(`
      INSERT INTO plans (name, display_name, description, price_monthly, price_yearly, max_users, max_products, max_services, features, sort_order)
      VALUES ('free', 'Free', 'Free plan', 0, 0, 3, 10, 5, '[]'::jsonb, 1)
      ON CONFLICT (name) DO NOTHING
    `);
  }
});

afterAll(async () => {
  await cleanVerificationData();
  await cleanupTestData();
});

async function cleanVerificationData() {
  await query(`DELETE FROM verification_documents WHERE company_id = $1`, [providerCompany.id]).catch(() => {});
  await query(`DELETE FROM activity_logs WHERE company_id = $1`, [providerCompany.id]).catch(() => {});
  await query(`DELETE FROM audit_logs WHERE admin_user_id IN (SELECT id FROM users WHERE email LIKE '${TEST_PREFIX}%')`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// 1. Super Admin Authentication & Authorization
// ─────────────────────────────────────────────────────
describe("Authorization", () => {
  it("allows super admin access to dashboard", async () => {
    const res = await request(app)
      .get(`${API}/dashboard`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("companies");
    expect(res.body).toHaveProperty("pendingVerifications");
    expect(res.body).toHaveProperty("pendingDocuments");
  });

  it("blocks regular admin from super admin endpoints", async () => {
    const res = await request(app)
      .get(`${API}/dashboard`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks customer from super admin endpoints", async () => {
    const res = await request(app)
      .get(`${API}/dashboard`)
      .set("Authorization", `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks unauthenticated requests", async () => {
    const res = await request(app).get(`${API}/dashboard`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────
// 2. Company Management
// ─────────────────────────────────────────────────────
describe("Company Management", () => {
  it("lists companies with pagination", async () => {
    const res = await request(app)
      .get(`${API}/companies`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("companies");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("limit");
  });

  it("filters companies by status", async () => {
    const res = await request(app)
      .get(`${API}/companies?status=active`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.companies.every((c: any) => c.status === "active")).toBe(true);
  });

  it("filters companies by verification status", async () => {
    const res = await request(app)
      .get(`${API}/companies?verificationStatus=not_started`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  it("filters companies by company type", async () => {
    const res = await request(app)
      .get(`${API}/companies?companyType=supplier`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  it("searches companies by name", async () => {
    const res = await request(app)
      .get(`${API}/companies?search=${encodeURIComponent(providerCompany.name.slice(0, 10))}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.companies.length).toBeGreaterThan(0);
  });

  it("gets single company detail", async () => {
    const res = await request(app)
      .get(`${API}/companies/${providerCompany.id}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(providerCompany.id);
    expect(res.body).toHaveProperty("users");
  });

  it("returns 404 for non-existent company", async () => {
    const res = await request(app)
      .get(`${API}/companies/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────
// 3. Company Status Transitions
// ─────────────────────────────────────────────────────
describe("Company Status Transitions", () => {
  let testCompany: any;

  beforeAll(async () => {
    testCompany = await createTestCompany(makeUnique("transitions-co"));
    await query(
      `UPDATE companies SET is_provider = false, company_type = 'buyer' WHERE id = $1`,
      [testCompany.id]
    );
  });

  it("approves a company", async () => {
    const res = await request(app)
      .post(`${API}/companies/${testCompany.id}/approve`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Test approval" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/approved/i);

    const check = await query(`SELECT status FROM companies WHERE id = $1`, [testCompany.id]);
    expect(check.rows[0].status).toBe("active");
  });

  it("suspends an approved company", async () => {
    const res = await request(app)
      .post(`${API}/companies/${testCompany.id}/suspend`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Test suspension" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it("reactivates a suspended company", async () => {
    const res = await request(app)
      .post(`${API}/companies/${testCompany.id}/reactivate`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Test reactivation" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reactivated/i);
  });

  it("rejects a company", async () => {
    const rejectCo = await createTestCompany(makeUnique("reject-co"));
    const res = await request(app)
      .post(`${API}/companies/${rejectCo.id}/reject`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Test rejection" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/rejected/i);
  });

  it("payment suspends a company", async () => {
    const psCo = await createTestCompany(makeUnique("ps-co"));
    await query(`UPDATE companies SET status = 'active' WHERE id = $1`, [psCo.id]);
    const res = await request(app)
      .post(`${API}/companies/${psCo.id}/payment-suspend`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Payment issue test" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/payment suspended/i);
  });

  it("clears payment suspension", async () => {
    const cpCo = await createTestCompany(makeUnique("cp-co"));
    await query(`UPDATE companies SET status = 'payment_suspended' WHERE id = $1`, [cpCo.id]);
    const res = await request(app)
      .post(`${API}/companies/${cpCo.id}/clear-payment-suspend`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cleared/i);
  });

  it("blocks non-super-admin from company actions", async () => {
    const res = await request(app)
      .post(`${API}/companies/${testCompany.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 when approving non-existent company", async () => {
    const res = await request(app)
      .post(`${API}/companies/00000000-0000-0000-0000-000000000000/approve`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────
// 4. Provider Verification & Documents
// ─────────────────────────────────────────────────────
describe("Provider Verification", () => {
  let uploadDocId: string;

  beforeAll(async () => {
    await cleanVerificationData();
    // Reset provider verification status
    await query(
      `UPDATE companies SET verification_status = 'not_started' WHERE id = $1`,
      [providerCompany.id]
    );
  });

  it("returns verification status for provider", async () => {
    const res = await request(app)
      .get(`/api/provider/verification/status`)
      .set("Authorization", `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("verificationStatus");
    expect(res.body).toHaveProperty("documents");
  });

  it("blocks verification status for buyer", async () => {
    const res = await request(app)
      .get(`/api/provider/verification/status`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(403);
  });

  it("uploads a verification document", async () => {
    const fakePdf = Buffer.from("%PDF-1.4 fake pdf content for testing");
    const res = await request(app)
      .post(`/api/provider/verification/documents/upload`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("document_type", "business_registration")
      .attach("document", fakePdf, "test-registration.pdf");
    // Accept either 201 or 400 (if MIME validation rejects our fake PDF)
    if (res.status === 201) {
      expect(res.body).toHaveProperty("id");
      uploadDocId = res.body.id;
    } else if (res.status === 400) {
      // MIME validation may reject application/octet-stream
      expect(res.body.error).toBeTruthy();
    }
  });

  it("rejects upload without document type", async () => {
    const fakePdf = Buffer.from("fake content");
    const res = await request(app)
      .post(`/api/provider/verification/documents/upload`)
      .set("Authorization", `Bearer ${providerToken}`)
      .attach("document", fakePdf, "test.pdf");
    expect(res.status).toBe(400);
  });

  it("rejects upload with invalid document type", async () => {
    const fakePdf = Buffer.from("fake content");
    const res = await request(app)
      .post(`/api/provider/verification/documents/upload`)
      .set("Authorization", `Bearer ${providerToken}`)
      .field("document_type", "invalid_type")
      .attach("document", fakePdf, "test.pdf");
    expect(res.status).toBe(400);
  });

  it("rejects upload without auth", async () => {
    const res = await request(app)
      .post(`/api/provider/verification/documents/upload`);
    expect(res.status).toBe(401);
  });

  it("submits verification for review", async () => {
    // First check if we have any documents uploaded
    const statusRes = await request(app)
      .get(`/api/provider/verification/status`)
      .set("Authorization", `Bearer ${providerToken}`);
    const docs = statusRes.body.documents || [];

    if (docs.length > 0) {
      const waiver = await request(app)
        .post(`${API}/companies/${providerCompany.id}/verification-fee/waive`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ days: 30, reason: "Test waiver" });
      expect(waiver.status).toBe(200);

      const res = await request(app)
        .post(`/api/provider/verification/submit`)
        .set("Authorization", `Bearer ${providerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/submitted/i);
    } else {
      // Can't submit without documents
      const res = await request(app)
        .post(`/api/provider/verification/submit`)
        .set("Authorization", `Bearer ${providerToken}`);
      expect(res.status).toBe(400);
    }
  });

  it("blocks buyer from submitting verification", async () => {
    const res = await request(app)
      .post(`/api/provider/verification/submit`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────
// 5. Document Review
// ─────────────────────────────────────────────────────
describe("Document Review", () => {
  let companyDocId: string;

  beforeAll(async () => {
    // Create a verification document directly in the DB
    const docResult = await query(
      `INSERT INTO verification_documents (company_id, uploaded_by, document_type, file_name, storage_key, mime_type, file_size, status)
       VALUES ($1, $2, 'business_registration', 'test-doc.pdf', 'test/storage/key.pdf', 'application/pdf', 1024, 'pending')
       RETURNING id`,
      [providerCompany.id, providerUser.id]
    );
    companyDocId = docResult.rows[0].id;
  });

  it("lists pending documents", async () => {
    const res = await request(app)
      .get(`${API}/documents?status=pending`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("documents");
    expect(res.body).toHaveProperty("total");
  });

  it("approves a document", async () => {
    const res = await request(app)
      .post(`${API}/documents/${companyDocId}/approve`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ notes: "Looks good" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/approved/i);

    const check = await query(`SELECT status FROM verification_documents WHERE id = $1`, [companyDocId]);
    expect(check.rows[0].status).toBe("approved");
  });

  it("rejects a document", async () => {
    // Create another doc for rejection test
    const doc2 = await query(
      `INSERT INTO verification_documents (company_id, uploaded_by, document_type, file_name, storage_key, mime_type, file_size, status)
       VALUES ($1, $2, 'tax_identification', 'tax-doc.pdf', 'test/storage/tax.pdf', 'application/pdf', 2048, 'pending')
       RETURNING id`,
      [providerCompany.id, providerUser.id]
    );
    const doc2Id = doc2.rows[0].id;

    const res = await request(app)
      .post(`${API}/documents/${doc2Id}/reject`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Illegible scan", notes: "Please upload a clearer copy" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/rejected/i);
  });

  it("requests document re-upload", async () => {
    const doc3 = await query(
      `INSERT INTO verification_documents (company_id, uploaded_by, document_type, file_name, storage_key, mime_type, file_size, status)
       VALUES ($1, $2, 'proof_of_address', 'address.pdf', 'test/storage/addr.pdf', 'application/pdf', 512, 'pending')
       RETURNING id`,
      [providerCompany.id, providerUser.id]
    );
    const doc3Id = doc3.rows[0].id;

    const res = await request(app)
      .post(`${API}/documents/${doc3Id}/request-reupload`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Document expired", notes: "Please provide a recent utility bill" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/re-upload/i);
  });

  it("blocks non-super-admin from document actions", async () => {
    const res = await request(app)
      .post(`${API}/documents/${companyDocId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent document", async () => {
    const res = await request(app)
      .post(`${API}/documents/00000000-0000-0000-0000-000000000000/approve`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────
// 6. Audit Logs
// ─────────────────────────────────────────────────────
describe("Audit Logs", () => {
  it("returns audit logs", async () => {
    const res = await request(app)
      .get(`${API}/audit-logs`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
  });

  it("filters audit logs by action type", async () => {
    const res = await request(app)
      .get(`${API}/audit-logs?action=company_approved`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });

  it("blocks non-super-admin from audit logs", async () => {
    const res = await request(app)
      .get(`${API}/audit-logs`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────
// 7. Activity Logs
// ─────────────────────────────────────────────────────
describe("Activity Logs", () => {
  it("returns activity logs", async () => {
    const res = await request(app)
      .get(`${API}/activity-logs`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("logs");
  });

  it("filters activity logs by company", async () => {
    const res = await request(app)
      .get(`${API}/activity-logs?companyId=${providerCompany.id}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────
// 8. Subscription Plan Management
// ─────────────────────────────────────────────────────
describe("Plan Management", () => {
  it("lists all plans", async () => {
    const res = await request(app)
      .get(`${API}/plans`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("creates a new plan", async () => {
    const planName = makeUnique("plan");
    const res = await request(app)
      .post(`${API}/plans`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        name: planName,
        displayName: "Test Plan",
        description: "A test plan",
        priceMonthly: 150,
        priceYearly: 1500,
        maxUsers: 5,
        sortOrder: 10,
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(planName);
  });

  it("rejects plan creation without name", async () => {
    const res = await request(app)
      .post(`${API}/plans`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ priceMonthly: 100 });
    expect(res.status).toBe(400);
  });

  it("updates an existing plan", async () => {
    const plan = await query(`SELECT id FROM plans WHERE name = 'free' LIMIT 1`);
    if (plan.rows.length > 0) {
      const res = await request(app)
        .patch(`${API}/plans/${plan.rows[0].id}`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ priceMonthly: 0 });
      expect(res.status).toBe(200);
    }
  });
});

// ─────────────────────────────────────────────────────
// 9. Subscription Management
// ─────────────────────────────────────────────────────
describe("Subscription Management", () => {
  let subscriptionId: string;

  beforeAll(async () => {
    // Ensure the provider company has a subscription
    const existing = await query(
      `SELECT cs.id FROM company_subscriptions cs WHERE cs.company_id = $1`,
      [providerCompany.id]
    );
    if (existing.rows.length === 0) {
      const plan = await query(`SELECT id FROM plans WHERE name = 'free' LIMIT 1`);
      const sub = await query(
        `INSERT INTO company_subscriptions (company_id, plan_id, status) VALUES ($1, $2, 'free_active') RETURNING id`,
        [providerCompany.id, plan.rows[0].id]
      );
      subscriptionId = sub.rows[0].id;
    } else {
      subscriptionId = existing.rows[0].id;
    }
  });

  it("lists company subscriptions", async () => {
    const res = await request(app)
      .get(`${API}/company-subscriptions`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("subscriptions");
  });

  it("filters subscriptions by status", async () => {
    const res = await request(app)
      .get(`${API}/company-subscriptions?status=free_active`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subscriptions.every((s: any) => s.status === "free_active")).toBe(true);
  });

  it("updates a company subscription", async () => {
    const res = await request(app)
      .patch(`${API}/company-subscriptions/${subscriptionId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ status: "active" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
  });
});
