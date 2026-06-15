import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import {
  createTestCategory,
  createTestCompany,
  createTestProduct,
  createTestUserFast,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

let adminToken: string;
let buyerToken: string;
let buyerUserId: string;
let buyerCompanyId: string;
let productSku: string;
const createdProductNames: string[] = [];

beforeAll(async () => {
  const company = await createTestCompany(makeUnique("spreadsheet-company"));
  buyerCompanyId = company.id;
  const buyer = await createTestUserFast({
    email: makeEmail(`spreadsheet-buyer-${Date.now()}`),
    companyId: company.id,
  });
  buyerUserId = buyer.id;
  buyerToken = generateToken(buyer.id, "customer");

  const admin = await createTestUserFast({
    email: makeEmail(`spreadsheet-admin-${Date.now()}`),
    role: "admin",
  });
  adminToken = generateToken(admin.id, "admin");

  const category = await createTestCategory(makeUnique("spreadsheet-category"));
  productSku = makeUnique("spreadsheet-sku");
  const product = await createTestProduct({
    name: makeUnique("spreadsheet-product"),
    categoryId: category.id,
    sku: productSku,
    price: 125,
  });
  await query(
    "INSERT INTO company_prices (company_id, product_id, price, min_quantity) VALUES ($1, $2, $3, 1)",
    [buyerCompanyId, product.id, 125]
  );
});

afterAll(async () => {
  await query("DELETE FROM quick_orders WHERE user_id = $1", [buyerUserId]).catch(() => {});
  await query("DELETE FROM orders WHERE user_id = $1", [buyerUserId]).catch(() => {});
  await query("DELETE FROM company_prices WHERE company_id = $1", [buyerCompanyId]).catch(() => {});
  for (const name of createdProductNames) {
    await query("DELETE FROM products WHERE name = $1", [name]).catch(() => {});
  }
  await query("DELETE FROM users WHERE email LIKE $1", ["test-qa-spreadsheet-%"]).catch(() => {});
  await query("DELETE FROM products WHERE sku LIKE $1", ["test-qa-spreadsheet-%"]).catch(() => {});
  await query("DELETE FROM categories WHERE name LIKE $1", ["test-qa-spreadsheet-%"]).catch(() => {});
  await query("DELETE FROM companies WHERE name LIKE $1", ["test-qa-spreadsheet-%"]).catch(() => {});
  await pool.end();
});

describe("spreadsheet upload endpoints", () => {
  test("admin imports products from bounded CSV input", async () => {
    const name = makeUnique("spreadsheet-imported");
    createdProductNames.push(name);
    const csv = [
      "name,sku,price,category",
      `${name},${makeUnique("spreadsheet-import-sku")},450,${makeUnique("spreadsheet-import-category")}`,
    ].join("\n");

    const response = await request(app)
      .post("/api/products/bulk-import")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), {
        filename: "products.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ total: 1, created: 1, skipped: 0 });
  });

  test("buyer creates a quick order from CSV", async () => {
    const response = await request(app)
      .post("/api/quick-order/csv")
      .set("Authorization", `Bearer ${buyerToken}`)
      .field("paymentMethod", "bank_transfer")
      .attach("file", Buffer.from(`sku,quantity\n${productSku},2\n`), {
        filename: "quick-order.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(201);
    expect(response.body.order.order_source).toBe("quick_order");
    expect(response.body.order.items[0]).toMatchObject({ quantity: 2 });
  });

  test("rejects legacy XLS uploads before parsing", async () => {
    const response = await request(app)
      .post("/api/products/bulk-import")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("name,price\nUnsafe,1"), {
        filename: "products.xls",
        contentType: "application/vnd.ms-excel",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/only CSV and XLSX/i);
  });
});
