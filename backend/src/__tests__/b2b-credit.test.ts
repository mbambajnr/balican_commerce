import request from "supertest";
import app from "../app";
import { query, pool } from "../config/db";
import {
  createTestUser, createTestCompany, createTestProduct, createTestCategory,
  cleanupTestData, generateToken, makeEmail,
} from "./helpers";

let adminToken: string;
let companyAdminToken: string;
let financeToken: string;
let buyerToken: string;
let viewerToken: string;
let otherCompanyToken: string;
let company: any;
let testProduct: any;

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("credit-admin"), role: "admin", firstName: "Credit", lastName: "Admin" });
  adminToken = generateToken(admin.id, "admin");

  company = await createTestCompany("Credit Test Co");

  const companyAdmin = await createTestUser({
    email: makeEmail("credit-ca"), companyId: company.id, companyName: company.name,
    companyRole: "company_admin",
  });
  companyAdminToken = generateToken(companyAdmin.id, "customer");

  const financeUser = await createTestUser({
    email: makeEmail("credit-fin"), companyId: company.id, companyName: company.name,
    companyRole: "finance",
  });
  financeToken = generateToken(financeUser.id, "customer");

  const buyerUser = await createTestUser({
    email: makeEmail("credit-buy"), companyId: company.id, companyName: company.name,
    companyRole: "buyer",
  });
  buyerToken = generateToken(buyerUser.id, "customer");

  const viewerUser = await createTestUser({
    email: makeEmail("credit-view"), companyId: company.id, companyName: company.name,
    companyRole: "viewer",
  });
  viewerToken = generateToken(viewerUser.id, "customer");

  const otherCo = await createTestCompany("Other Credit Co");
  const otherUser = await createTestUser({
    email: makeEmail("credit-other"), companyId: otherCo.id, companyName: otherCo.name,
    companyRole: "company_admin",
  });
  otherCompanyToken = generateToken(otherUser.id, "customer");

  const cat = await createTestCategory("Credit Test Cat");
  const productName = `Credit-Product-${Date.now()}`;
  const productSlug = productName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
  const prodResult = await query(
    `INSERT INTO products (name, slug, sku, description, category_id, price, stock_status, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_stock', true) RETURNING *`,
    [productName, productSlug, `SKU-CREDIT-${Date.now()}`, "Credit test product", cat.id, 2000]
  );
  testProduct = prodResult.rows[0];

  // Set a company price so pricing resolves
  await query(
    `INSERT INTO company_prices (company_id, product_id, price) VALUES ($1, $2, 2000) ON CONFLICT DO NOTHING`,
    [company.id, testProduct.id]
  );
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

async function resetCredit(status: string, limit = 50000, used = 0) {
  await query(`UPDATE companies SET credit_status = $1, approved_credit_limit = $2, credit_used = $3,
    requested_credit_limit = $2, credit_rejection_reason = NULL, credit_review_notes = NULL,
    credit_risk_rating = 'low', credit_approved_by = NULL, credit_approved_at = NULL,
    credit_reviewed_at = NULL, next_review_at = NULL, payment_terms_days = 30
    WHERE id = $4`, [status, limit, used, company.id]);
}

describe("Credit application flow", () => {
  beforeEach(async () => {
    await resetCredit("not_requested");
  });

  it("company_admin can submit credit application", async () => {
    const r = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ requestedCreditLimit: 50000, preferredPaymentTerms: "30 days" });
    expect(r.status).toBe(200);
    expect(r.body.message).toContain("submitted");

    const c = (await query("SELECT credit_status, requested_credit_limit FROM companies WHERE id = $1", [company.id])).rows[0];
    expect(c.credit_status).toBe("pending_review");
    expect(parseFloat(c.requested_credit_limit)).toBe(50000);
  });

  it("cannot apply again while pending_review", async () => {
    await resetCredit("pending_review", 50000);
    const r = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ requestedCreditLimit: 60000 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/under review/i);
  });

  it("finance role can submit credit application", async () => {
    const r = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${financeToken}`)
      .send({ requestedCreditLimit: 30000 });
    expect(r.status).toBe(200);
  });

  it("buyer role can submit credit application", async () => {
    await resetCredit("not_requested");
    const r = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ requestedCreditLimit: 25000 });
    expect(r.status).toBe(200);
  });

  it("viewer role cannot apply for credit", async () => {
    await resetCredit("not_requested");
    const r = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ requestedCreditLimit: 10000 });
    expect(r.status).toBe(403);
  });

  it("company user can view own credit status (no internal notes leaked)", async () => {
    await resetCredit("pending_review", 50000);
    const r = await request(app)
      .get("/api/company/credit")
      .set("Authorization", `Bearer ${companyAdminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.creditStatus).toBe("pending_review");
    expect(r.body.requestedCreditLimit).toBe(50000);
    expect(r.body.creditReviewNotes).toBeNull();
  });

  it("company user cannot view another company's credit status", async () => {
    const r = await request(app)
      .get("/api/company/credit")
      .set("Authorization", `Bearer ${otherCompanyToken}`);
    expect(r.status).toBe(200);
    expect(r.body.creditStatus).toBe("not_requested");
  });

  it("rejected company can re-apply", async () => {
    await resetCredit("rejected");
    const r = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ requestedCreditLimit: 40000 });
    expect(r.status).toBe(200);
    expect((await query("SELECT credit_status FROM companies WHERE id = $1", [company.id])).rows[0].credit_status).toBe("pending_review");
  });
});

describe("Admin credit review", () => {
  beforeEach(async () => {
    await resetCredit("pending_review", 50000);
  });

  it("non-admin cannot approve credit", async () => {
    const r = await request(app)
      .post(`/api/admin/companies/${company.id}/credit/approve`)
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ approvedCreditLimit: 50000 });
    expect(r.status).toBe(403);
  });

  it("admin can approve credit with limit/terms/risk", async () => {
    const r = await request(app)
      .post(`/api/admin/companies/${company.id}/credit/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ approvedCreditLimit: 50000, paymentTermsDays: 30, creditRiskRating: "low", reviewNotes: "Good standing" });
    expect(r.status).toBe(200);

    const c = (await query("SELECT credit_status, approved_credit_limit, credit_risk_rating, credit_review_notes, payment_terms_days FROM companies WHERE id = $1", [company.id])).rows[0];
    expect(c.credit_status).toBe("approved");
    expect(parseFloat(c.approved_credit_limit)).toBe(50000);
    expect(c.credit_risk_rating).toBe("low");
    expect(c.credit_review_notes).toBe("Good standing");
    expect(c.payment_terms_days).toBe(30);
  });

  it("dashboard shows approved credit status", async () => {
    await resetCredit("approved", 50000);
    const r = await request(app)
      .get("/api/company/dashboard")
      .set("Authorization", `Bearer ${companyAdminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.companyCredit).toBeDefined();
    expect(r.body.companyCredit.creditStatus).toBe("approved");
    expect(r.body.companyCredit.approvedCreditLimit).toBe(50000);
    expect(r.body.companyCredit.availableCredit).toBe(50000);
  });

  it("admin can reject credit with reason", async () => {
    const r = await request(app)
      .post(`/api/admin/companies/${company.id}/credit/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rejectionReason: "High risk profile" });
    expect(r.status).toBe(200);
    expect((await query("SELECT credit_status FROM companies WHERE id = $1", [company.id])).rows[0].credit_status).toBe("rejected");
    expect((await query("SELECT credit_rejection_reason FROM companies WHERE id = $1", [company.id])).rows[0].credit_rejection_reason).toBe("High risk profile");
  });

  it("admin can suspend approved credit", async () => {
    await resetCredit("approved", 50000);
    const r = await request(app)
      .post(`/api/admin/companies/${company.id}/credit/suspend`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect((await query("SELECT credit_status FROM companies WHERE id = $1", [company.id])).rows[0].credit_status).toBe("suspended");
  });

  it("admin can reactivate suspended credit", async () => {
    await resetCredit("suspended");
    const r = await request(app)
      .post(`/api/admin/companies/${company.id}/credit/reactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect((await query("SELECT credit_status FROM companies WHERE id = $1", [company.id])).rows[0].credit_status).toBe("approved");
  });

  it("admin credit status visible in company list", async () => {
    const r = await request(app)
      .get("/api/admin/companies")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    const found = r.body.companies.find((c: any) => c.id === company.id);
    expect(found).toBeDefined();
    expect(found.credit_status).toBeDefined();
  });

  it("admin can see internal review notes on company detail", async () => {
    await resetCredit("approved", 50000);
    await query("UPDATE companies SET credit_review_notes = 'Internal note' WHERE id = $1", [company.id]);
    const r = await request(app)
      .get(`/api/admin/companies/${company.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.company.credit_review_notes).toBe("Internal note");
  });
});

describe("Credit checkout enforcement", () => {
  beforeEach(async () => {
    await resetCredit("approved", 50000, 0);
    await query("DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (SELECT id FROM users WHERE company_id = $1))", [company.id]);
  });

  const addToCart = async (token: string) => {
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: testProduct.id, quantity: 1 });
  };

  it("approved company can checkout with credit within limit", async () => {
    await addToCart(companyAdminToken);
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r.status).toBe(201);
    expect(r.body.order).toBeDefined();

    const comp = await query("SELECT credit_used FROM companies WHERE id = $1", [company.id]);
    expect(parseFloat(comp.rows[0].credit_used)).toBe(2000);
  });

  it("credit checkout with insufficient limit is rejected", async () => {
    await query(`UPDATE companies SET credit_used = 49000 WHERE id = $1`, [company.id]);
    await addToCart(companyAdminToken);
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/insufficient available credit/i);
  });

  it("quick order with credit and insufficient limit is rejected", async () => {
    await query(`UPDATE companies SET credit_used = 49000 WHERE id = $1`, [company.id]);
    const r = await request(app)
      .post("/api/quick-order")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ items: [{ sku: testProduct.sku, quantity: 1 }], paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/insufficient available credit/i);
  });

  it("suspended credit cannot checkout with credit", async () => {
    await resetCredit("suspended", 50000);
    await addToCart(companyAdminToken);
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not approved for credit sales/i);
  });

  it("rejected credit cannot checkout with credit", async () => {
    await resetCredit("rejected", 0);
    await addToCart(companyAdminToken);
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not approved for credit sales/i);
  });

  it("not_requested credit cannot checkout with credit", async () => {
    await resetCredit("not_requested", 0);
    await addToCart(companyAdminToken);
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not approved for credit sales/i);
  });

  it("concurrent credit orders cannot exceed limit", async () => {
    await resetCredit("approved", 4000, 0);

    await addToCart(companyAdminToken);
    const r1 = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r1.status).toBe(201);

    // Second order should also work (2000 + 2000 = 4000 <= 4000)
    await addToCart(companyAdminToken);
    const r2 = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r2.status).toBe(201);

    // Third order should fail (would be 6000 > 4000)
    await addToCart(companyAdminToken);
    const r3 = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r3.status).toBe(400);
    expect(r3.body.error).toMatch(/insufficient available credit/i);
  });

  it("quote-first pricing still enforced — no price = rejection", async () => {
    await resetCredit("approved", 50000, 0);
    // Product without company price
    const noPriceProd = await createTestProduct({
      name: `Credit-NoPrice-${Date.now()}`, price: 9999,
    });
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ productId: noPriceProd.id, quantity: 1 });
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ paymentMethod: "credit" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no assigned price/i);
  });
});
