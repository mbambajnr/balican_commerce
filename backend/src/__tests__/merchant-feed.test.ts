import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import {
  createTestProduct, createTestCategory,
  cleanupTestData, makeUnique,
} from "./helpers";

beforeAll(async () => {
  // Create some test products to appear in the feed
  const cat = await createTestCategory("FeedCat");
  await createTestProduct({ name: makeUnique("feed-prod-1"), price: 15000, categoryId: cat.id, isActive: true });
  await createTestProduct({ name: makeUnique("feed-prod-2"), price: 25000, categoryId: cat.id, isActive: true, stockStatus: "out_of_stock" });
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

describe("Merchant Center Feed", () => {
  it("returns valid XML with correct Content-Type", async () => {
    const res = await request(app).get("/api/products/merchant-feed");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/xml/);
    expect(res.headers["cache-control"]).toMatch(/public/);
  });

  it("contains RSS channel with title and link", async () => {
    const res = await request(app).get("/api/products/merchant-feed");
    expect(res.text).toContain("<rss");
    expect(res.text).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(res.text).toContain("<channel>");
    expect(res.text).toContain("<title>Bali-Can Limited — Product Feed</title>");
    expect(res.text).toContain("<link>");
  });

  it("contains product items with required fields", async () => {
    const res = await request(app).get("/api/products/merchant-feed");
    // Must have at least one <item> with g:id, g:title, g:link, g:price, g:availability
    expect(res.text).toContain("<item>");
    expect(res.text).toContain("<g:id>");
    expect(res.text).toContain("<g:title>");
    expect(res.text).toContain("<g:link>");
    expect(res.text).toContain("<g:price>");
    expect(res.text).toContain("<g:availability>");
    expect(res.text).toContain("<g:brand>");
    expect(res.text).toContain("<g:condition>new</g:condition>");
  });

  it("includes in_stock and out_of_stock products", async () => {
    const res = await request(app).get("/api/products/merchant-feed");
    expect(res.text).toContain("in_stock");
    expect(res.text).toContain("out_of_stock");
  });

  it("prices are formatted with GHS suffix", async () => {
    const res = await request(app).get("/api/products/merchant-feed");
    const priceMatches = res.text.match(/<g:price>[\d.]+ GHS<\/g:price>/g);
    expect(priceMatches).not.toBeNull();
    if (priceMatches) {
      expect(priceMatches.length).toBeGreaterThan(0);
    }
  });

  it("product links use absolute public URLs", async () => {
    const res = await request(app).get("/api/products/merchant-feed");
    const linkMatches = res.text.match(/<g:link>(https?:\/\/[^<]+)<\/g:link>/g);
    expect(linkMatches).not.toBeNull();
    if (linkMatches) {
      expect(linkMatches.length).toBeGreaterThan(0);
      // All links should start with http or https
      linkMatches.forEach((link: string) => {
        expect(link).toMatch(/https?:\/\//);
      });
    }
  });

  it("escapes XML special characters", async () => {
    // Create a product with special chars in name
    const nameWithAmp = makeUnique("feed-amp-test") + " & Co.";
    await query(
      `INSERT INTO products (name, slug, description, price, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [nameWithAmp, nameWithAmp.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "Test & description", 100]
    );

    const res = await request(app).get("/api/products/merchant-feed");
    expect(res.text).not.toContain("& Co.");
    expect(res.text).toContain("&amp; Co.");
    expect(res.text).toContain("&amp; description");
  });

  it("excludes products with hide_price=true from the feed", async () => {
    const cat = await createTestCategory("FeedHidePriceCat");
    const hidden = await createTestProduct({ name: makeUnique("feed-hidden"), price: 5000, categoryId: cat.id, hidePrice: true });
    const visible = await createTestProduct({ name: makeUnique("feed-visible"), price: 3000, categoryId: cat.id, hidePrice: false });

    const res = await request(app).get("/api/products/merchant-feed");
    expect(res.text).not.toContain(hidden.sku);
    expect(res.text).not.toContain(hidden.name);
    expect(res.text).toContain(visible.sku);
  });

  it("excludes products with zero price from the feed", async () => {
    const cat = await createTestCategory("FeedPriceCat");
    const zeroPrice = await createTestProduct({ name: makeUnique("feed-zeroprice"), price: 0, categoryId: cat.id });

    const res = await request(app).get("/api/products/merchant-feed");
    expect(res.text).not.toContain(zeroPrice.name);
  });

  it("sets identifier_exists=false for products without SKU", async () => {
    const name = makeUnique("feed-nosku");
    await query(
      `INSERT INTO products (name, slug, description, price, is_active, sku)
       VALUES ($1, $2, $3, $4, true, NULL)`,
      [name, name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "No SKU product", 100]
    );

    const res = await request(app).get("/api/products/merchant-feed");
    // Should include the product but with identifier_exists=false
    expect(res.text).toContain("<g:identifier_exists>false</g:identifier_exists>");
  });
});
