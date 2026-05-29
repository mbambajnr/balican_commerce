import request from "supertest";
import app from "../app";
import { query, pool } from "../config/db";
import {
  createTestUser, createTestCompany, createTestProduct,
  createTestCategory, cleanupTestData, generateToken, makeEmail,
  createTestRFQ,
} from "./helpers";
import { sendEmail } from "../services/email";
import { config } from "../config";

jest.mock("../services/email", () => ({
  sendEmail: jest.fn(),
}));

const mockSendEmail = sendEmail as jest.Mock;
const FRONTEND_URL = config.frontendUrl; // "http://localhost:3000" in tests

let adminToken: string;
let adminUser: any;
let customerToken: string;
let customerUser: any;
let activeCompany: any;
let testProduct: any;
let textLineProduct: any;

beforeAll(async () => {
  activeCompany = await createTestCompany("PDF Email Active Co");
  adminUser = await createTestUser({ email: makeEmail("pdf-admin"), role: "admin", firstName: "PDF", lastName: "Admin" });
  adminToken = generateToken(adminUser.id, "admin");
  customerUser = await createTestUser({
    email: makeEmail("pdf-customer"),
    companyId: activeCompany.id,
    companyName: "PDF Email Active Co",
    firstName: "PDF", lastName: "Customer",
  });
  customerToken = generateToken(customerUser.id, "customer");

  const cat = await createTestCategory("PDF Email Cat");
  testProduct = await createTestProduct({
    categoryId: cat.id, price: 5000, name: `PDF-Email-Product-${Date.now()}`,
  });
  const sku = `PDF-EMAIL-SKU-${Date.now()}`;
  await query("UPDATE products SET sku = $1 WHERE id = $2", [sku, testProduct.id]);

  // A second product for free-text / multi-line tests
  textLineProduct = await createTestProduct({
    categoryId: cat.id, price: 3000, name: `PDF-Email-FreeText-${Date.now()}`,
  });
});

afterAll(async () => {
  // Clean up any email_logs left over
  await query("DELETE FROM email_logs WHERE recipient_email LIKE $1", [`${makeEmail("pdf-%")}`]).catch(() => {});
  await cleanupTestData();
  await pool.end();
});

/* ── Quotation send: success path ── */

describe("Quotation send — success", () => {
  let rfq: any;
  let quotation: any;

  beforeAll(async () => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, data: { id: "email-sent-id-1" } });

    rfq = await createTestRFQ({
      userId: customerUser.id,
      productId: testProduct.id,
    });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${rfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    quotation = qRes.body.quotation;
  });

  beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, data: { id: `email-${Date.now()}` } });
  });

  it("sends quotation with PDF attachment to correct recipient", async () => {
    const r = await request(app)
      .post(`/api/admin/quotations/${quotation.id}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r.status).toBe(200);
    expect(r.body.quotation.status).toBe("sent");
    expect(r.body.quotation.sent_at).toBeDefined();

    // PDF attachment
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.to).toBe(customerUser.email);
    expect(emailCall.subject).toContain(quotation.quotation_number);
    expect(emailCall.attachments).toHaveLength(1);
    expect(emailCall.attachments[0].filename).toContain("quotation-");
    expect(emailCall.attachments[0].content).toBeInstanceOf(Buffer);
    expect(emailCall.attachments[0].content.length).toBeGreaterThan(0);
  });

  it("updates RFQ status to quote_sent", async () => {
    const rfqCheck = await query("SELECT status FROM rfqs WHERE id = $1", [rfq.id]);
    expect(rfqCheck.rows[0].status).toBe("quote_sent");
  });

  it("inserts quotation_events row for quotation.sent", async () => {
    const events = await query(
      "SELECT * FROM quotation_events WHERE quotation_id = $1 AND event_type = 'quotation.sent'",
      [quotation.id]
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].user_id).toBe(adminUser.id);
    expect(events.rows[0].description).toContain("sent");
  });

  it("inserts email_logs row with correct metadata", async () => {
    const emailLog = await query(
      "SELECT * FROM email_logs WHERE quotation_id = $1",
      [quotation.id]
    );
    expect(emailLog.rows.length).toBe(1);
    expect(emailLog.rows[0].status).toBe("sent");
    expect(emailLog.rows[0].event_type).toBe("quotation.sent");
    expect(emailLog.rows[0].recipient_email).toBe(customerUser.email);
    expect(emailLog.rows[0].sent_by).toBe(adminUser.id);
    expect(emailLog.rows[0].provider_response).toContain("resendId");
  });
});

/* ── Quotation send: failure path ── */

describe("Quotation send — email failure", () => {
  it("returns 502, keeps quotation draft, does not touch RFQ", async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: "Simulated delivery failure" });

    const failRfq = await createTestRFQ({
      userId: customerUser.id,
      productId: testProduct.id,
    });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${failRfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    const failQuotation = qRes.body.quotation;

    const r = await request(app)
      .post(`/api/admin/quotations/${failQuotation.id}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r.status).toBe(502);
    expect(r.body.error).toContain("Failed to send quotation email");

    // Quotation unchanged
    const qCheck = await query("SELECT status FROM quotations WHERE id = $1", [failQuotation.id]);
    expect(qCheck.rows[0].status).toBe("draft");

    // RFQ not advanced
    const rfqCheck = await query("SELECT status FROM rfqs WHERE id = $1", [failRfq.id]);
    expect(rfqCheck.rows[0].status).not.toBe("quote_sent");

    // No email_logs (transaction rolled back)
    const emailLog = await query("SELECT * FROM email_logs WHERE quotation_id = $1", [failQuotation.id]);
    expect(emailLog.rows.length).toBe(0);

    // No quotation_events (transaction rolled back)
    const events = await query(
      "SELECT * FROM quotation_events WHERE quotation_id = $1 AND event_type = 'quotation.sent'",
      [failQuotation.id]
    );
    expect(events.rows.length).toBe(0);
  });
});

/* ── PDF product links ── */

describe("Quotation PDF — product links", () => {
  it("stores frontend product URLs on quotation_items at send time", async () => {
    // Create a quotation with a single product line
    const linkRfq = await createTestRFQ({
      userId: customerUser.id,
      productId: testProduct.id,
    });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${linkRfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    const linkQuotation = qRes.body.quotation;

    mockSendEmail.mockResolvedValue({ success: true, data: { id: "links-test" } });
    await request(app)
      .post(`/api/admin/quotations/${linkQuotation.id}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    const items = await query(
      "SELECT product_slug, product_url FROM quotation_items WHERE quotation_id = $1",
      [linkQuotation.id]
    );
    expect(items.rows.length).toBeGreaterThan(0);

    for (const item of items.rows) {
      if (item.product_slug) {
        // Uses FRONTEND_URL as base
        expect(item.product_url).toMatch(new RegExp(`^${escapeRegex(FRONTEND_URL)}/products/`));
        // Contains the product slug
        expect(item.product_url).toContain(item.product_slug);
        // No admin URLs
        expect(item.product_url).not.toContain("/admin/");
        expect(item.product_url).not.toContain("admin");
      }
    }
  });

  it("multiple product-linked lines each get their own View Product URL", async () => {
    // Create a second product for multi-line test
    const cat = await createTestCategory("MultiLink Cat");
    const secondProduct = await createTestProduct({
      categoryId: cat.id, price: 8000, name: `PDF-Multi-${Date.now()}`,
    });

    const multiRfq = await createTestRFQ({
      userId: customerUser.id,
      productId: testProduct.id,
    });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${multiRfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    const multiQuotation = qRes.body.quotation;

    // Add a second product-linked line item
    await query(
      `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, line_total, sort_order)
       VALUES ($1, $2, $3, 2, 8000, 16000, 1)`,
      [multiQuotation.id, secondProduct.id, secondProduct.name]
    );

    mockSendEmail.mockResolvedValue({ success: true, data: { id: "multi-link-test" } });
    await request(app)
      .post(`/api/admin/quotations/${multiQuotation.id}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    const items = await query(
      "SELECT product_slug, product_url FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order",
      [multiQuotation.id]
    );

    // Every product-linked line has a URL
    for (const item of items.rows) {
      if (item.product_slug) {
        expect(item.product_url).toBeDefined();
        expect(item.product_url).toMatch(new RegExp(`^${escapeRegex(FRONTEND_URL)}/products/`));
        expect(item.product_url).toContain(item.product_slug);
        expect(item.product_url).not.toContain("/admin/");
      }
    }
  });

  it("custom/free-text lines (no product_id) do not require product links", async () => {
    const freeTextRfq = await createTestRFQ({
      userId: customerUser.id,
      productId: textLineProduct.id,
    });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${freeTextRfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    const ftQuotation = qRes.body.quotation;

    // Add a free-text line (no product_id)
    await query(
      `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, line_total, sort_order)
       VALUES ($1, NULL, 'Custom Service — Installation Fee', 1, 2000, 2000, 1)`,
      [ftQuotation.id]
    );

    mockSendEmail.mockResolvedValue({ success: true, data: { id: "freetext-test" } });
    await request(app)
      .post(`/api/admin/quotations/${ftQuotation.id}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    const items = await query(
      "SELECT product_id, product_slug, product_url FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order",
      [ftQuotation.id]
    );

    const freeTextItem = items.rows.find((i: any) => i.product_id === null);
    expect(freeTextItem).toBeDefined();
    expect(freeTextItem.product_slug).toBeNull();
    expect(freeTextItem.product_url).toBeNull();

    // The product-linked item still has its URL
    const linkedItem = items.rows.find((i: any) => i.product_id !== null);
    expect(linkedItem).toBeDefined();
    expect(linkedItem.product_url).toMatch(new RegExp(`^${escapeRegex(FRONTEND_URL)}/products/`));
  });
});

/* ── Quotation → order conversion ── */

describe("Quotation-to-order conversion", () => {
  let acceptedQuotation: any;

  beforeAll(async () => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, data: { id: `email-${Date.now()}` } });

    const conversionRfq = await createTestRFQ({
      userId: customerUser.id,
      productId: testProduct.id,
    });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${conversionRfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    acceptedQuotation = qRes.body.quotation;
    await query("UPDATE quotations SET status = 'accepted' WHERE id = $1", [acceptedQuotation.id]);
  });

  beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ success: true, data: { id: `email-${Date.now()}` } });
  });

  it("converts accepted quotation to order + invoice with PDF email", async () => {
    const r = await request(app)
      .post(`/api/orders/from-quotation/${acceptedQuotation.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r.status).toBe(201);
    expect(r.body.order.status).toBe("pending");
    expect(r.body.order.quotation_id).toBe(acceptedQuotation.id);
    expect(parseFloat(r.body.order.subtotal)).toBe(5000);
    expect(parseFloat(r.body.order.total)).toBe(5000);
    expect(r.body.order.invoice).toBeDefined();
    expect(r.body.order.invoice.status).toBe("issued");

    // Invoice PDF email sent to customer
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.to).toBe(customerUser.email);
    expect(emailCall.subject).toContain("Invoice");
    expect(emailCall.attachments).toHaveLength(1);
    expect(emailCall.attachments[0].filename).toContain("invoice-");
    expect(emailCall.attachments[0].content).toBeInstanceOf(Buffer);
    expect(emailCall.attachments[0].content.length).toBeGreaterThan(0);

    // Quotation status updated
    const qCheck = await query("SELECT status FROM quotations WHERE id = $1", [acceptedQuotation.id]);
    expect(qCheck.rows[0].status).toBe("converted_to_order");

    // quotation_events row created
    const events = await query(
      "SELECT * FROM quotation_events WHERE quotation_id = $1 AND event_type = 'quotation.converted_to_order'",
      [acceptedQuotation.id]
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].description).toContain(r.body.order.order_number);

    // email_logs row for invoice
    const invoiceId = r.body.order.invoice.id;
    const emailLog = await query(
      "SELECT * FROM email_logs WHERE invoice_id = $1 AND event_type = 'invoice.created'",
      [invoiceId]
    );
    expect(emailLog.rows.length).toBe(1);
    expect(emailLog.rows[0].status).toBe("sent");
    expect(emailLog.rows[0].recipient_email).toBe(customerUser.email);
    expect(emailLog.rows[0].sent_by).toBe(adminUser.id);
  });

  it("blocks duplicate conversion of the same quotation", async () => {
    const r = await request(app)
      .post(`/api/orders/from-quotation/${acceptedQuotation.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/already been converted|cannot convert/i);
  });
});

/* ── Invoice resend ── */

describe("Invoice resend", () => {
  let invoiceId: string;
  let invoiceNumber: string;

  beforeAll(async () => {
    // We need an order+invoice from a previous conversion. Since the previous
    // quotation was already converted, create a fresh one.
    mockSendEmail.mockResolvedValue({ success: true, data: { id: `email-${Date.now()}` } });

    const resendRfq = await createTestRFQ({ userId: customerUser.id, productId: testProduct.id });
    const qRes = await request(app)
      .post(`/api/admin/rfqs/${resendRfq.id}/quotations`)
      .set("Authorization", `Bearer ${adminToken}`);
    const resendQuotation = qRes.body.quotation;

    await query("UPDATE quotations SET status = 'accepted' WHERE id = $1", [resendQuotation.id]);

    const convRes = await request(app)
      .post(`/api/orders/from-quotation/${resendQuotation.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(convRes.status).toBe(201);

    invoiceId = convRes.body.order.invoice.id;
    invoiceNumber = convRes.body.order.invoice.invoice_number;
  });

  beforeEach(() => {
    mockSendEmail.mockReset();
  });

  it("sends invoice PDF again and logs a new email_logs entry", async () => {
    mockSendEmail.mockResolvedValue({ success: true, data: { id: "resend-ok-1" } });

    const r = await request(app)
      .post(`/api/orders/admin/invoices/${invoiceId}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r.status).toBe(200);
    expect(r.body.message).toContain("sent successfully");

    // PDF sent
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.to).toBe(customerUser.email);
    expect(emailCall.subject).toContain(invoiceNumber);
    expect(emailCall.attachments[0].filename).toContain("invoice-");
    expect(emailCall.attachments[0].content).toBeInstanceOf(Buffer);
    expect(emailCall.attachments[0].content.length).toBeGreaterThan(0);

    // email_logs has a "sent" entry for invoice.sent
    const emailLog = await query(
      "SELECT * FROM email_logs WHERE invoice_id = $1 AND event_type = 'invoice.sent'",
      [invoiceId]
    );
    expect(emailLog.rows.length).toBe(1);
    expect(emailLog.rows[0].status).toBe("sent");
    expect(emailLog.rows[0].sent_by).toBe(adminUser.id);

    // No duplicate invoice/order
    const invCheck = await query("SELECT id FROM invoices WHERE id = $1", [invoiceId]);
    expect(invCheck.rows.length).toBe(1);
  });

  it("logs failed email attempts without crashing", async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: "Resend API failure" });

    const r = await request(app)
      .post(`/api/orders/admin/invoices/${invoiceId}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(r.status).toBe(502);
    expect(r.body.error).toContain("Failed to send invoice email");

    // Failed attempt logged
    const failedLogs = await query(
      "SELECT * FROM email_logs WHERE invoice_id = $1 AND event_type = 'invoice.sent' AND status = 'failed'",
      [invoiceId]
    );
    expect(failedLogs.rows.length).toBe(1);
    expect(failedLogs.rows[0].provider_response).toContain("error");
  });

  it("successful resend increments email_logs count without duplicating invoice", async () => {
    mockSendEmail.mockResolvedValue({ success: true, data: { id: "resend-ok-2" } });

    await request(app)
      .post(`/api/orders/admin/invoices/${invoiceId}/send`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Now there should be 2 "sent" entries (previous success + this one)
    const sentLogs = await query(
      "SELECT * FROM email_logs WHERE invoice_id = $1 AND event_type = 'invoice.sent' AND status = 'sent'",
      [invoiceId]
    );
    expect(sentLogs.rows.length).toBe(2);

    // Invoice still unique
    const invCheck = await query("SELECT id FROM invoices WHERE id = $1", [invoiceId]);
    expect(invCheck.rows.length).toBe(1);
  });
});

/* ── Security: no public price leakage ── */

describe("Security: No public price leakage from product pages", () => {
  let productSlug: string;

  beforeAll(async () => {
    const row = await query("SELECT slug FROM products WHERE id = $1", [testProduct.id]);
    productSlug = row.rows[0].slug;
  });

  it("guest sees no prices on product listing", async () => {
    const r = await request(app).get("/api/products?limit=100");
    const p = r.body.products.find((x: any) => x.id === testProduct.id);
    expect(p).toBeDefined();
    expect(p.price).toBeNull();
  });

  it("guest sees no prices on product detail", async () => {
    const r = await request(app).get(`/api/products/${productSlug}`);
    expect(r.body.product.price).toBeNull();
  });

  it("pending company sees no prices", async () => {
    const pendingUser = await createTestUser({
      email: makeEmail("pdf-pending"),
      accountStatus: "pending",
      companyName: "PDF Pending Co",
    });
    const pendingToken = generateToken(pendingUser.id, "customer");

    const r = await request(app)
      .get(`/api/products/${productSlug}`)
      .set("Authorization", `Bearer ${pendingToken}`);
    expect(r.body.product.price).toBeNull();
  });
});

/* ── Helper ── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
