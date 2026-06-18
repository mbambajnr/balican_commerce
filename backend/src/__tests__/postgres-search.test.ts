import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import {
  cleanupTestData,
  createTestCategory,
  createTestProduct,
  createTestUser,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

let adminToken: string;
let parentCategory: any;
let childCategory: any;
let exactProduct: any;
let descriptionProduct: any;
const analyticsQueries: string[] = [];
const productIds: string[] = [];

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("postgres-search-admin"), role: "admin" });
  adminToken = generateToken(admin.id, "admin");
  parentCategory = await createTestCategory(makeUnique("Search Electrical"));
  childCategory = await createTestCategory(makeUnique("Search Transformers"));
  await query("UPDATE categories SET parent_category_id = $1 WHERE id = $2", [parentCategory.id, childCategory.id]);

  exactProduct = await createTestProduct({
    name: `Quantum Transformer ${Date.now()}`,
    categoryId: childCategory.id,
  });
  descriptionProduct = await createTestProduct({
    name: `Industrial Switchgear ${Date.now()}`,
    categoryId: parentCategory.id,
  });
  await query("UPDATE products SET description = $1 WHERE id = $2", ["High voltage distribution equipment", exactProduct.id]);
  await query("UPDATE products SET description = $1 WHERE id = $2", ["Arc-resistant cocoa substation assembly", descriptionProduct.id]);
  productIds.push(exactProduct.id, descriptionProduct.id);
});

afterAll(async () => {
  await query("DELETE FROM product_analytics_events WHERE search_query = ANY($1) OR product_id = ANY($2::uuid[])", [analyticsQueries, productIds]);
  await cleanupTestData();
  await pool.end();
});

describe("PostgreSQL product search", () => {
  it("returns exact and typo-tolerant name matches", async () => {
    const exact = await request(app).get("/api/products?search=quantum%20transformer");
    expect(exact.status).toBe(200);
    expect(exact.body.products.map((product: any) => product.id)).toContain(exactProduct.id);

    const typo = await request(app).get("/api/products?search=quantm%20transformer");
    expect(typo.status).toBe(200);
    expect(typo.body.products.map((product: any) => product.id)).toContain(exactProduct.id);
  });

  it("matches description text and preserves hidden-price behavior", async () => {
    const response = await request(app).get("/api/products?search=arc-resistant%20cocoa");
    expect(response.status).toBe(200);
    const product = response.body.products.find((item: any) => item.id === descriptionProduct.id);
    expect(product).toBeDefined();
    expect(product.price).toBeNull();
    expect(product).toHaveProperty("category_name");
  });

  it("applies parent and subcategory filters", async () => {
    const parent = await request(app).get(`/api/products?search=transformer&category=${parentCategory.slug}`);
    expect(parent.status).toBe(200);
    expect(parent.body.products.map((product: any) => product.id)).toContain(exactProduct.id);

    const wrongSubcategory = await request(app).get(`/api/products?search=switchgear&subcategory=${childCategory.slug}`);
    expect(wrongSubcategory.status).toBe(200);
    expect(wrongSubcategory.body.products.map((product: any) => product.id)).not.toContain(descriptionProduct.id);
  });

  it("excludes inactive products and returns stable pagination", async () => {
    const hidden = await createTestProduct({
      name: `Quantum Transformer Retired ${Date.now()}`,
      categoryId: childCategory.id,
    });
    productIds.push(hidden.id);
    await query("UPDATE products SET is_active = false WHERE id = $1", [hidden.id]);

    const response = await request(app).get("/api/products?search=quantum%20transformer&page=1&limit=1");
    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.pagination.limit).toBe(1);
    expect(response.body.products.map((product: any) => product.id)).not.toContain(hidden.id);
  });
});

describe("PostgreSQL product analytics", () => {
  it("tracks events and preserves all admin report shapes", async () => {
    const searchQuery = makeUnique("postgres analytics");
    analyticsQueries.push(searchQuery);

    const searchTrack = await request(app)
      .post("/api/analytics/track-search")
      .send({ query: searchQuery, resultCount: 3 });
    expect(searchTrack.status).toBe(200);

    const viewTrack = await request(app)
      .post("/api/analytics/track-view")
      .send({ productId: exactProduct.id, productName: exactProduct.name });
    expect(viewTrack.status).toBe(200);

    const [popularSearches, popularProducts, volume] = await Promise.all([
      request(app).get("/api/analytics/popular-searches").set("Authorization", `Bearer ${adminToken}`),
      request(app).get("/api/analytics/popular-products").set("Authorization", `Bearer ${adminToken}`),
      request(app).get("/api/analytics/search-volume").set("Authorization", `Bearer ${adminToken}`),
    ]);

    expect(popularSearches.status).toBe(200);
    expect(popularSearches.body.searches).toEqual(expect.arrayContaining([
      expect.objectContaining({ query: searchQuery, count: 1 }),
    ]));
    expect(popularProducts.status).toBe(200);
    expect(popularProducts.body.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: exactProduct.id, productName: exactProduct.name, views: 1 }),
    ]));
    expect(volume.status).toBe(200);
    expect(volume.body.volume[0]).toEqual(expect.objectContaining({ date: expect.any(String), count: expect.any(Number) }));
  });
});
