import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany, cleanupTestData,
  generateToken, makeEmail, makeUnique,
} from "./helpers";

/* ── Test fixture builders ── */

const makeCustomer = async (label: string) => {
  const company = await createTestCompany(makeUnique(label));
  const user = await createTestUser({
    email: makeEmail(makeUnique(label)),
    companyId: company.id,
    role: "customer",
    companyRole: "company_admin",
    accountStatus: "active",
  });
  const token = generateToken(user.id, "customer");
  return { company, user, token };
};

const makeProvider = async (label: string) => {
  const company = await createTestCompany(makeUnique(label));
  await query(
    `UPDATE companies
     SET is_provider = true, company_type = 'supplier',
         verification_status = 'approved', status = 'active'
     WHERE id = $1`,
    [company.id]
  );
  await query(
    `INSERT INTO provider_profiles (company_id, display_name, provider_type)
     VALUES ($1, $2, 'supplier')
     ON CONFLICT (company_id) DO UPDATE SET display_name = $2`,
    [company.id, `${label} Display`]
  );
  const user = await createTestUser({
    email: makeEmail(makeUnique(label)),
    companyId: company.id,
    role: "customer",
    companyRole: "company_admin",
    accountStatus: "active",
  });
  const token = generateToken(user.id, "customer");
  return { company, user, token };
};

const BASE_REQUEST = {
  title: "Test Scout Request",
  description: "Need 50 units of industrial cable",
  quantity: 50,
  unit: "metres",
  deliveryLocation: "Accra",
  desiredDeliveryDate: "2026-12-01",
  budgetMin: 500,
  budgetMax: 2000,
  notes: "Urgent",
};

afterAll(cleanupTestData);

/* ═══════════════════════════════════════════
   1. CREATE SCOUT REQUEST
═══════════════════════════════════════════ */
describe("POST /api/scout/requests", () => {
  let customer: Awaited<ReturnType<typeof makeCustomer>>;

  beforeAll(async () => { customer = await makeCustomer("scout-create"); });

  test("customer creates a Scout request — 201", async () => {
    const res = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(BASE_REQUEST)
      .expect(201);

    expect(res.body.request).toMatchObject({
      title: BASE_REQUEST.title,
      status: "open",
      company_id: customer.company.id,
    });
    expect(Number(res.body.request.quantity)).toBe(50);
  });

  test("rejects unauthenticated request — 401", async () => {
    await request(app).post("/api/scout/requests").send(BASE_REQUEST).expect(401);
  });

  test("rejects request without title — 400", async () => {
    const res = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "" })
      .expect(400);
    expect(res.body.error).toBeDefined();
  });

  test("rejects invalid quantity — 400", async () => {
    await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, quantity: -1 })
      .expect(400);
  });
});

/* ═══════════════════════════════════════════
   2. LIST & GET SCOUT REQUESTS (customer)
═══════════════════════════════════════════ */
describe("GET /api/scout/requests", () => {
  let customer: Awaited<ReturnType<typeof makeCustomer>>;
  let otherCustomer: Awaited<ReturnType<typeof makeCustomer>>;
  let requestId: string;

  beforeAll(async () => {
    customer = await makeCustomer("scout-list");
    otherCustomer = await makeCustomer("scout-list-other");

    const res = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "List Test Request" });
    requestId = res.body.request.id;
  });

  test("customer sees only their own requests", async () => {
    const res = await request(app)
      .get("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);

    expect(res.body.requests.some((r: any) => r.id === requestId)).toBe(true);
  });

  test("other customer does not see the request", async () => {
    const res = await request(app)
      .get("/api/scout/requests")
      .set("Authorization", `Bearer ${otherCustomer.token}`)
      .expect(200);

    expect(res.body.requests.some((r: any) => r.id === requestId)).toBe(false);
  });

  test("GET /api/scout/requests/:id returns request with empty quotes", async () => {
    const res = await request(app)
      .get(`/api/scout/requests/${requestId}`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);

    expect(res.body.request.id).toBe(requestId);
    expect(Array.isArray(res.body.quotes)).toBe(true);
  });

  test("GET request by other customer returns 404", async () => {
    await request(app)
      .get(`/api/scout/requests/${requestId}`)
      .set("Authorization", `Bearer ${otherCustomer.token}`)
      .expect(404);
  });

  test("unauthenticated list returns 401", async () => {
    await request(app).get("/api/scout/requests").expect(401);
  });
});

/* ═══════════════════════════════════════════
   3. CANCEL SCOUT REQUEST
═══════════════════════════════════════════ */
describe("PATCH /api/scout/requests/:id/cancel", () => {
  let customer: Awaited<ReturnType<typeof makeCustomer>>;
  let requestId: string;

  beforeAll(async () => {
    customer = await makeCustomer("scout-cancel");
    const res = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "Cancel Test" });
    requestId = res.body.request.id;
  });

  test("customer can cancel their own open request", async () => {
    await request(app)
      .patch(`/api/scout/requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);

    const check = await query("SELECT status FROM scout_requests WHERE id = $1", [requestId]);
    expect(check.rows[0].status).toBe("cancelled");
  });

  test("cannot cancel an already-cancelled request — 400", async () => {
    await request(app)
      .patch(`/api/scout/requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(400);
  });
});

/* ═══════════════════════════════════════════
   4. SUPPLIER: LIST AVAILABLE REQUESTS
═══════════════════════════════════════════ */
describe("GET /api/scout/available", () => {
  let provider: Awaited<ReturnType<typeof makeProvider>>;
  let customer: Awaited<ReturnType<typeof makeCustomer>>;
  let openRequestId: string;

  beforeAll(async () => {
    provider = await makeProvider("scout-avail-prov");
    customer = await makeCustomer("scout-avail-cust");
    const res = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "Available Test Open" });
    openRequestId = res.body.request.id;
  });

  test("verified provider can list available open requests", async () => {
    const res = await request(app)
      .get("/api/scout/available")
      .set("Authorization", `Bearer ${provider.token}`)
      .expect(200);

    expect(res.body.requests.some((r: any) => r.id === openRequestId)).toBe(true);
  });

  test("cancelled request is not in available list", async () => {
    // Cancel it first
    await request(app)
      .patch(`/api/scout/requests/${openRequestId}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);

    const res = await request(app)
      .get("/api/scout/available")
      .set("Authorization", `Bearer ${provider.token}`)
      .expect(200);

    expect(res.body.requests.some((r: any) => r.id === openRequestId)).toBe(false);
  });

  test("non-provider customer cannot access available list — 403", async () => {
    await request(app)
      .get("/api/scout/available")
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(403);
  });

  test("unauthenticated returns 401", async () => {
    await request(app).get("/api/scout/available").expect(401);
  });
});

/* ═══════════════════════════════════════════
   5. SUBMIT QUOTE
═══════════════════════════════════════════ */
describe("POST /api/scout/requests/:id/quote", () => {
  let provider: Awaited<ReturnType<typeof makeProvider>>;
  let provider2: Awaited<ReturnType<typeof makeProvider>>;
  let customer: Awaited<ReturnType<typeof makeCustomer>>;
  let requestId: string;

  beforeAll(async () => {
    provider = await makeProvider("scout-quote-prov1");
    provider2 = await makeProvider("scout-quote-prov2");
    customer = await makeCustomer("scout-quote-cust");
    const res = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "Quote Submit Test" });
    requestId = res.body.request.id;
  });

  test("provider submits a quote — 201", async () => {
    const res = await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider.token}`)
      .send({
        quotedPrice: 120,
        deliveryDate: "2026-11-15",
        paymentTerms: "50% upfront",
        notes: "Can deliver in 2 weeks",
      })
      .expect(201);

    expect(res.body.quote).toMatchObject({
      request_id: requestId,
      provider_company_id: provider.company.id,
      status: "pending",
    });
    expect(Number(res.body.quote.quoted_price)).toBe(120);
  });

  test("provider can update their quote (upsert) — 201", async () => {
    const res = await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider.token}`)
      .send({ quotedPrice: 115, paymentTerms: "Net 30" })
      .expect(201);

    expect(Number(res.body.quote.quoted_price)).toBe(115);
  });

  test("second provider submits a different quote — 201", async () => {
    await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider2.token}`)
      .send({ quotedPrice: 130 })
      .expect(201);
  });

  test("customer cannot submit a quote — 403", async () => {
    await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ quotedPrice: 100 })
      .expect(403);
  });

  test("rejects missing quotedPrice — 400", async () => {
    await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider.token}`)
      .send({ notes: "no price" })
      .expect(400);
  });

  test("GET /api/scout/requests/:id/my-quote returns provider's own quote", async () => {
    const res = await request(app)
      .get(`/api/scout/requests/${requestId}/my-quote`)
      .set("Authorization", `Bearer ${provider.token}`)
      .expect(200);

    expect(res.body.quote).not.toBeNull();
    expect(res.body.quote.provider_company_id).toBe(provider.company.id);
    expect(res.body.request.id).toBe(requestId);
  });

  test("GET my-quote returns null quote for provider who hasn't quoted", async () => {
    const prov3 = await makeProvider("scout-quote-prov3-noquote");
    const res = await request(app)
      .get(`/api/scout/requests/${requestId}/my-quote`)
      .set("Authorization", `Bearer ${prov3.token}`)
      .expect(200);

    expect(res.body.quote).toBeNull();
  });
});

/* ═══════════════════════════════════════════
   6. ACCEPT QUOTE + ORDER CONVERSION
═══════════════════════════════════════════ */
describe("POST /api/scout/requests/:id/accept-quote/:quoteId", () => {
  let provider: Awaited<ReturnType<typeof makeProvider>>;
  let provider2: Awaited<ReturnType<typeof makeProvider>>;
  let customer: Awaited<ReturnType<typeof makeCustomer>>;
  let requestId: string;
  let quote1Id: string;
  let quote2Id: string;

  beforeAll(async () => {
    provider = await makeProvider("scout-accept-prov1");
    provider2 = await makeProvider("scout-accept-prov2");
    customer = await makeCustomer("scout-accept-cust");

    const reqRes = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "Accept Test", quantity: 10 });
    requestId = reqRes.body.request.id;

    const q1 = await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider.token}`)
      .send({ quotedPrice: 100, paymentTerms: "Net 30" });
    quote1Id = q1.body.quote.id;

    const q2 = await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider2.token}`)
      .send({ quotedPrice: 90, paymentTerms: "Upfront" });
    quote2Id = q2.body.quote.id;
  });

  test("customer can view both quotes side-by-side", async () => {
    const res = await request(app)
      .get(`/api/scout/requests/${requestId}`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(200);

    expect(res.body.quotes).toHaveLength(2);
  });

  test("non-owner cannot accept a quote — 404", async () => {
    const other = await makeCustomer("scout-accept-other");
    await request(app)
      .post(`/api/scout/requests/${requestId}/accept-quote/${quote1Id}`)
      .set("Authorization", `Bearer ${other.token}`)
      .expect(404);
  });

  test("customer accepts quote 1 — creates order, declines quote 2, awards request", async () => {
    const res = await request(app)
      .post(`/api/scout/requests/${requestId}/accept-quote/${quote1Id}`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.order).toMatchObject({
      status: "pending",
      order_number: expect.stringMatching(/^SCT-/),
    });

    // Verify order total = price × quantity = 100 × 10 = 1000
    expect(Number(res.body.order.total)).toBe(1000);

    // DB checks
    const [req, q1, q2, ord] = await Promise.all([
      query("SELECT status FROM scout_requests WHERE id = $1", [requestId]),
      query("SELECT status FROM scout_quotes WHERE id = $1", [quote1Id]),
      query("SELECT status FROM scout_quotes WHERE id = $1", [quote2Id]),
      query("SELECT * FROM orders WHERE scout_request_id = $1", [requestId]),
    ]);

    expect(req.rows[0].status).toBe("awarded");
    expect(q1.rows[0].status).toBe("accepted");
    expect(q2.rows[0].status).toBe("declined");
    expect(ord.rows).toHaveLength(1);
    expect(ord.rows[0].order_number).toMatch(/^SCT-/);
  });

  test("cannot accept a quote on an already-awarded request — 400", async () => {
    await request(app)
      .post(`/api/scout/requests/${requestId}/accept-quote/${quote2Id}`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(400);
  });

  test("duplicate convert returns 409", async () => {
    // Manually reopen to test idempotency guard
    await query("UPDATE scout_requests SET status = 'open' WHERE id = $1", [requestId]);
    await query("UPDATE scout_quotes SET status = 'pending' WHERE id = $1", [quote2Id]);

    const res = await request(app)
      .post(`/api/scout/requests/${requestId}/accept-quote/${quote2Id}`)
      .set("Authorization", `Bearer ${customer.token}`)
      .expect(409);

    expect(res.body.code).toBe("ALREADY_CONVERTED");
  });
});

/* ═══════════════════════════════════════════
   7. CANNOT QUOTE ON CLOSED REQUEST
═══════════════════════════════════════════ */
describe("quote on closed request", () => {
  test("provider cannot quote on a cancelled request — 400", async () => {
    const provider = await makeProvider("scout-closed-prov");
    const customer = await makeCustomer("scout-closed-cust");

    const reqRes = await request(app)
      .post("/api/scout/requests")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ ...BASE_REQUEST, title: "Closed Test" });
    const requestId = reqRes.body.request.id;

    await request(app)
      .patch(`/api/scout/requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${customer.token}`);

    await request(app)
      .post(`/api/scout/requests/${requestId}/quote`)
      .set("Authorization", `Bearer ${provider.token}`)
      .send({ quotedPrice: 50 })
      .expect(400);
  });
});
