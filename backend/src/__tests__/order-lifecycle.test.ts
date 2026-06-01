import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestCompany, createTestUserFast, cleanupTestData,
  generateToken, makeEmail, makeUnique,
} from "./helpers";

/* ─── Lightweight DB seeding ─────────────────────────────
   Uses createTestUserFast (no argon2 hashing) and parallel
   setup. Tests authenticate via JWT tokens, not passwords.
   ──────────────────────────────────────────────────────── */

let buyerUser: any, buyerCompany: any, buyerToken: string;
let supplierUser: any, supplierCompany: any, supplierToken: string;
let unrelatedUser: any, unrelatedToken: string;

/** Insert a minimal scout_request just to satisfy the FK on scout_quotes */
async function seedScoutRequest(companyId: string, userId: string) {
  const r = await query(
    `INSERT INTO scout_requests (company_id, created_by, title, quantity, status)
     VALUES ($1, $2, $3, 1, 'awarded') RETURNING id`,
    [companyId, userId, makeUnique("lc-req")]
  );
  return r.rows[0].id;
}

/** Seed an order + the scout_quote link in two INSERTs. Returns the order id. */
async function seedOrder(
  buyerId: string,
  supplierCompanyId: string,
  supplierUserId: string,
  scoutRequestId: string,
  status = "pending",
) {
  const orderNum = `SCT-TEST-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
  const orderResult = await query(
    `INSERT INTO orders
       (user_id, order_number, items, subtotal, tax, total,
        status, payment_status, payment_method, order_source, scout_request_id)
     VALUES ($1, $2, $3, 500, 0, 500, $4, 'unpaid', 'bank_transfer', 'scout', $5)
     RETURNING id, order_number`,
    [buyerId, orderNum, JSON.stringify([{ name: "Test Item", price: 50, quantity: 10 }]), status, scoutRequestId]
  );
  const orderId = orderResult.rows[0].id;

  // Link supplier via scout_quote with order_id set (mimics accepted quote)
  await query(
    `INSERT INTO scout_quotes
       (request_id, provider_company_id, submitted_by, quoted_price, status, order_id)
     VALUES ($1, $2, $3, 50, 'accepted', $4)`,
    [scoutRequestId, supplierCompanyId, supplierUserId, orderId]
  );

  return orderId;
}

beforeAll(async () => {
  // Batch: create all 3 companies in parallel
  const [bc, sc, uc] = await Promise.all([
    createTestCompany(makeUnique("lc-buyer")),
    createTestCompany(makeUnique("lc-supplier")),
    createTestCompany(makeUnique("lc-unrelated")),
  ]);
  buyerCompany = bc;
  supplierCompany = sc;

  // Set up supplier company flags + provider profile in parallel with user creation
  const [bu, su, uu] = await Promise.all([
    createTestUserFast({
      email: makeEmail(makeUnique("lc-buyer")),
      companyId: buyerCompany.id,
    }),
    createTestUserFast({
      email: makeEmail(makeUnique("lc-supplier")),
      companyId: supplierCompany.id,
    }),
    createTestUserFast({
      email: makeEmail(makeUnique("lc-unrelated")),
      companyId: uc.id,
    }),
    // Supplier company setup (no return value needed)
    query(
      `UPDATE companies SET is_provider = true, verification_status = 'approved', status = 'active' WHERE id = $1`,
      [sc.id]
    ),
    query(
      `INSERT INTO provider_profiles (company_id, display_name, provider_type)
       VALUES ($1, 'LC Supplier Display', 'supplier')
       ON CONFLICT (company_id) DO UPDATE SET display_name = 'LC Supplier Display'`,
      [sc.id]
    ),
  ]);
  buyerUser = bu;
  supplierUser = su;
  unrelatedUser = uu;

  buyerToken = generateToken(buyerUser.id, "customer");
  supplierToken = generateToken(supplierUser.id, "customer");
  unrelatedToken = generateToken(unrelatedUser.id, "customer");
}, 60_000);

afterAll(cleanupTestData);

/* ═══════════════════════════════════════════
   1. FULL FORWARD PATH  (pending → completed)
═══════════════════════════════════════════ */
describe("Supplier forward transitions", () => {
  let orderId: string;

  beforeAll(async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    orderId = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId);
  });

  it("pending → confirmed", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(200);
    expect(res.body.transition).toEqual({ from: "pending", to: "confirmed" });
  });

  it("confirmed → processing", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(200);
    expect(res.body.transition).toEqual({ from: "confirmed", to: "processing" });
  });

  it("processing → ready_or_shipped", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(200);
    expect(res.body.transition).toEqual({ from: "processing", to: "ready_or_shipped" });
  });

  it("ready_or_shipped → delivered", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(200);
    expect(res.body.transition).toEqual({ from: "ready_or_shipped", to: "delivered" });
  });

  it("cannot advance past delivered", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(400);
    expect(res.body.error).toMatch(/Cannot advance/);
  });
});

/* ═══════════════════════════════════════════
   2. BUYER COMPLETION
═══════════════════════════════════════════ */
describe("Buyer completion", () => {
  let orderId: string;

  beforeAll(async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    // Seed order already at "delivered" status
    orderId = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId, "delivered");
  });

  it("buyer marks delivered → completed", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "complete" })
      .expect(200);
    expect(res.body.transition).toEqual({ from: "delivered", to: "completed" });
  });

  it("completed order cannot be changed", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(400);
    expect(res.body.error).toMatch(/Completed orders/);
  });
});

/* ═══════════════════════════════════════════
   3. STATUS HISTORY
═══════════════════════════════════════════ */
describe("Status history", () => {
  let orderId: string;

  beforeAll(async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    orderId = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId);
    // Advance once
    await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" });
  });

  it("returns history timeline", async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/history`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .expect(200);
    expect(res.body.history.length).toBe(1);
    expect(res.body.history[0]).toMatchObject({
      from_status: "pending",
      to_status: "confirmed",
      role: "supplier",
    });
  });

  it("unrelated user cannot view history", async () => {
    await request(app)
      .get(`/api/orders/${orderId}/history`)
      .set("Authorization", `Bearer ${unrelatedToken}`)
      .expect(403);
  });
});

/* ═══════════════════════════════════════════
   4. UNAUTHORIZED ACCESS
═══════════════════════════════════════════ */
describe("Unauthorized access", () => {
  let orderId: string;

  beforeAll(async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    orderId = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId);
  });

  it("unrelated user cannot advance", async () => {
    await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${unrelatedToken}`)
      .send({ action: "advance" })
      .expect(403);
  });

  it("buyer cannot advance (only supplier can)", async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "advance" })
      .expect(403);
    expect(res.body.error).toMatch(/Only the supplier/);
  });
});

/* ═══════════════════════════════════════════
   5. CANCELLATION RULES
═══════════════════════════════════════════ */
describe("Cancellation rules", () => {
  it("cancel requires a reason", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId);
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "cancel" })
      .expect(400);
    expect(res.body.error).toMatch(/Reason is required/);
  });

  it("buyer can cancel pending order", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId);
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "cancel", note: "Changed requirements" })
      .expect(200);
    expect(res.body.order.status).toBe("cancelled");
  });

  it("buyer cannot cancel after supplier confirms", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId, "confirmed");
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "cancel", note: "Too late" })
      .expect(400);
    expect(res.body.error).toMatch(/Buyer can only cancel/);
  });

  it("supplier can cancel confirmed order", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId, "confirmed");
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "cancel", note: "Stock unavailable" })
      .expect(200);
    expect(res.body.order.status).toBe("cancelled");
  });

  it("cancelled order cannot be changed", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId, "cancelled");
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(400);
    expect(res.body.error).toMatch(/Cancelled orders/);
  });
});

/* ═══════════════════════════════════════════
   6. INVALID TRANSITIONS
═══════════════════════════════════════════ */
describe("Invalid transitions", () => {
  it("buyer cannot complete a pending order", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId);
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ action: "complete" })
      .expect(400);
    expect(res.body.error).toMatch(/must be in 'delivered' status/);
  });

  it("supplier cannot cancel after delivery", async () => {
    const reqId = await seedScoutRequest(buyerCompany.id, buyerUser.id);
    const oid = await seedOrder(buyerUser.id, supplierCompany.id, supplierUser.id, reqId, "delivered");
    const res = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "cancel", note: "Want to cancel" })
      .expect(400);
    expect(res.body.error).toMatch(/cannot cancel/i);
  });
});

/* ═══════════════════════════════════════════
   7. INTEGRATION: Scout flow → lifecycle compatible order
═══════════════════════════════════════════ */
describe("Scout → lifecycle integration", () => {
  it("Scout quote acceptance creates an order the lifecycle endpoint can manage", async () => {
    // Full HTTP flow (only test that does this)
    const scoutRes = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ title: makeUnique("integration"), quantity: 5, unit: "pcs" })
      .expect(201);
    const reqId = scoutRes.body.request.id;

    const quoteRes = await request(app)
      .post(`/api/scout/requests/${reqId}/quote`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ quotedPrice: 100 })
      .expect(201);

    const acceptRes = await request(app)
      .post(`/api/scout/requests/${reqId}/accept-quote/${quoteRes.body.quote.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .expect(201);

    const oid = acceptRes.body.order.id;
    expect(acceptRes.body.order.order_number).toMatch(/^SCT-/);

    // Now use lifecycle to advance it
    const lcRes = await request(app)
      .patch(`/api/orders/${oid}/lifecycle`)
      .set("Authorization", `Bearer ${supplierToken}`)
      .send({ action: "advance" })
      .expect(200);
    expect(lcRes.body.transition).toEqual({ from: "pending", to: "confirmed" });
  });
});
