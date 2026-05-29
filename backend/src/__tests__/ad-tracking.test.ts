import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import {
  createTestUser, createTestProduct, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let guestRfqPayload: any;
let testProductId: string;

beforeAll(async () => {
  // Verify columns exist on all 3 tables
  const tables = ["rfqs", "users", "orders"];
  for (const table of tables) {
    const cols = ["utm_source", "utm_campaign", "utm_medium"];
    if (table === "rfqs") cols.push("utm_term", "utm_content", "gclid", "fbclid", "referrer_url");
    if (table === "users") cols.push("referrer_url");
    if (table === "orders") cols.push("order_source");

    for (const col of cols) {
      const res = await query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
        [table, col]
      );
      if (res.rows.length === 0) {
        throw new Error(`Column ${col} missing on ${table} — run ad-tracking migration`);
      }
    }
  }

  // Create shared test product
  const prod = await createTestProduct({ name: makeUnique("ad-prod"), price: 5000 });
  testProductId = prod.id;
});

beforeEach(async () => {
  guestRfqPayload = {
    companyName: "Ad Test Company",
    contactName: "Ad Tester",
    email: makeEmail(`ad-guest-${Date.now()}`),
    phone: "+233501234567",
    address: "Accra, Ghana",
    productId: testProductId,
    productName: "Test Product",
    productSku: "AD-TEST-SKU",
    quantity: 2,
    message: "Test RFQ with tracking",
    utm_source: "google",
    utm_campaign: "spring_sale",
    utm_medium: "cpc",
    utm_term: "hvac+parts",
    utm_content: "skyscraper_banner",
    gclid: "EAIaIQobChMI",
    fbclid: "IwAR2x8",
    referrer_url: "https://google.com/search?q=hvac+parts",
  };
});

afterAll(async () => {
  await cleanupTestData();
  await pool.end();
});

describe("Ad Tracking — Guest RFQ stores UTM params", () => {
  it("stores all UTM fields on guest RFQ submission", async () => {
    const res = await request(app).post("/api/rfqs/guest").send(guestRfqPayload);
    expect(res.status).toBe(201);

    const rfqId = res.body.rfq.id;
    const stored = await query("SELECT * FROM rfqs WHERE id = $1", [rfqId]);
    expect(stored.rows[0].utm_source).toBe("google");
    expect(stored.rows[0].utm_campaign).toBe("spring_sale");
    expect(stored.rows[0].utm_medium).toBe("cpc");
    expect(stored.rows[0].utm_term).toBe("hvac+parts");
    expect(stored.rows[0].utm_content).toBe("skyscraper_banner");
    expect(stored.rows[0].gclid).toBe("EAIaIQobChMI");
    expect(stored.rows[0].fbclid).toBe("IwAR2x8");
    expect(stored.rows[0].referrer_url).toBe("https://google.com/search?q=hvac+parts");
  });

  it("accepts guest RFQ without UTM fields", async () => {
    const { utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url, ...payload } = guestRfqPayload;
    const res = await request(app).post("/api/rfqs/guest").send(payload);
    expect(res.status).toBe(201);
    expect(res.body.rfq.utm_source).toBeNull();
  });
});

describe("Ad Tracking — Registration stores UTM params", () => {
  it("stores UTM fields on registration", async () => {
    const uniqueSuffix = Date.now() + Math.random().toString(36).substring(2, 6);
    const email = makeEmail(`ad-reg-${uniqueSuffix}`);
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "TestPass123!",
      firstName: "Ad",
      lastName: "Register",
      companyName: makeUnique(`ad-reg-company-${uniqueSuffix}`),
      phone: "+233501234567",
      utm_source: "facebook",
      utm_campaign: "b2b_campaign",
      utm_medium: "social",
      referrer_url: "https://facebook.com/ad",
    });
    expect(res.status).toBe(201);

    const stored = await query("SELECT utm_source, utm_campaign, utm_medium, referrer_url FROM users WHERE email = $1", [email]);
    expect(stored.rows[0].utm_source).toBe("facebook");
    expect(stored.rows[0].utm_campaign).toBe("b2b_campaign");
    expect(stored.rows[0].utm_medium).toBe("social");
    expect(stored.rows[0].referrer_url).toBe("https://facebook.com/ad");
  });

  it("accepts registration without UTM fields", async () => {
    const uniqueSuffix = Date.now() + Math.random().toString(36).substring(2, 6);
    const email = makeEmail(`ad-reg-no-utm-${uniqueSuffix}`);
    const res = await request(app).post("/api/auth/register").send({
      email,
      password: "TestPass123!",
      firstName: "No",
      lastName: "Utm",
      companyName: makeUnique(`ad-reg-no-utm-co-${uniqueSuffix}`),
    });
    expect(res.status).toBe(201);
    const stored = await query("SELECT utm_source FROM users WHERE email = $1", [email]);
    expect(stored.rows[0].utm_source).toBeNull();
  });
});

describe("Ad Tracking — Order stores UTM params", () => {
  it("stores UTM fields and order_source on order creation", async () => {
    const uniqueSuffix = Date.now() + Math.random().toString(36).substring(2, 6);
    const user = await createTestUser({
      email: makeEmail(`ad-order-user-${uniqueSuffix}`), role: "customer",
      companyName: makeUnique(`ad-order-company-${uniqueSuffix}`),
      accountStatus: "active",
    });
    const token = generateToken(user.id, "customer");

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [{ productId: testProductId, name: "Test Item", price: 5000, quantity: 1 }],
        subtotal: 5000,
        tax: 0,
        total: 5000,
        paymentMethod: "bank_transfer",
        utm_source: "email",
        utm_campaign: "newsletter_q2",
        utm_medium: "email",
        order_source: "direct",
      });
    expect(res.status).toBe(201);

    const stored = await query("SELECT utm_source, utm_campaign, utm_medium, order_source FROM orders WHERE id = $1", [res.body.order.id]);
    expect(stored.rows[0].utm_source).toBe("email");
    expect(stored.rows[0].utm_campaign).toBe("newsletter_q2");
    expect(stored.rows[0].utm_medium).toBe("email");
    expect(stored.rows[0].order_source).toBe("direct");
  });
});
