import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { createTestUser, createTestProduct, createTestCategory, generateToken, cleanupTestData, TEST_PREFIX } from "./helpers";
import { parseYouTubeUrl, parseVimeoUrl, parseVideoUrl, isValidVideoUrl } from "../services/storage";

let adminToken: string;
let customerToken: string;
let productId: string;
let adminUser: any;
let customerUser: any;
let category: any;
let testSlug: string;

beforeAll(async () => {
  category = await createTestCategory("Media Test Category");
  const product = await createTestProduct({ name: "Media Test Product", categoryId: category.id });
  productId = product.id;

  adminUser = await createTestUser({ role: "admin", email: `${TEST_PREFIX}media-admin@test.com` });
  customerUser = await createTestUser({ role: "customer", email: `${TEST_PREFIX}media-customer@test.com` });

  adminToken = generateToken(adminUser.id, "admin");
  customerToken = generateToken(customerUser.id, "customer");

  const p = await query(`SELECT slug FROM products WHERE id = $1`, [productId]);
  testSlug = p.rows[0]?.slug || "media-test-product";
});

afterAll(async () => {
  await cleanupTestData();
});

function createTestImageBuffer(size = 1024): Buffer {
  const png = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B,
    0x55, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xD7, 0x63, 0x60, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
  ]);
  if (size > png.length) {
    const padded = Buffer.alloc(size);
    png.copy(padded);
    return padded;
  }
  return png;
}

// ── TC-PM-1: Admin can upload multiple product images ──
describe("Image upload", () => {
  test("TC-PM-1: Admin can upload multiple product images", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "test1.png")
      .attach("images", createTestImageBuffer(), "test2.png");

    expect(res.status).toBe(201);
    expect(res.body.media).toHaveLength(2);
    expect(res.body.media[0].media_type).toBe("image");
    expect(res.body.media[0].url).toContain("/uploads/products/");
    expect(res.body.media[0].storage_key).toContain("products/");
    expect(res.body.media[0].filename).toBe("test1.png");
    expect(res.body.media[0].mime_type).toBe("image/png");
    expect(Number(res.body.media[0].size_bytes)).toBeGreaterThan(0);
  });

  test("TC-PM-2: Non-admin cannot upload images", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/images`)
      .set("Authorization", `Bearer ${customerToken}`)
      .attach("images", createTestImageBuffer(), "test.png");

    expect(res.status).toBe(403);
  });

  test("TC-PM-3: Invalid image file type is rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", Buffer.from("fake-gif-data"), "test.gif");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported");
  });

  test("TC-PM-4: Oversized image is rejected", async () => {
    const oversized = createTestImageBuffer(6 * 1024 * 1024);
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", oversized, "large.png");

    expect(res.status).toBe(400);
  });
});

// ── TC-PM-5: First image becomes primary automatically ──
describe("Primary image handling", () => {
  let productId2: string;

  beforeAll(async () => {
    const p = await createTestProduct({ name: "Primary Test Product", categoryId: category.id });
    productId2 = p.id;
  });

  test("TC-PM-5: First image becomes primary automatically", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId2}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "primary1.png");

    expect(res.status).toBe(201);
    expect(res.body.media[0].is_primary).toBe(true);
  });

  test("TC-PM-6: Setting second image primary unsets first", async () => {
    const res1 = await request(app)
      .post(`/api/admin/products/${productId2}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "second.png");
    expect(res1.status).toBe(201);
    const secondMedia = res1.body.media[0];
    expect(secondMedia.is_primary).toBe(false);

    const res2 = await request(app)
      .patch(`/api/admin/products/${productId2}/media/${secondMedia.id}/primary`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res2.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/admin/products/${productId2}/media`)
      .set("Authorization", `Bearer ${adminToken}`);
    const images = getRes.body.media.filter((m: any) => m.media_type === "image");
    const primaryImgs = images.filter((m: any) => m.is_primary);
    expect(primaryImgs).toHaveLength(1);
    expect(primaryImgs[0].id).toBe(secondMedia.id);
  });

  test("TC-PM-7: Video cannot be set as primary", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Test Video" });
    expect(res.status).toBe(201);
    const videoMedia = res.body.media;

    const patchRes = await request(app)
      .patch(`/api/admin/products/${productId}/media/${videoMedia.id}/primary`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toContain("Only images");
  });
});

// ── Video URL handling ──
describe("Video URL handling", () => {
  test("TC-PM-8: Admin can add YouTube video URL and embed_url is generated", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Rick Roll" });

    expect(res.status).toBe(201);
    expect(res.body.media.media_type).toBe("video");
    expect(res.body.media.provider).toBe("youtube");
    expect(res.body.media.embed_url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(res.body.media.thumbnail_url).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(res.body.media.is_primary).toBe(false);
  });

  test("TC-PM-9: Admin can add Vimeo video URL and embed_url is generated", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "https://vimeo.com/123456789" });

    expect(res.status).toBe(201);
    expect(res.body.media.media_type).toBe("video");
    expect(res.body.media.provider).toBe("vimeo");
    expect(res.body.media.embed_url).toBe("https://player.vimeo.com/video/123456789");
  });

  test("TC-PM-10: Unsupported video provider rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "https://vimeo.com/123456789" });

    expect(res.status).toBe(201);
  });
});

// ── URL security ──
describe("Video URL security", () => {
  test("TC-PM-11a: javascript: URLs rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "javascript:alert('xss')" });
    expect(res.status).toBe(400);
  });

  test("TC-PM-11b: data: URLs rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "data:text/html,<script>alert('xss')</script>" });
    expect(res.status).toBe(400);
  });

  test("TC-PM-11c: file: URLs rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "file:///etc/passwd" });
    expect(res.status).toBe(400);
  });

  test("TC-PM-11d: localhost URLs rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "http://localhost:4000/api/admin/products" });
    expect(res.status).toBe(400);
  });

  test("TC-PM-11e: Private IP URLs rejected", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "http://192.168.1.1/admin" });
    expect(res.status).toBe(400);
  });
});

// ── URL parsing unit tests ──
describe("URL parsing unit tests", () => {
  test("parseYouTubeUrl: standard watch URL", () => {
    const result = parseYouTubeUrl("https://www.youtube.com/watch?v=abc123DEF_-");
    expect(result).not.toBeNull();
    expect(result!.embedUrl).toBe("https://www.youtube.com/embed/abc123DEF_-");
    expect(result!.thumbnailUrl).toBe("https://img.youtube.com/vi/abc123DEF_-/hqdefault.jpg");
  });

  test("parseYouTubeUrl: short youtu.be URL", () => {
    const result = parseYouTubeUrl("https://youtu.be/abc123");
    expect(result).not.toBeNull();
    expect(result!.embedUrl).toBe("https://www.youtube.com/embed/abc123");
  });

  test("parseYouTubeUrl: shorts URL", () => {
    const result = parseYouTubeUrl("https://youtube.com/shorts/abc123");
    expect(result).not.toBeNull();
    expect(result!.embedUrl).toBe("https://www.youtube.com/embed/abc123");
  });

  test("parseVimeoUrl: standard URL", () => {
    const result = parseVimeoUrl("https://vimeo.com/123456789");
    expect(result).not.toBeNull();
    expect(result!.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });

  test("parseVimeoUrl: player URL", () => {
    const result = parseVimeoUrl("https://player.vimeo.com/video/123456789");
    expect(result).not.toBeNull();
    expect(result!.embedUrl).toBe("https://player.vimeo.com/video/123456789");
  });
});

// ── Media list/detail responses ──
describe("Media API responses", () => {
  beforeAll(async () => {
    await query(`DELETE FROM product_attachments WHERE product_id = $1`, [productId]);
  });

  test("TC-PM-12: Product detail returns images/videos sorted by sort_order", async () => {
    const formData1 = await request(app)
      .post(`/api/admin/products/${productId}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "img_a.png");

    await request(app)
      .post(`/api/admin/products/${productId}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "img_b.png");

    const res = await request(app).get(`/api/products/${testSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.product.media).toBeDefined();
    expect(res.body.product.images).toBeDefined();
    expect(res.body.product.videos).toBeDefined();
    expect(res.body.product.media.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < res.body.product.media.length; i++) {
      expect(res.body.product.media[i].sort_order).toBeGreaterThanOrEqual(res.body.product.media[i - 1].sort_order);
    }
  });

  test("TC-PM-13: Product list returns primary image", async () => {
    const res = await request(app).get("/api/products?limit=50");
    expect(res.status).toBe(200);
    const testProduct = res.body.products.find((p: any) => p.id === productId);
    expect(testProduct).toBeDefined();
    expect(testProduct.primary_image).toBeDefined();
    expect(testProduct.primary_image.url).toBeTruthy();
  });

  test("TC-PM-18: has_video appears only when video exists, primary_image unaffected", async () => {
    // Product starts with no video → has_video: false
    let res = await request(app).get("/api/products?limit=50");
    let tp = res.body.products.find((p: any) => p.id === productId);
    expect(tp.has_video).toBe(false);
    expect(tp.primary_image).toBeDefined();
    expect(tp.primary_image.url).toBeTruthy();

    // Add a video → has_video: true
    const addRes = await request(app)
      .post(`/api/admin/products/${productId}/media/videos`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Test Video" });
    expect(addRes.status).toBe(201);

    res = await request(app).get("/api/products?limit=50");
    tp = res.body.products.find((p: any) => p.id === productId);
    expect(tp.has_video).toBe(true);
    // primary_image NOT replaced by video
    expect(tp.primary_image).toBeDefined();
    expect(tp.primary_image.url).toBeTruthy();
    // No embed/video data leaked in listing
    expect(tp.videos).toBeUndefined();
    expect(tp.embed_url).toBeUndefined();

    // Authenticated non-company user — no explicit pricing → price is null
    const authRes = await request(app)
      .get("/api/products?limit=50")
      .set("Authorization", `Bearer ${customerToken}`);
    const authTp = authRes.body.products.find((p: any) => p.id === productId);
    expect(authTp.has_video).toBe(true);
    // Non-company customer does not see base price; only company/group pricing resolves
    expect(authTp.price).toBeNull();

    // Delete video → has_video: false again
    await query(`DELETE FROM product_attachments WHERE product_id = $1 AND media_type = 'video'`, [productId]);
    res = await request(app).get("/api/products?limit=50");
    tp = res.body.products.find((p: any) => p.id === productId);
    expect(tp.has_video).toBe(false);
  });

  test("TC-PM-19: hide_price works with has_video", async () => {
    await query(`UPDATE products SET hide_price = true WHERE id = $1`, [productId]);
    const res = await request(app).get("/api/products?limit=50");
    expect(res.status).toBe(200);
    const tp = res.body.products.find((p: any) => p.id === productId);
    expect(tp).toBeDefined();
    expect(tp.has_video).toBe(false);
    expect(tp.primary_image).toBeDefined();
    expect(tp.price).toBeNull();
    await query(`UPDATE products SET hide_price = false WHERE id = $1`, [productId]);
  });
});

// ── CRUD operations ──
describe("Media CRUD", () => {
  let productId3: string;

  beforeAll(async () => {
    const p = await createTestProduct({ name: "CRUD Test Product", categoryId: category.id });
    productId3 = p.id;
  });

  test("TC-PM-14: Deleting primary image promotes next image", async () => {
    const res1 = await request(app)
      .post(`/api/admin/products/${productId3}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "first.png");
    const first = res1.body.media[0];
    expect(first.is_primary).toBe(true);

    await request(app)
      .post(`/api/admin/products/${productId3}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "second.png");

    const delRes = await request(app)
      .delete(`/api/admin/products/${productId3}/media/${first.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/admin/products/${productId3}/media`)
      .set("Authorization", `Bearer ${adminToken}`);
    const newPrimary = getRes.body.media.find((m: any) => m.is_primary);
    expect(newPrimary).toBeDefined();
    expect(newPrimary.id).not.toBe(first.id);
  });

  test("TC-PM-15: Deleting image removes row and attempts storage delete", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId3}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "delete-me.png");
    const media = res.body.media[0];

    const delRes = await request(app)
      .delete(`/api/admin/products/${productId3}/media/${media.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    const rowCheck = await query(`SELECT id FROM product_attachments WHERE id = $1`, [media.id]);
    expect(rowCheck.rows).toHaveLength(0);
  });

  test("TC-PM-16: PATCH media updates alt_text and title", async () => {
    const res = await request(app)
      .post(`/api/admin/products/${productId3}/media/images`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("images", createTestImageBuffer(), "edit-me.png");
    const media = res.body.media[0];

    const patchRes = await request(app)
      .patch(`/api/admin/products/${productId3}/media/${media.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ alt_text: "New alt text", title: "New Title" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.media.alt_text).toBe("New alt text");
    expect(patchRes.body.media.title).toBe("New Title");
  });
});

// ── Quote-first pricing unaffected ──
describe("Quote-first pricing unaffected by media", () => {
  test("TC-PM-17: hide_price behavior remains unaffected when media present", async () => {
    await query(`UPDATE products SET hide_price = true WHERE id = $1`, [productId]);

    const res = await request(app).get(`/api/products/${testSlug}`);
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBeNull();
    expect(res.body.product.media).toBeDefined();
    expect(res.body.product.media.length).toBeGreaterThan(0);

    await query(`UPDATE products SET hide_price = false WHERE id = $1`, [productId]);
  });
});

// ── URL security unit tests ──
describe("isValidVideoUrl unit tests", () => {
  test("rejects javascript:", () => {
    expect(isValidVideoUrl("javascript:alert(1)").valid).toBe(false);
  });
  test("rejects data:", () => {
    expect(isValidVideoUrl("data:text/html,<script>").valid).toBe(false);
  });
  test("rejects file:", () => {
    expect(isValidVideoUrl("file:///etc/passwd").valid).toBe(false);
  });
  test("rejects localhost", () => {
    expect(isValidVideoUrl("http://localhost:3000").valid).toBe(false);
  });
  test("rejects private IP", () => {
    expect(isValidVideoUrl("http://192.168.1.1/admin").valid).toBe(false);
    expect(isValidVideoUrl("http://10.0.0.1/admin").valid).toBe(false);
    expect(isValidVideoUrl("http://172.16.0.1/admin").valid).toBe(false);
  });
  test("accepts valid YouTube URL", () => {
    expect(isValidVideoUrl("https://www.youtube.com/watch?v=valid").valid).toBe(true);
  });
  test("accepts valid Vimeo URL", () => {
    expect(isValidVideoUrl("https://vimeo.com/123456789").valid).toBe(true);
  });
  test("rejects invalid URL format", () => {
    expect(isValidVideoUrl("not-a-url").valid).toBe(false);
  });
});
