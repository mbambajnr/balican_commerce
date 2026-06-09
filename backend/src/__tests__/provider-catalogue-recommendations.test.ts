import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { createTestCompany, createTestUser, createTestCategory, createTestProduct, generateToken, TEST_PREFIX, makeEmail } from "./helpers";

let buyerToken: string;
let providerToken: string;
let provider2Token: string;
let buyerCompanyId: string;
let providerCompanyId: string;
let provider2CompanyId: string;
let buyerId: string;
let providerId: string;
let provider2Id: string;
let catId: string;
let productId: string;
let serviceId: string;
let scoutRequestId: string;

beforeAll(async () => {
  // Create buyer company + user
  const buyerCompany = await createTestCompany("rec-test-buyer");
  buyerCompanyId = buyerCompany.id;
  const buyerUser = await createTestUser({
    email: makeEmail("rec-buyer"),
    companyId: buyerCompanyId,
    companyRole: "company_admin",
    role: "customer",
  });
  buyerId = buyerUser.id;
  buyerToken = generateToken(buyerId, "customer");

  // Create provider company + user
  const provCompany = await createTestCompany("rec-test-provider");
  providerCompanyId = provCompany.id;
  await query("UPDATE companies SET is_provider = true, company_type = 'supplier', verification_status = 'approved', status = 'active' WHERE id = $1", [providerCompanyId]);

  const provUser = await createTestUser({
    email: makeEmail("rec-provider"),
    companyId: providerCompanyId,
    companyRole: "company_admin",
    role: "customer",
  });
  providerId = provUser.id;
  providerToken = generateToken(providerId, "customer");

  // Second provider
  const prov2Company = await createTestCompany("rec-test-provider2");
  provider2CompanyId = prov2Company.id;
  await query("UPDATE companies SET is_provider = true, company_type = 'service_provider', verification_status = 'approved', status = 'active' WHERE id = $1", [provider2CompanyId]);

  const prov2User = await createTestUser({
    email: makeEmail("rec-provider2"),
    companyId: provider2CompanyId,
    companyRole: "company_admin",
    role: "customer",
  });
  provider2Id = prov2User.id;
  provider2Token = generateToken(prov2User.id, "customer");

  // Category
  const cat = await createTestCategory("rec-test-category");
  catId = cat.id;

  // Product under provider
  const prod = await createTestProduct({
    name: "Rec Test Product",
    price: 5000,
    categoryId: catId,
    stockStatus: "in_stock",
  });
  productId = prod.id;
  await query("UPDATE products SET provider_company_id = $1, brand = 'TestBrand', model = 'TM-100', delivery_coverage = $2, warranty_information = '2 years', description = 'A test product for recommendations' WHERE id = $3", [providerCompanyId, ["Accra", "Kumasi"], productId]);

  // Service under provider2
  const svcResult = await query(
    `INSERT INTO services (provider_company_id, name, slug, description, category_id, starting_price, pricing_model, coverage_area, estimated_response_time, certifications_or_licenses, contract_type, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
     RETURNING id`,
    [provider2CompanyId, "Rec Test Service", `rec-test-service-${Date.now()}`, "A test service for recommendations", catId, 3000, "fixed", ["Accra"], "Within 24h", ["ISO 9001"], "ONE_TIME"]
  );
  serviceId = svcResult.rows[0].id;

  // Scout request
  const srResult = await query(
    `INSERT INTO scout_requests (company_id, created_by, title, description, category_id, request_type, delivery_location, quantity, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'open')
     RETURNING id`,
    [buyerCompanyId, buyerId, "Rec Test Request", "Looking for test products", catId, "product", "Accra"]
  );
  scoutRequestId = srResult.rows[0].id;
});

afterAll(async () => {
  try { await query(`DELETE FROM recommendation_events WHERE buyer_company_id = $1`, [buyerCompanyId]); } catch {}
  try { await query(`DELETE FROM scout_quotes WHERE request_id = $1`, [scoutRequestId]); } catch {}
  try { await query(`DELETE FROM scout_requests WHERE id = $1`, [scoutRequestId]); } catch {}
  try { await query(`DELETE FROM services WHERE id = $1`, [serviceId]); } catch {}
  try { await query(`DELETE FROM products WHERE id = $1`, [productId]); } catch {}
  try { await query(`DELETE FROM categories WHERE id = $1`, [catId]); } catch {}
  try { await query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [buyerId, providerId, provider2Id]); } catch {}
  try { await query(`DELETE FROM companies WHERE id IN ($1, $2, $3)`, [buyerCompanyId, providerCompanyId, provider2CompanyId]); } catch {}
});

describe("Recommendation Engine — Rules-Based Scoring", () => {
  test("returns recommendations with finalScore, rulesScore, mlScore (null), matchReasons", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.recommendations).toBeDefined();
    expect(Array.isArray(res.body.recommendations)).toBe(true);

    if (res.body.recommendations.length > 0) {
      const rec = res.body.recommendations[0];
      expect(rec).toHaveProperty("finalScore");
      expect(rec).toHaveProperty("rulesScore");
      expect(rec).toHaveProperty("mlScore");
      expect(rec).toHaveProperty("matchReasons");
      expect(rec).toHaveProperty("providerCompanyId");
      expect(rec).toHaveProperty("providerName");
      expect(rec.matchReasons).toBeInstanceOf(Array);
    }
  });

  test("mlScore is null when not provided (no ML model)", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    for (const rec of res.body.recommendations) {
      expect(rec.mlScore).toBeNull();
    }
  });

  test("finalScore equals rulesScore when mlScore is null", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    for (const rec of res.body.recommendations) {
      expect(rec.finalScore).toBe(rec.rulesScore);
    }
  });

  test("recommendations include human-readable reasons", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    for (const rec of res.body.recommendations) {
      if (rec.matchReasons.length > 0) {
        for (const reason of rec.matchReasons) {
          expect(typeof reason.reason).toBe("string");
          expect(reason.reason.length).toBeGreaterThan(0);
          expect(reason).toHaveProperty("weight");
        }
      }
    }
  });

  test("recommendations are sorted by finalScore descending", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    const scores = res.body.recommendations.map((r: any) => r.finalScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  test("recommendations include request metadata", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.request).toBeDefined();
    expect(res.body.request.id).toBe(scoutRequestId);
    expect(res.body.request.title).toBe("Rec Test Request");
  });

  test("returns 404 for non-existent request", async () => {
    const res = await request(app)
      .get(`/api/requests/00000000-0000-0000-0000-000000000000/recommendations`)
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(404);
  });

  test("returns 401 without auth", async () => {
    const res = await request(app)
      .get(`/api/requests/${scoutRequestId}/recommendations`);

    expect(res.status).toBe(401);
  });
});

describe("Recommendation Events Tracking", () => {
  test("POST /recommendation-events tracks an event", async () => {
    const res = await request(app)
      .post("/api/recommendation-events")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        buyerCompanyId,
        providerCompanyId,
        eventType: "PROVIDER_INVITED",
        requestId: scoutRequestId,
        metadata: { source: "test" },
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Event tracked");
  });

  test("POST /recommendation-events rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/recommendation-events")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ eventType: "PROVIDER_INVITED" });

    expect(res.status).toBe(400);
  });

  test("POST /recommendation-events rejects invalid event type", async () => {
    const res = await request(app)
      .post("/api/recommendation-events")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        buyerCompanyId,
        providerCompanyId,
        eventType: "INVALID_EVENT",
      });

    expect(res.status).toBe(400);
  });

  test("POST /recommendation-events returns 401 without auth", async () => {
    const res = await request(app)
      .post("/api/recommendation-events")
      .send({
        buyerCompanyId,
        providerCompanyId,
        eventType: "PROVIDER_INVITED",
      });

    expect(res.status).toBe(401);
  });

  test("recommendation events are stored in DB", async () => {
    await request(app)
      .post("/api/recommendation-events")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        buyerCompanyId,
        providerCompanyId,
        eventType: "QUOTE_ACCEPTED",
        requestId: scoutRequestId,
      });

    const result = await query(
      `SELECT * FROM recommendation_events WHERE buyer_company_id = $1 AND provider_company_id = $2 AND event_type = 'QUOTE_ACCEPTED'`,
      [buyerCompanyId, providerCompanyId]
    );
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].request_id).toBe(scoutRequestId);
  });
});

describe("Provider Readiness — Marketplace Readiness Indicator", () => {
  test("returns readiness for own products and services", async () => {
    const res = await request(app)
      .get("/api/provider/readiness")
      .set("Authorization", `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("products");
    expect(res.body).toHaveProperty("services");
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(Array.isArray(res.body.services)).toBe(true);
  });

  test("readiness items have id, name, issues, status, offeringType", async () => {
    const res = await request(app)
      .get("/api/provider/readiness")
      .set("Authorization", `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    for (const p of res.body.products) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("issues");
      expect(p).toHaveProperty("status");
      expect(p).toHaveProperty("offeringType");
      expect(p.offeringType).toBe("PRODUCT");
    }
  });

  test("readiness checks detect missing fields", async () => {
    const res = await request(app)
      .get("/api/provider/readiness")
      .set("Authorization", `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    const ourProduct = res.body.products.find((p: any) => p.id === productId);
    if (ourProduct) {
      expect(ourProduct.status).toBe("ready");
    }
  });

  test("readiness returns 401 without auth", async () => {
    const res = await request(app).get("/api/provider/readiness");
    expect(res.status).toBe(401);
  });

  test("non-provider gets 403 on readiness", async () => {
    const res = await request(app)
      .get("/api/provider/readiness")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Security — IDOR and Authorization", () => {
  test("provider cannot access another provider's readiness directly", async () => {
    const res = await request(app)
      .get("/api/provider/readiness")
      .set("Authorization", `Bearer ${provider2Token}`);

    expect(res.status).toBe(200);
    const items = [...res.body.products, ...res.body.services];
    for (const item of items) {
      expect(item.name).not.toMatch(/Rec Test Product/);
    }
  });

  test("provider can track recommendation events", async () => {
    const res = await request(app)
      .post("/api/recommendation-events")
      .set("Authorization", `Bearer ${providerToken}`)
      .send({
        buyerCompanyId,
        providerCompanyId: provider2CompanyId,
        eventType: "PROPOSAL_VIEWED",
      });

    expect(res.status).toBe(201);
  });
});
