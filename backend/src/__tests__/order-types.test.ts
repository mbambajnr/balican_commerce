import { query } from "../config/db";
import app from "../app";
import supertest from "supertest";
import {
  createTestUser, createTestCategory, createTestProduct,
  createTestQuotation, createTestQuotationItem, createTestOrder,
  generateToken, cleanupTestData, makeEmail, TEST_PREFIX,
} from "./helpers";

const request = supertest(app);

let customerToken: string;
let adminToken: string;
let customerId: string;
let adminId: string;
let categoryId: string;
let productId: string;

beforeAll(async () => {
  await cleanupTestData();

  const customer = await createTestUser({
    email: makeEmail("ot-customer"),
    firstName: "OrderType",
    lastName: "Customer",
  });
  customerId = customer.id;
  customerToken = generateToken(customerId, "customer");

  const admin = await createTestUser({
    email: makeEmail("ot-admin"),
    firstName: "OrderType",
    lastName: "Admin",
    role: "admin",
  });
  adminId = admin.id;
  adminToken = generateToken(adminId, "admin");

  const cat = await createTestCategory("order-types-test-cat");
  categoryId = cat.id;

  const prod = await createTestProduct({ name: "OT Test Product", categoryId, price: 50000 });
  productId = prod.id;
});

afterAll(async () => {
  await cleanupTestData();
});

/* ── OT-1: Default existing orders are sales ── */

describe("Order Type - Default and Direct Checkout", () => {
  test("OT-1: Direct checkout defaults to sales order type", async () => {
    const res = await request
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId, name: "Test Item", price: 50000, quantity: 1 }],
        subtotal: 50000,
        tax: 0,
        total: 50000,
        paymentMethod: "bank_transfer",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.order_type).toBe("sales");
  });

  test("OT-1b: Direct checkout with explicit orderType sales", async () => {
    const res = await request
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId, name: "Test Item", price: 30000, quantity: 2 }],
        subtotal: 60000,
        tax: 0,
        total: 60000,
        paymentMethod: "paystack",
        orderType: "sales",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.order_type).toBe("sales");
  });

  test("OT-1c: Direct checkout with explicit orderType mixed", async () => {
    const res = await request
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ productId, name: "Test Item", price: 100000, quantity: 1 }],
        subtotal: 100000,
        tax: 0,
        total: 100000,
        paymentMethod: "bank_transfer",
        orderType: "mixed",
      });

    expect(res.status).toBe(201);
    expect(res.body.order.order_type).toBe("mixed");
  });
});

/* ── OT-2: Quotation conversion creates sales order ── */

describe("Order Type - Quotation Conversion", () => {
  let quotationId: string;

  beforeAll(async () => {
    const rfq = await query(
      `INSERT INTO rfqs (user_id, product_id, quantity, status) VALUES ($1, $2, 1, 'quoted') RETURNING id`,
      [customerId, productId]
    );

    const q = await createTestQuotation({
      customerId,
      status: "accepted",
      totalAmount: 75000,
      subtotal: 75000,
      rfqId: rfq.rows[0].id,
    });
    quotationId = q.id;

    await createTestQuotationItem({
      quotationId,
      productId,
      description: "OT Test Quotation Item",
      quantity: 1,
      unitPrice: 75000,
    });
  });

  test("OT-2: Quotation conversion creates order with order_type = sales", async () => {
    const res = await request
      .post(`/api/orders/from-quotation/${quotationId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.order.order_type).toBe("sales");
  });
});

/* ── OT-3: Service order creation from booking ── */

describe("Order Type - Service Order from Booking", () => {
  let salesOrderId: string;
  let bookingId: string;

  beforeAll(async () => {
    const order = await createTestOrder({
      userId: customerId,
      paymentMethod: "paystack",
      paymentStatus: "paid",
      amountPaid: 50000,
      total: 50000,
    });
    salesOrderId = order.id;

    const bookingResult = await query(
      `INSERT INTO service_bookings (order_id, user_id, preferred_date, location, contact_name, contact_phone, service_type, status)
       VALUES ($1, $2, CURRENT_DATE + 7, 'Test Location', 'Test Contact', '0800000000', 'installation', 'requested')
       RETURNING *`,
      [salesOrderId, customerId]
    );
    bookingId = bookingResult.rows[0].id;
  });

  test("OT-3: Convert booking to service order creates order with order_type = service", async () => {
    const res = await request
      .post(`/api/bookings/admin/${bookingId}/convert-to-service-order`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.serviceOrder.order_type).toBe("service");
    expect(res.body.serviceOrder.booking_id).toBe(bookingId);
    expect(res.body.serviceOrder.linked_sales_order_id).toBe(salesOrderId);
  });

  test("OT-3b: Cannot create duplicate service order for same booking", async () => {
    const res = await request
      .post(`/api/bookings/admin/${bookingId}/convert-to-service-order`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test("OT-3c: Service order shows in admin order list with filter by orderType", async () => {
    const res = await request
      .get(`/api/orders?orderType=service`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.length).toBeGreaterThanOrEqual(1);
    expect(res.body.orders.every((o: any) => o.order_type === "service")).toBe(true);
  });

  test("OT-3d: Service order includes linked sales order and booking info", async () => {
    const serviceOrderRes = await query(
      `SELECT id, order_type, linked_sales_order_id, booking_id FROM orders WHERE booking_id = $1`,
      [bookingId]
    );
    expect(serviceOrderRes.rows.length).toBe(1);
    expect(serviceOrderRes.rows[0].order_type).toBe("service");
    expect(serviceOrderRes.rows[0].booking_id).toBe(bookingId);
    expect(serviceOrderRes.rows[0].linked_sales_order_id).toBe(salesOrderId);
  });
});

/* ── OT-4: Filter by orderType ── */

describe("Order Type - Filters", () => {
  test("OT-4: Admin can filter sales orders", async () => {
    const res = await request
      .get(`/api/orders?orderType=sales`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.length).toBeGreaterThanOrEqual(1);
    expect(res.body.orders.every((o: any) => o.order_type === "sales")).toBe(true);
  });

  test("OT-4b: Admin can filter mixed orders", async () => {
    const res = await request
      .get(`/api/orders?orderType=mixed`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.every((o: any) => o.order_type === "mixed")).toBe(true);
  });

  test("OT-4c: Customer can also filter by orderType", async () => {
    const res = await request
      .get(`/api/orders?orderType=sales`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.every((o: any) => o.order_type === "sales")).toBe(true);
  });
});

/* ── OT-5: Customer cannot access another customer's order ── */

describe("Order Type - Access Control", () => {
  let otherCustomerToken: string;

  beforeAll(async () => {
    const other = await createTestUser({
      email: makeEmail("ot-other"),
      firstName: "Other",
      lastName: "Customer",
    });
    otherCustomerToken = generateToken(other.id, "customer");
  });

  test("OT-5: Customer cannot access another customer's service order", async () => {
    const serviceOrders = await query(
      `SELECT id FROM orders WHERE order_type = 'service' LIMIT 1`
    );
    if (serviceOrders.rows.length === 0) return;

    const res = await request
      .get(`/api/orders/${serviceOrders.rows[0].id}`)
      .set("Authorization", `Bearer ${otherCustomerToken}`);

    expect(res.status).toBe(404);
  });

  test("OT-5b: Admin can view service orders", async () => {
    const serviceOrders = await query(
      `SELECT id FROM orders WHERE order_type = 'service' LIMIT 1`
    );
    if (serviceOrders.rows.length === 0) return;

    const res = await request
      .get(`/api/orders/${serviceOrders.rows[0].id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.order_type).toBe("service");
  });
});

/* ── OT-6: Service order fields on single order detail ── */

describe("Order Type - Service Order Detail", () => {
  test("OT-6: Service order detail includes linkedSalesOrder and serviceBooking", async () => {
    const serviceOrders = await query(
      `SELECT id FROM orders WHERE order_type = 'service' LIMIT 1`
    );
    if (serviceOrders.rows.length === 0) return;
    const serviceOrderId = serviceOrders.rows[0].id;

    const res = await request
      .get(`/api/orders/${serviceOrderId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.order_type).toBe("service");
    expect(res.body.order.linkedSalesOrder).toBeDefined();
    expect(res.body.order.serviceBooking).toBeDefined();
  });

  test("OT-6b: Customer who owns the service order can view detail", async () => {
    const serviceOrders = await query(
      `SELECT id FROM orders WHERE order_type = 'service' LIMIT 1`
    );
    if (serviceOrders.rows.length === 0) return;
    const serviceOrderId = serviceOrders.rows[0].id;

    const res = await request
      .get(`/api/orders/${serviceOrderId}`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.order_type).toBe("service");
  });
});

/* ── OT-7: Admin invoice/order listing includes order_type ── */

describe("Order Type - Customer Distinction", () => {
  test("OT-7: Customer sees order_type in their order list", async () => {
    const res = await request
      .get(`/api/orders`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    for (const order of res.body.orders) {
      expect(order.order_type).toBeDefined();
      expect(["sales", "service", "mixed"]).toContain(order.order_type);
    }
  });
});
