import request from "supertest";
import app from "../app";
import { query, pool } from "../config/db";
import {
  createTestUser, createTestCompany, createTestProduct, createTestCategory,
  cleanupTestData, generateToken, makeEmail,
} from "./helpers";

let adminToken: string;
let customerToken: string;
let parentCat: any;
let childCat: any;

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("cat-admin"), role: "admin", firstName: "Cat", lastName: "Admin" });
  adminToken = generateToken(admin.id, "admin");
  const customer = await createTestUser({ email: makeEmail("cat-customer"), role: "customer" });
  customerToken = generateToken(customer.id, "customer");
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

describe("Category hierarchy — admin CRUD", () => {
  it("creates a top-level parent category", async () => {
    const name = `Electricals-${Date.now()}`;
    const r = await request(app)
      .post("/api/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name, description: "Electrical products" });
    expect(r.status).toBe(201);
    expect(r.body.category.parent_category_id).toBeNull();
    parentCat = r.body.category;
  });

  it("creates a sub-category under parent", async () => {
    const name = `Cables-${Date.now()}`;
    const r = await request(app)
      .post("/api/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name, description: "Cables and wiring", parentId: parentCat.id });
    expect(r.status).toBe(201);
    expect(r.body.category.parent_category_id).toBe(parentCat.id);
    childCat = r.body.category;
  });

  it("prevents self-parent", async () => {
    const r = await request(app)
      .patch(`/api/admin/categories/${parentCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ parentId: parentCat.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/own parent/i);
  });

  it("prevents circular parent reference", async () => {
    // Try to set parent's parent to the child
    const r = await request(app)
      .patch(`/api/admin/categories/${parentCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ parentId: childCat.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/circular/i);
  });

  it("deactivates a category (soft-disable)", async () => {
    const r = await request(app)
      .patch(`/api/admin/categories/${childCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(r.status).toBe(200);
    expect(r.body.category.is_active).toBe(false);

    // Reactivate for subsequent tests
    await request(app)
      .patch(`/api/admin/categories/${childCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
  });

  it("admin can view inactive categories in the list", async () => {
    // Deactivate first
    await request(app)
      .patch(`/api/admin/categories/${childCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    const r = await request(app)
      .get("/api/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    const found = r.body.categories.find((c: any) => c.id === childCat.id);
    expect(found).toBeDefined();
    expect(found.is_active).toBe(false);

    // Reactivate
    await request(app)
      .patch(`/api/admin/categories/${childCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
  });

  it("tree endpoint returns nested structure", async () => {
    const r = await request(app)
      .get("/api/admin/categories/tree")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.categories)).toBe(true);
    const electricals = r.body.categories.find((c: any) => c.id === parentCat.id);
    expect(electricals).toBeDefined();
    expect(Array.isArray(electricals.children)).toBe(true);
  });
});

describe("Category hierarchy — product filtering", () => {
  let prodInParent: any;
  let prodInChild: any;

  beforeAll(async () => {
    prodInParent = await createTestProduct({ name: "Parent Product", price: 100, categoryId: parentCat.id });
    prodInChild = await createTestProduct({ name: "Child Product", price: 200, categoryId: childCat.id });
  });

  it("filtering by parent returns products in parent AND child categories", async () => {
    const r = await request(app)
      .get(`/api/products?category=${parentCat.slug}`);
    expect(r.status).toBe(200);
    const slugs = r.body.products.map((p: any) => p.slug);
    expect(slugs).toContain(prodInParent.slug);
    expect(slugs).toContain(prodInChild.slug);
  });

  it("filtering by subcategory returns only child category products", async () => {
    const r = await request(app)
      .get(`/api/products?subcategory=${childCat.slug}`);
    expect(r.status).toBe(200);
    const slugs = r.body.products.map((p: any) => p.slug);
    expect(slugs).not.toContain(prodInParent.slug);
    expect(slugs).toContain(prodInChild.slug);
  });

  it("admin product listing with categoryId includes child products", async () => {
    const r = await request(app)
      .get(`/api/admin/products?categoryId=${parentCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    const ids = r.body.products.map((p: any) => p.id);
    expect(ids).toContain(prodInParent.id);
    expect(ids).toContain(prodInChild.id);
  });

  it("public categories endpoint excludes inactive categories", async () => {
    // Deactivate child category
    await request(app)
      .patch(`/api/admin/categories/${childCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });

    const r = await request(app).get("/api/products/categories/all");
    expect(r.status).toBe(200);

    // Check main electricals still appears
    const electricals = r.body.categories.find((c: any) => c.id === parentCat.id);
    expect(electricals).toBeDefined();
    // Child should not appear in children
    if (electricals.children) {
      const foundChild = electricals.children.find((c: any) => c.id === childCat.id);
      expect(foundChild).toBeUndefined();
    }

    // Reactivate
    await request(app)
      .patch(`/api/admin/categories/${childCat.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
  });
});
