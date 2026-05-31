import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let buyerToken: string;
let buyerCompanyId: string;
let buyerId: string;

let approvedProviderCompany: any;
let providerToken: string;
let secondProviderCompany: any;

beforeAll(async () => {
  buyerCompanyId = (await createTestCompany(makeUnique("POC-Buyer"))).id;
  const buyer = await createTestUser({
    email: makeEmail("poc-buyer"),
    companyId: buyerCompanyId,
    companyRole: "buyer",
  });
  buyerId = buyer.id;
  buyerToken = generateToken(buyer.id, "customer");

  // Approved-credit provider
  approvedProviderCompany = await createTestCompany(makeUnique("POC-Approved"));
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier',
     verification_status = 'approved', status = 'active' WHERE id = $1`,
    [approvedProviderCompany.id]
  );
  await query(
    `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier)
     VALUES ($1, 'approved', 'premium')
     ON CONFLICT (company_id) DO UPDATE SET vetting_status = 'approved', credit_tier = 'premium'`,
    [approvedProviderCompany.id]
  );
  const pUser = await createTestUser({
    email: makeEmail("poc-provider"),
    companyId: approvedProviderCompany.id,
    companyRole: "company_admin",
  });
  providerToken = generateToken(pUser.id, "customer");

  // Second provider (for multi-provider test)
  secondProviderCompany = await createTestCompany(makeUnique("POC-Second"));
  await query(
    `UPDATE companies SET is_provider = true, company_type = 'supplier',
     verification_status = 'approved', status = 'active' WHERE id = $1`,
    [secondProviderCompany.id]
  );
  await query(
    `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier)
     VALUES ($1, 'approved', 'standard')
     ON CONFLICT (company_id) DO UPDATE SET vetting_status = 'approved', credit_tier = 'standard'`,
    [secondProviderCompany.id]
  );
});

afterAll(async () => {
  await cleanupTestData();
});

/** Create + submit + accept (select provider) a procurement request, return the request ID */
const createAndAcceptRequest = async (providerId: string): Promise<string> => {
  // Create with items
  const createRes = await request(app)
    .post("/api/procurement/requests")
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({
      title: `POC Test ${Date.now()}`,
      items: [
        { productName: "Widget A", quantity: 5, unit: "pcs", notes: "Red ones" },
        { productName: "Widget B", quantity: 3, unit: "boxes" },
      ],
      providerIds: [providerId],
    });
  const rid = createRes.body.request.id;

  // Submit
  await request(app)
    .patch(`/api/procurement/requests/${rid}/status`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({ status: "submitted" });

  // Provider quotes
  await request(app)
    .patch(`/api/provider/procurement/requests/${rid}/respond`)
    .set("Authorization", `Bearer ${providerToken}`)
    .send({ response: "quote", quoteAmount: 50000, notes: "Can deliver in 2 weeks" });

  // Accept the quote
  await request(app)
    .post(`/api/procurement/requests/${rid}/accept-provider/${providerId}`)
    .set("Authorization", `Bearer ${buyerToken}`)
    .send({});

  return rid;
};

/* ── Conversion tests ── */
describe("POST /procurement/requests/:id/convert-to-order", () => {
  let acceptedRid: string;

  beforeAll(async () => {
    acceptedRid = await createAndAcceptRequest(approvedProviderCompany.id);
  });

  afterAll(async () => {
    await query("DELETE FROM orders WHERE procurement_request_id = $1", [acceptedRid]).catch(() => {});
    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [acceptedRid]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [acceptedRid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [acceptedRid]).catch(() => {});
  });

  it("converts an accepted procurement request to an order", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${acceptedRid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.order).toBeDefined();

    const order = res.body.order;
    expect(order.order_number).toMatch(/^PROC-/);
    expect(Number(order.subtotal)).toBe(50000);
    expect(Number(order.total)).toBe(50000);
    expect(order.payment_status).toBe("unpaid");
    expect(order.status).toBe("pending");

    // Verify procurement_request_id is set
    const dbOrder = await query("SELECT procurement_request_id FROM orders WHERE id = $1", [order.id]);
    expect(dbOrder.rows[0].procurement_request_id).toBe(acceptedRid);

    // Verify items array
    const parsedItems = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
    expect(parsedItems).toHaveLength(2);
    expect(parsedItems[0].name).toBe("Widget A");
    expect(parsedItems[0].quantity).toBe(5);
    expect(parsedItems[1].name).toBe("Widget B");
    expect(parsedItems[1].quantity).toBe(3);
    // Unit price should reflect the quote allocation (stored as 'price' for compat)
    const totalQty = 5 + 3;
    const expectedUnitPrice = Math.round((50000 / totalQty) * 100) / 100;
    expect(parsedItems[0].price).toBe(expectedUnitPrice);
  });

  it("rejects duplicate conversion with 409", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${acceptedRid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_CONVERTED");
    expect(res.body.order_number).toBeDefined();
  });
});

/* ── Precondition validation ── */
describe("Conversion precondition validation", () => {
  let acceptedRid: string;

  beforeAll(async () => {
    acceptedRid = await createAndAcceptRequest(approvedProviderCompany.id);
  });

  afterAll(async () => {
    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [acceptedRid]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [acceptedRid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [acceptedRid]).catch(() => {});
  });

  it("returns 404 for non-existent request", async () => {
    const res = await request(app)
      .post("/api/procurement/requests/00000000-0000-0000-0000-000000000000/convert-to-order")
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .post(`/api/procurement/requests/${acceptedRid}/convert-to-order`);
    expect(res.status).toBe(401);
  });

  it("returns 400 if request is not accepted", async () => {
    const rid = await (async () => {
      const r = await request(app)
        .post("/api/procurement/requests")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          title: "POC Not Accepted",
          items: [{ productName: "Test", quantity: 1 }],
        });
      return r.body.request.id;
    })();

    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(400);

    await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
  });

  it("returns 400 if no provider selected on request", async () => {
    const rid = await (async () => {
      const r = await request(app)
        .post("/api/procurement/requests")
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          title: "POC No Provider",
          items: [{ productName: "Test", quantity: 1 }],
          providerIds: [approvedProviderCompany.id],
        });
      return r.body.request.id;
    })();

    // Submit but don't accept (no provider selected)
    await request(app)
      .patch(`/api/procurement/requests/${rid}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    // Manually set to accepted without selecting (edge case — skip accept flow)
    await query("UPDATE procurement_requests SET status = 'accepted' WHERE id = $1", [rid]);

    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(400);

    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
  });

  it("order has correct order_type for service requests", async () => {
    // Create a service-type procurement request
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `POC Service ${Date.now()}`,
        requestType: "service",
        items: [{ serviceDescription: "HVAC Maintenance", quantity: 1, unit: "job" }],
        providerIds: [approvedProviderCompany.id],
      });
    const rid = createRes.body.request.id;

    await request(app)
      .patch(`/api/procurement/requests/${rid}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/respond`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ response: "quote", quoteAmount: 15000 });

    await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${approvedProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});

    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(201);

    const dbOrder = await query("SELECT order_type FROM orders WHERE id = $1", [res.body.order.id]);
    expect(dbOrder.rows[0].order_type).toBe("service");

    // Cleanup
    await query("DELETE FROM orders WHERE id = $1", [res.body.order.id]).catch(() => {});
    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
  });
});

/* ── Multi-provider request → order only references selected provider ── */
describe("Multi-provider request conversion", () => {
  it("converts order using the selected provider's quote", async () => {
    // Create with both providers
    const createRes = await request(app)
      .post("/api/procurement/requests")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        title: `POC Multi ${Date.now()}`,
        items: [{ productName: "Bulk Item", quantity: 100, unit: "pcs" }],
        providerIds: [approvedProviderCompany.id, secondProviderCompany.id],
      });
    const rid = createRes.body.request.id;

    // Submit
    await request(app)
      .patch(`/api/procurement/requests/${rid}/status`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ status: "submitted" });

    // Both providers quote at different amounts
    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/respond`)
      .set("Authorization", `Bearer ${providerToken}`)
      .send({ response: "quote", quoteAmount: 80000 });

    const secondUser = await createTestUser({
      email: makeEmail("poc-second-user"),
      companyId: secondProviderCompany.id,
      companyRole: "company_admin",
    });
    const secondToken = generateToken(secondUser.id, "customer");

    await request(app)
      .patch(`/api/provider/procurement/requests/${rid}/respond`)
      .set("Authorization", `Bearer ${secondToken}`)
      .send({ response: "quote", quoteAmount: 60000 });

    // Accept the cheaper provider
    const acceptRes = await request(app)
      .post(`/api/procurement/requests/${rid}/accept-provider/${secondProviderCompany.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({});
    expect(acceptRes.status).toBe(200);

    // Convert to order
    const res = await request(app)
      .post(`/api/procurement/requests/${rid}/convert-to-order`)
      .set("Authorization", `Bearer ${buyerToken}`);
    expect(res.status).toBe(201);
    expect(Number(res.body.order.subtotal)).toBe(60000); // Uses second provider's quote

    // Cleanup
    await query("DELETE FROM orders WHERE id = $1", [res.body.order.id]).catch(() => {});
    await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM request_items WHERE request_id = $1", [rid]).catch(() => {});
    await query("DELETE FROM procurement_requests WHERE id = $1", [rid]).catch(() => {});
  });
});
