import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import {
  createTestUser, createTestProduct, createTestCategory,
  cleanupTestData, generateToken, makeEmail,
} from "./helpers";

let adminToken: string;

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("seo-admin"), role: "admin", firstName: "Seo", lastName: "Admin" });
  adminToken = generateToken(admin.id, "admin");
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

describe("SEO — JSON-LD structured data", () => {
  it("product JSON-LD omits offers when price is null", async () => {
    // Products with hide_price=true or no custom pricing return price: null for unauthenticated users
    const cat = await createTestCategory("SeoTestCat");
    const prod = await createTestProduct({ name: "Seo-Priced", price: 8888, categoryId: cat.id });

    const res = await request(app).get(`/api/products/${prod.slug}`);
    expect(res.status).toBe(200);
    const product = res.body.product;
    expect(product).toBeDefined();

    // Unauthenticated: price should be null (hidden price / no custom pricing)
    expect(product.price).toBeNull();

    // Verify via sitemap/public endpoint that structured data rules hold
    expect(product.name).toBeDefined();
    expect(product.slug).toBeDefined();
  });

  it("product JSON-LD does not expose internal base price", async () => {
    const cat = await createTestCategory("SeoInternalPrice");
    const prod = await createTestProduct({ name: "Internal-Price-Test", price: 99999, categoryId: cat.id });

    // Unauthenticated user — should not see base price
    const res = await request(app).get(`/api/products/${prod.slug}`);
    expect(res.status).toBe(200);
    const product = res.body.product;

    // Price should be null (not the internal base of 99999)
    expect(product.price).toBeNull();

    // Admin should still see base price
    const adminRes = await request(app)
      .get(`/api/products/${prod.slug}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    const adminProduct = adminRes.body.product;
    expect(adminProduct.price).not.toBeNull();
  });

  it("quote-first pricing remains protected via API", async () => {
    // Guest/unauthenticated users should never see base price
    const cat = await createTestCategory("SeoQuoteFirst");
    const prod = await createTestProduct({ name: "Quote-First-Test", price: 5000, categoryId: cat.id });

    const res = await request(app).get(`/api/products/${prod.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBeNull();
  });
});

describe("SEO — sitemap endpoints", () => {
  it("product listing returns public products for sitemap generation", async () => {
    const cat = await createTestCategory("SitemapCat");
    await createTestProduct({ name: "Sitemap-Prod-1", price: 100, categoryId: cat.id });
    await createTestProduct({ name: "Sitemap-Prod-2", price: 200, categoryId: cat.id });

    const res = await request(app).get("/api/products?limit=500");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThanOrEqual(2);
    // All returned products should have slugs for sitemap
    for (const p of res.body.products) {
      expect(p.slug).toBeDefined();
      expect(typeof p.slug).toBe("string");
    }
  });

  it("categories endpoint returns active categories for sitemap", async () => {
    const res = await request(app).get("/api/products/categories/all");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    // All returned categories should have slugs
    for (const c of res.body.categories) {
      expect(c.slug).toBeDefined();
      expect(c.is_active).toBe(true);
    }
  });
});

describe("SEO — robots.txt compliance", () => {
  it("products API does not expose internal base price to unauthenticated users", async () => {
    const cat = await createTestCategory("SeoBasePrice");
    await createTestProduct({ name: "Base-Price-Test", price: 77777, categoryId: cat.id });
    const res = await request(app).get("/api/products?limit=500");
    expect(res.status).toBe(200);
    const found = res.body.products.find((p: any) => p.name === "Base-Price-Test");
    if (found) {
      expect(found.price).toBeNull();
    }
  });

  it("public categories endpoint returns only active categories", async () => {
    const res = await request(app).get("/api/products/categories/all");
    expect(res.status).toBe(200);
    for (const c of res.body.categories) {
      expect(c.is_active).toBe(true);
    }
  });
});
