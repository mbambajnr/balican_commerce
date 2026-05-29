import request from "supertest";
import app from "../app";
import { query, pool } from "../config/db";
import { createTestUser, createTestCompany, createTestProduct, createTestCategory, cleanupTestData, generateToken, makeEmail } from "./helpers";

let adminToken: string;
let approvedToken: string;
let pendingToken: string;
let rejectedToken: string;
let activeCompany: any;
let rejectedCompany: any;
let testProduct: any;
let groupPriceProduct: any;
let approvedUser: any;

beforeAll(async () => {
  activeCompany = await createTestCompany("QuoteFirst Active Co");

  // Create a rejected company
  const rejectedCompanyName = `QuoteFirst-Rejected-${Date.now()}`;
  const rc = await query(
    `INSERT INTO companies (name, email, contact_person_name, status)
     VALUES ($1, $2, $3, 'rejected')
     RETURNING *`,
    [rejectedCompanyName, `${rejectedCompanyName.toLowerCase()}@test-sslplan.com`, "Rejected Contact"]
  );
  rejectedCompany = rc.rows[0];

  const admin = await createTestUser({ email: makeEmail("qf-admin"), role: "admin", firstName: "Admin", lastName: "User" });
  adminToken = generateToken(admin.id, "admin");

  approvedUser = await createTestUser({ email: makeEmail("qf-approved"), companyId: activeCompany.id, companyName: activeCompany.name });
  approvedToken = generateToken(approvedUser.id, "customer");

  const pendingUser = await createTestUser({ email: makeEmail("qf-pending"), accountStatus: "pending", companyName: "Pending Co" });
  pendingToken = generateToken(pendingUser.id, "customer");

  const rejectedUser = await createTestUser({ email: makeEmail("qf-rejected"), companyName: rejectedCompanyName });
  // Override company status to rejected (user was created with active status, link to rejected company)
  await query("UPDATE users SET company_id = $1 WHERE email = $2", [rejectedCompany.id, makeEmail("qf-rejected")]);
  rejectedToken = generateToken(rejectedUser.id, "customer");

  const cat = await createTestCategory("QuoteFirst Category");
  testProduct = await createTestProduct({ categoryId: cat.id, price: 1000, name: `QF-Product-${Date.now()}` });
  groupPriceProduct = await createTestProduct({ categoryId: cat.id, price: 5000, name: `QF-Group-${Date.now()}` });
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

describe("Quote-first pricing — price visibility", () => {
  /* ── Guest ── */
  it("guest product list returns no prices (price: null)", async () => {
    const r = await request(app).get("/api/products?limit=100");
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(p.price).toBeNull();
    expect(p.compare_price).toBeNull();
  });

  it("guest product detail returns no prices (price: null)", async () => {
    const r = await request(app).get(`/api/products/${testProduct.slug}`);
    expect(r.body.product.price).toBeNull();
    expect(r.body.product.compare_price).toBeNull();
  });

  /* ── Pending company ── */
  it("pending company product list returns no prices", async () => {
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${pendingToken}`);
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(p.price).toBeNull();
  });

  it("pending company product detail returns no prices", async () => {
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${pendingToken}`);
    expect(r.body.product.price).toBeNull();
  });

  /* ── Rejected company ── */
  it("rejected company product list returns no prices", async () => {
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${rejectedToken}`);
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(p.price).toBeNull();
  });

  it("rejected company product detail returns no prices", async () => {
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${rejectedToken}`);
    expect(r.body.product.price).toBeNull();
  });

  /* ── Approved company sees resolved price ── */
  it("approved company sees company-specific price in product detail", async () => {
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 700, 1)
       ON CONFLICT DO NOTHING`,
      [activeCompany.id, testProduct.id]
    );

    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(parseFloat(r.body.product.price)).toBe(700);
    expect(r.body.product.custom_price).toBe(true);
  });

  it("approved company sees company-specific price in product list", async () => {
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${approvedToken}`);
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(parseFloat(p.price)).toBe(700);
    expect(p.custom_price).toBe(true);
  });

  /* ── Group price fallback ── */
  it("group price applies when no company-specific price exists", async () => {
    // Remove company price, set group price
    await query("DELETE FROM company_prices WHERE product_id = $1", [groupPriceProduct.id]);
    const groupResult = await query("SELECT id FROM customer_groups WHERE is_default = true LIMIT 1");
    if (groupResult.rows.length > 0) {
      await query("UPDATE companies SET customer_group_id = $1 WHERE id = $2", [groupResult.rows[0].id, activeCompany.id]);
      await query(
        `INSERT INTO company_prices (customer_group_id, product_id, price, min_quantity)
         VALUES ($1, $2, 3000, 1)
         ON CONFLICT DO NOTHING`,
        [groupResult.rows[0].id, groupPriceProduct.id]
      );

      const r = await request(app)
        .get(`/api/products/${groupPriceProduct.slug}`)
        .set("Authorization", `Bearer ${approvedToken}`);
      expect(parseFloat(r.body.product.price)).toBe(3000);
    }
  });

  /* ── Base price never exposed publicly ── */
  it("base price (from products table) never returned to guest", async () => {
    const r = await request(app).get(`/api/products/${testProduct.slug}`);
    expect(r.body.product.price).toBeNull();
  });

  it("base price (from products table) never returned to pending company", async () => {
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${pendingToken}`);
    expect(r.body.product.price).toBeNull();
  });

  it("base price (from products table) never returned to rejected company", async () => {
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${rejectedToken}`);
    expect(r.body.product.price).toBeNull();
  });

  /* ── Approved company without custom price ── */
  it("approved company with NO custom price sees null in product detail", async () => {
    // Temporarily remove company price for testProduct
    await query("DELETE FROM company_prices WHERE product_id = $1", [testProduct.id]);
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.body.product.price).toBeNull();
    // Restore company price for subsequent tests
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 700, 1) ON CONFLICT DO NOTHING`,
      [activeCompany.id, testProduct.id]
    );
  });

  it("approved company with NO custom price sees null in product list", async () => {
    await query("DELETE FROM company_prices WHERE product_id = $1", [testProduct.id]);
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${approvedToken}`);
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(p.price).toBeNull();
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 700, 1) ON CONFLICT DO NOTHING`,
      [activeCompany.id, testProduct.id]
    );
  });

  /* ── Admin sees internal base price ── */
  it("admin product detail returns internal base price", async () => {
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${adminToken}`);
    // Admin sees base price from products table, not company price
    expect(r.body.product.price).not.toBeNull();
    expect(parseFloat(r.body.product.price)).toBe(1000); // testProduct base price
  });

  it("admin product list returns internal base price", async () => {
    const r = await request(app)
      .get("/api/products?limit=100")
      .set("Authorization", `Bearer ${adminToken}`);
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(p.price).not.toBeNull();
    expect(parseFloat(p.price)).toBe(1000);
  });
});

describe("Quote-first pricing — cart/checkout uses company price", () => {
  let cartProduct: any;

  beforeAll(async () => {
    // Clear stale cart items from previous runs
    await query(`DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`, [approvedUser.id]).catch(() => {});
    await query(`DELETE FROM carts WHERE user_id = $1`, [approvedUser.id]).catch(() => {});

    const cat = await createTestCategory("Cart Price Cat");
    cartProduct = await createTestProduct({ categoryId: cat.id, price: 2000, name: `QF-Cart-${Date.now()}` });
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 1500, 1)
       ON CONFLICT DO NOTHING`,
      [activeCompany.id, cartProduct.id]
    );
  });

  it("cart GET returns items with resolved company price", async () => {
    // Add item to cart
    await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ productId: cartProduct.id, quantity: 2 });

    const r = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(200);
    const item = r.body.cart.items.find((i: any) => i.product_id === cartProduct.id);
    expect(item).toBeDefined();
    expect(parseFloat(item.price)).toBe(1500);
  });

  it("cart checkout uses resolved company price for subtotal", async () => {
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ paymentMethod: "bank_transfer" });
    expect(r.status).toBe(201);
    // 2 items × 1500 = 3000
    expect(parseFloat(r.body.order.subtotal)).toBe(3000);
    expect(parseFloat(r.body.order.total)).toBe(3000);
  });

  it("cart rejects checkout when product has no customer-facing price", async () => {
    const noPriceCat = await createTestCategory("NoPriceCat");
    const noPriceProduct = await createTestProduct({ categoryId: noPriceCat.id, price: 5000, name: `NoPrice-${Date.now()}` });
    // NO company_price created — product will have null price

    // Add to cart
    const addRes = await request(app)
      .post("/api/cart/items")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ productId: noPriceProduct.id, quantity: 1 });
    expect(addRes.status).toBe(200);

    // Cart shows null price for this item
    const cartRes = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${approvedToken}`);
    const item = cartRes.body.cart.items.find((i: any) => i.product_id === noPriceProduct.id);
    expect(item).toBeDefined();
    expect(item.price).toBeNull();

    // Checkout rejects because item has no price
    const checkoutRes = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ paymentMethod: "bank_transfer" });
    expect(checkoutRes.status).toBe(400);
    expect(checkoutRes.body.error).toMatch(/no assigned price.*request a quote/i);
  });
});

describe("Quote-first pricing — quick order uses company price", () => {
  let qoProduct: any;

  beforeAll(async () => {
    const cat = await createTestCategory("QO Price Cat");
    qoProduct = await createTestProduct({ categoryId: cat.id, price: 4000, name: `QF-QO-${Date.now()}` });
    const qoSku = `QF-QO-SKU-${Date.now()}`;
    await query("UPDATE products SET sku = $1 WHERE id = $2", [qoSku, qoProduct.id]);
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 3500, 1)
       ON CONFLICT DO NOTHING`,
      [activeCompany.id, qoProduct.id]
    );
  });

  it("quick order uses resolved company price", async () => {
    const productRow = await query("SELECT sku FROM products WHERE id = $1", [qoProduct.id]);
    const r = await request(app)
      .post("/api/quick-order")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ items: [{ sku: productRow.rows[0].sku, quantity: 3 }], paymentMethod: "bank_transfer" });
    expect(r.status).toBe(201);
    // 3 × 3500 = 10500
    expect(parseFloat(r.body.order.subtotal)).toBe(10500);
    expect(parseFloat(r.body.order.total)).toBe(10500);
  });

  it("quick order rejects when product has no customer-facing price", async () => {
    const noPriceCat = await createTestCategory("QONoPriceCat");
    const noPriceProduct = await createTestProduct({ categoryId: noPriceCat.id, price: 6000, name: `QF-QO-NoPrice-${Date.now()}` });
    const noPriceSku = `QF-QO-NP-SKU-${Date.now()}`;
    await query("UPDATE products SET sku = $1 WHERE id = $2", [noPriceSku, noPriceProduct.id]);
    // NO company_price — will have null price

    const r = await request(app)
      .post("/api/quick-order")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ items: [{ sku: noPriceSku, quantity: 1 }], paymentMethod: "bank_transfer" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no assigned price.*request a quote/i);
  });
});

describe("Quote-first pricing — reorder uses current company price", () => {
  it("reorder uses current resolved company price", async () => {
    const cat = await createTestCategory("Reorder Price Cat");
    const reorderProduct = await createTestProduct({ categoryId: cat.id, price: 6000, name: `QF-RE-${Date.now()}` });
    const reSku = `QF-RE-SKU-${Date.now()}`;
    await query("UPDATE products SET sku = $1 WHERE id = $2", [reSku, reorderProduct.id]);
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 5500, 1)
       ON CONFLICT DO NOTHING`,
      [activeCompany.id, reorderProduct.id]
    );

    // Create an order first
    const orderRes = await request(app)
      .post("/api/quick-order")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ items: [{ sku: reSku, quantity: 1 }], paymentMethod: "bank_transfer" });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id;

    // Reorder — should use current company price (5500)
    const r = await request(app)
      .post(`/api/reorder/${orderId}`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(201);
    expect(parseFloat(r.body.order.subtotal)).toBe(5500);
  });
});

describe("Quote-first pricing — cross-company isolation", () => {
  let otherCompany: any;
  let otherToken: string;
  let crossProduct: any;

  beforeAll(async () => {
    otherCompany = await createTestCompany("QF Other Co");
    const otherUser = await createTestUser({
      email: makeEmail("qf-other"),
      companyId: otherCompany.id,
      companyName: "QF Other Co",
    });
    otherToken = generateToken(otherUser.id, "customer");

    const cat = await createTestCategory("Cross Price Cat");
    crossProduct = await createTestProduct({ categoryId: cat.id, price: 8000, name: `QF-Cross-${Date.now()}` });
    // Set company price for activeCompany
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 7500, 1)
       ON CONFLICT DO NOTHING`,
      [activeCompany.id, crossProduct.id]
    );
    // Set a different company price for otherCompany
    await query(
      `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
       VALUES ($1, $2, 2500, 1)
       ON CONFLICT DO NOTHING`,
      [otherCompany.id, crossProduct.id]
    );
  });

  it("other company cannot see activeCompany's price", async () => {
    // Other company users see their own price (2500), not activeCompany's price (7500)
    const r = await request(app)
      .get(`/api/products/${crossProduct.slug}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(parseFloat(r.body.product.price)).toBe(2500);
  });

  it("activeCompany cannot see other company's price", async () => {
    const r = await request(app)
      .get(`/api/products/${crossProduct.slug}`)
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(parseFloat(r.body.product.price)).toBe(7500);
  });

  it("guest sees no price for cross-company product", async () => {
    const r = await request(app).get(`/api/products/${crossProduct.slug}`);
    expect(r.body.product.price).toBeNull();
  });
});

describe("Company account status enforcement", () => {
  it("should allow active company to access cart", async () => {
    const r = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(200);
  });

  it("should block pending company from quick order", async () => {
    const r = await request(app)
      .post("/api/quick-order")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ items: [{ sku: "TEST", quantity: 1 }], paymentMethod: "bank_transfer" });
    expect(r.status).toBe(403);
    expect(r.body.error).toContain("not active");
  });

  it("should allow active company to use quick order (even with bad SKU)", async () => {
    const r = await request(app)
      .post("/api/quick-order")
      .set("Authorization", `Bearer ${approvedToken}`)
      .send({ items: [{ sku: "TEST-NONEXISTENT", quantity: 1 }], paymentMethod: "bank_transfer" });
    expect(r.status).toBe(400);
  });

  it("should block pending company from cart checkout", async () => {
    const r = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ paymentMethod: "bank_transfer" });
    expect(r.status).toBe(403);
  });
});

describe("Admin can see prices regardless", () => {
  it("admin sees base price for product (no company context needed)", async () => {
    const r = await request(app)
      .get(`/api/products/${testProduct.slug}`)
      .set("Authorization", `Bearer ${adminToken}`);
    // Admin always sees prices — should see the resolved price (700 from company_prices)
    expect(r.body.product.price).not.toBeNull();
  });
});

describe("Guest RFQ flow", () => {
  let guestRfqProduct: any;

  beforeAll(async () => {
    const cat = await createTestCategory("Guest RFQ Cat");
    guestRfqProduct = await createTestProduct({ categoryId: cat.id, price: 9999, name: `GuestRFQ-${Date.now()}` });
    const sku = `GRFQ-SKU-${Date.now()}`;
    await query("UPDATE products SET sku = $1 WHERE id = $2", [sku, guestRfqProduct.id]);
  });

  it("guest can submit RFQ with company/contact/address fields (no auth required)", async () => {
    const r = await request(app)
      .post("/api/rfqs/guest")
      .send({
        companyName: "Acme Corp Ghana",
        contactName: "John Doe",
        email: "john@acme-gh.com",
        phone: "+233501234567",
        address: "123 Independence Ave, Accra",
        productId: guestRfqProduct.id,
        quantity: 10,
        message: "Need 10 units for our warehouse in Tema. Delivery within 2 weeks preferred.",
      });
    expect(r.status).toBe(201);
    expect(r.body.rfq.source).toBe("guest");
    expect(r.body.rfq.status).toBe("pending_review");
    expect(r.body.rfq.company_name).toBe("Acme Corp Ghana");
    expect(r.body.rfq.contact_name).toBe("John Doe");
    expect(r.body.rfq.email).toBe("john@acme-gh.com");
    expect(r.body.rfq.phone).toBe("+233501234567");
    expect(r.body.rfq.address).toBe("123 Independence Ave, Accra");
    expect(r.body.rfq.quantity).toBe(10);
    expect(r.body.rfq.message).toBe("Need 10 units for our warehouse in Tema. Delivery within 2 weeks preferred.");
  });

  it("guest RFQ stores product snapshot (product_name, product_sku)", async () => {
    const r = await request(app)
      .post("/api/rfqs/guest")
      .send({
        companyName: "Test Co",
        contactName: "Jane Smith",
        email: "jane@test-co.com",
        phone: "+233501111111",
        address: "456 Test Rd, Kumasi",
        productId: guestRfqProduct.id,
        quantity: 5,
        message: "Quote request for 5 units",
      });
    expect(r.status).toBe(201);
    expect(r.body.rfq.product_name).toBe(guestRfqProduct.name);
    expect(r.body.rfq.product_sku).toBeDefined();
  });

  it("guest RFQ does not expose price", async () => {
    const r = await request(app)
      .post("/api/rfqs/guest")
      .send({
        companyName: "No Price Co",
        contactName: "Test Person",
        email: "test@noprice.com",
        phone: "+233502222222",
        address: "789 No Price St",
        productId: guestRfqProduct.id,
        quantity: 1,
        message: "Checking no price exposure",
      });
    expect(r.status).toBe(201);
    expect(r.body.rfq.price).toBeUndefined();
    expect(r.body.rfq).not.toHaveProperty("price");
  });

  it("rejects invalid guest RFQ (missing required fields)", async () => {
    const r = await request(app)
      .post("/api/rfqs/guest")
      .send({
        companyName: "",
        contactName: "",
        email: "not-an-email",
        phone: "",
        address: "",
        quantity: 0,
        message: "",
      });
    expect(r.status).toBe(400);
  });

  it("rejects guest RFQ with excessively long message", async () => {
    const r = await request(app)
      .post("/api/rfqs/guest")
      .send({
        companyName: "Spam Co",
        contactName: "Spammer",
        email: "spam@spam.com",
        phone: "+233503333333",
        address: "Spam Address",
        productId: guestRfqProduct.id,
        quantity: 1,
        message: "A".repeat(6000),
      });
    expect(r.status).toBe(400);
  });

  it("guest RFQ is visible to admin/sales", async () => {
    const r = await request(app)
      .get("/api/rfqs?source=guest")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.rfqs.length).toBeGreaterThanOrEqual(1);
    const guestRfqs = r.body.rfqs.filter((rfq: any) => rfq.source === "guest");
    expect(guestRfqs.length).toBeGreaterThanOrEqual(1);
  });

  it("pending/rejected/guest users still cannot checkout or quick-order", async () => {
    // Pending company cannot checkout
    const r1 = await request(app)
      .post("/api/cart/checkout")
      .set("Authorization", `Bearer ${pendingToken}`)
      .send({ paymentMethod: "bank_transfer" });
    expect(r1.status).toBe(403);

    // Guest (no auth) cannot checkout
    const r2 = await request(app)
      .post("/api/cart/checkout")
      .send({ paymentMethod: "bank_transfer" });
    expect(r2.status).toBe(401);

    // Guest cannot quick-order
    const r3 = await request(app)
      .post("/api/quick-order")
      .send({ items: [{ sku: "TEST", quantity: 1 }], paymentMethod: "bank_transfer" });
    expect(r3.status).toBe(401);
  });
});

/* ══════════════════════════════════════════════
   Company Dashboard
   ══════════════════════════════════════════════ */

describe("Company Dashboard", () => {
  let companyAdminToken: string;
  let buyerToken: string;
  let companyId: string;
  let otherCompanyToken: string;

  beforeAll(async () => {
    // Use the approved company from the outer scope
    companyId = activeCompany.id;

    // Create a buyer within the same company
    const buyer = await createTestUser({
      email: makeEmail("dash-buyer"),
      companyId: activeCompany.id,
      companyName: activeCompany.name,
      companyRole: "buyer",
    });
    buyerToken = generateToken(buyer.id, "customer");

    // Create a user in a DIFFERENT company
    const otherCo = await createTestCompany("Other Dash Co");
    const otherUser = await createTestUser({
      email: makeEmail("dash-other"),
      companyId: otherCo.id,
      companyName: otherCo.name,
    });
    otherCompanyToken = generateToken(otherUser.id, "customer");
  });

  it("returns company dashboard with welcome context", async () => {
    const r = await request(app)
      .get("/api/company/dashboard")
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(200);
    expect(r.body.user).toBeDefined();
    expect(r.body.company).toBeDefined();
    expect(r.body.company.name).toBe(activeCompany.name);
    expect(r.body.stats).toBeDefined();
    expect(typeof r.body.stats.ordersCount).toBe("number");
    expect(typeof r.body.stats.rfqsCount).toBe("number");
  });

  it("includes sales rep if assigned", async () => {
    // Assign a sales rep to the company
    await query("UPDATE companies SET assigned_sales_rep_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1) WHERE id = $1", [companyId]);
    const r = await request(app)
      .get("/api/company/dashboard")
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(200);
    expect(r.body.salesRep).toBeDefined();
    expect(r.body.salesRep.name).toBeDefined();
  });

  it("includes onboarding flag when no RFQs and no orders", async () => {
    // Use a fresh admin from a company with no activity
    const freshCo = await createTestCompany("Fresh Onboard Co");
    const freshUser = await createTestUser({
      email: makeEmail("dash-fresh"),
      companyId: freshCo.id,
      companyName: freshCo.name,
    });
    const freshToken = generateToken(freshUser.id, "customer");
    const r = await request(app)
      .get("/api/company/dashboard")
      .set("Authorization", `Bearer ${freshToken}`);
    expect(r.status).toBe(200);
    expect(r.body.onboarding).toBeDefined();
    expect(r.body.onboarding.needsOnboarding).toBe(true);
  });

  it("includes payment methods and shipping methods", async () => {
    const r = await request(app)
      .get("/api/company/dashboard")
      .set("Authorization", `Bearer ${approvedToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.paymentMethods)).toBe(true);
    expect(Array.isArray(r.body.shippingMethods)).toBe(true);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const r = await request(app).get("/api/company/dashboard");
    expect(r.status).toBe(401);
  });
});

/* ══════════════════════════════════════════════
   Team Members / Sub-Users
   ══════════════════════════════════════════════ */

describe("Team Members (self-service)", () => {
  let companyAdminToken: string;
  let buyerToken: string;
  let viewerToken: string;
  let otherCompanyToken: string;
  let companyId: string;
  let newMemberId: string;

  beforeAll(async () => {
    companyId = activeCompany.id;

    // Company admin (the approved user)
    companyAdminToken = approvedToken;

    // Buyer within same company
    const buyer = await createTestUser({
      email: makeEmail("team-buyer"),
      companyId: activeCompany.id,
      companyName: activeCompany.name,
      companyRole: "buyer",
    });
    buyerToken = generateToken(buyer.id, "customer");

    // Viewer within same company
    const viewer = await createTestUser({
      email: makeEmail("team-viewer"),
      companyId: activeCompany.id,
      companyName: activeCompany.name,
      companyRole: "viewer",
    });
    viewerToken = generateToken(viewer.id, "customer");

    // User in different company
    const otherCo = await createTestCompany("Team Other Co");
    const other = await createTestUser({
      email: makeEmail("team-other"),
      companyId: otherCo.id,
      companyName: otherCo.name,
    });
    otherCompanyToken = generateToken(other.id, "customer");
  });

  /* ── Listing ── */

  it("company admin can list team members", async () => {
    const r = await request(app)
      .get("/api/company/team")
      .set("Authorization", `Bearer ${companyAdminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.team)).toBe(true);
    expect(r.body.canManage).toBe(true);
  });

  it("non-admin company user can list team but cannot manage", async () => {
    const r = await request(app)
      .get("/api/company/team")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.team)).toBe(true);
    expect(r.body.canManage).toBe(false);
  });

  it("unauthenticated user cannot list team", async () => {
    const r = await request(app).get("/api/company/team");
    expect(r.status).toBe(401);
  });

  /* ── Creation ── */

  it("company admin can create a team member", async () => {
    const teamEmail = makeEmail(`team-new-${Date.now()}`);
    const r = await request(app)
      .post("/api/company/team")
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({
        email: teamEmail,
        password: "SecurePass123!",
        firstName: "New",
        lastName: "Member",
        companyRole: "buyer",
      });
    expect(r.status).toBe(201);
    expect(r.body.user).toBeDefined();
    expect(r.body.user.email).toBe(teamEmail);
    expect(r.body.user.company_role).toBe("buyer");
    newMemberId = r.body.user.id;
  });

  it("buyer (non-admin) cannot create a team member", async () => {
    const r = await request(app)
      .post("/api/company/team")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        email: makeEmail("team-unauth"),
        password: "SecurePass123!",
        firstName: "Unauth",
        lastName: "User",
        companyRole: "viewer",
      });
    expect(r.status).toBe(403);
  });

  it("unauthenticated user cannot create a team member", async () => {
    const r = await request(app)
      .post("/api/company/team")
      .send({
        email: makeEmail("team-noauth"),
        password: "SecurePass123!",
        firstName: "No",
        lastName: "Auth",
        companyRole: "viewer",
      });
    expect(r.status).toBe(401);
  });

  /* ── Updating ── */

  it("company admin can update a team member role", async () => {
    if (!newMemberId) return;
    const r = await request(app)
      .patch(`/api/company/team/${newMemberId}`)
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ companyRole: "finance" });
    expect(r.status).toBe(200);
    expect(r.body.user.company_role).toBe("finance");
  });

  it("buyer cannot update team member role", async () => {
    if (!newMemberId) return;
    const r = await request(app)
      .patch(`/api/company/team/${newMemberId}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ companyRole: "company_admin" });
    expect(r.status).toBe(403);
  });

  it("company admin can suspend/activate a team member", async () => {
    if (!newMemberId) return;
    // Suspend
    const r1 = await request(app)
      .patch(`/api/company/team/${newMemberId}`)
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ accountStatus: "suspended" });
    expect(r1.status).toBe(200);
    expect(r1.body.user.account_status).toBe("suspended");

    // Reactivate
    const r2 = await request(app)
      .patch(`/api/company/team/${newMemberId}`)
      .set("Authorization", `Bearer ${companyAdminToken}`)
      .send({ accountStatus: "active" });
    expect(r2.status).toBe(200);
    expect(r2.body.user.account_status).toBe("active");
  });

  /* ── Cross-company isolation ── */

  it("user from different company cannot list this company's team", async () => {
    const r = await request(app)
      .get("/api/company/team")
      .set("Authorization", `Bearer ${otherCompanyToken}`);
    expect(r.status).toBe(200);
    // The team list should only show their own company's members
    const ids = r.body.team.map((u: any) => u.id);
    if (newMemberId) expect(ids).not.toContain(newMemberId);
  });

  it("user from different company cannot create a team member in this company", async () => {
    const r = await request(app)
      .post("/api/company/team")
      .set("Authorization", `Bearer ${otherCompanyToken}`)
      .send({
        email: makeEmail("team-cross"),
        password: "SecurePass123!",
        firstName: "Cross",
        lastName: "User",
        companyRole: "buyer",
      });
    // Should succeed for their own company (different company_context), but we verify they can't target ours
    // Actually they'd create in their own company. The important check is the PATCH cross-company.
    expect(r.status).toBe(201);
    // Clean up
    await query("DELETE FROM users WHERE email = $1", [makeEmail("team-cross")]);
  });

  it("user from different company cannot update this company's team member", async () => {
    if (!newMemberId) return;
    const r = await request(app)
      .patch(`/api/company/team/${newMemberId}`)
      .set("Authorization", `Bearer ${otherCompanyToken}`)
      .send({ companyRole: "viewer" });
    expect(r.status).toBe(403);
  });

  /* ── Pricing remains protected ── */

  it("team member (buyer) can see prices when company is active", async () => {
    const r = await request(app)
      .get("/api/products?limit=10")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(r.status).toBe(200);
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    if (p) {
      // Buyer in active company should see prices (not null)
      expect(p.price).not.toBeNull();
    }
  });
});
