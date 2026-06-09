import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  createTestUser, createTestCompany, createTestCategory, createTestProduct,
  createTestOrder, createTestInvoice, generateToken,
} from "./helpers";

// ── Test-level state ──
const state: Record<string, any> = {};

beforeAll(async () => {
  // Create test companies
  state.customerCompany = await createTestCompany("Booking Customer Co");
  state.creditCompany = await createTestCompany("Booking Credit Co");
  state.otherCompany = await createTestCompany("Booking Other Co");

  // Create test users
  state.adminUser = await createTestUser({
    email: "test-qa-booking-admin@test.com",
    firstName: "Booking",
    lastName: "Admin",
    role: "admin",
  });

  state.superAdminUser = await createTestUser({
    email: "test-qa-booking-superadmin@test.com",
    firstName: "Booking",
    lastName: "SuperAdmin",
    role: "super_admin",
  });

  state.opsUser = await createTestUser({
    email: "test-qa-booking-ops@test.com",
    firstName: "Booking",
    lastName: "Ops",
    role: "ops",
  });

  state.customerUser = await createTestUser({
    email: "test-qa-booking-customer@test.com",
    firstName: "Booking",
    lastName: "Customer",
    role: "customer",
    companyId: state.customerCompany.id,
  });

  state.creditCustomer = await createTestUser({
    email: "test-qa-booking-credit@test.com",
    firstName: "Booking",
    lastName: "Credit",
    role: "customer",
    isCreditApproved: true,
    creditLimit: 500000,
    paymentTermsDays: 30,
    companyName: "Booking Credit Corp",
    companyId: state.creditCompany.id,
  });

  state.anotherCustomer = await createTestUser({
    email: "test-qa-booking-other@test.com",
    firstName: "Other",
    lastName: "Booking",
    role: "customer",
    companyId: state.otherCompany.id,
  });

  // Create a product
  state.category = await createTestCategory("QA Booking Test Cat");
  state.product = await createTestProduct({
    name: "QA Booking Product",
    price: 25000,
    categoryId: state.category.id,
    isActive: true,
  });

  // Generate tokens
  state.adminToken = generateToken(state.adminUser.id, "admin");
  state.superAdminToken = generateToken(state.superAdminUser.id, "super_admin");
  state.opsToken = generateToken(state.opsUser.id, "ops");
  state.customerToken = generateToken(state.customerUser.id, "customer");
  state.creditToken = generateToken(state.creditCustomer.id, "customer");
  state.otherToken = generateToken(state.anotherCustomer.id, "customer");

  // Create test orders with different payment statuses
  // 1. Paid order (for customer)
  const paidOrder = await createTestOrder({
    userId: state.customerUser.id,
    paymentMethod: "paystack",
    paymentStatus: "paid",
    total: 50000,
    amountPaid: 50000,
  });
  await createTestInvoice({ orderId: paidOrder.id, total: 50000, status: "paid" });
  state.paidOrder = paidOrder;

  // 2. Unpaid order (for customer)
  const unpaidOrder = await createTestOrder({
    userId: state.customerUser.id,
    paymentMethod: "paystack",
    paymentStatus: "unpaid",
    total: 50000,
  });
  await createTestInvoice({ orderId: unpaidOrder.id, total: 50000, status: "pending_payment" });
  state.unpaidOrder = unpaidOrder;

  // 3. Approved credit order (for creditCustomer)
  const creditOrder = await createTestOrder({
    userId: state.creditCustomer.id,
    paymentMethod: "credit",
    paymentStatus: "unpaid",
    total: 100000,
  });
  await createTestInvoice({ orderId: creditOrder.id, total: 100000, status: "issued" });
  state.creditOrder = creditOrder;

  // 4. Ready-for-service order
  const readyOrder = await createTestOrder({
    userId: state.customerUser.id,
    paymentMethod: "paystack",
    paymentStatus: "unpaid",
    total: 30000,
  });
  await query(`UPDATE orders SET ready_for_service = true WHERE id = $1`, [readyOrder.id]);
  await createTestInvoice({ orderId: readyOrder.id, total: 30000, status: "pending_payment" });
  state.readyOrder = readyOrder;

  // Track all created order IDs for cleanup
  state.createdOrderIds = [paidOrder.id, unpaidOrder.id, creditOrder.id, readyOrder.id];
  state.createdBookingIds = [];
});

afterAll(async () => {
  // Clean up bookings first
  if (state.createdBookingIds.length > 0) {
    await query("DELETE FROM activities WHERE entity_id = ANY($1::uuid[])", [state.createdBookingIds]).catch(() => {});
    await query("DELETE FROM service_bookings WHERE id = ANY($1::uuid[])", [state.createdBookingIds]).catch(() => {});
  }

  // Clean up orders and related data
  if (state.createdOrderIds.length > 0) {
    await query("DELETE FROM order_payments WHERE order_id = ANY($1::uuid[])", [state.createdOrderIds]).catch(() => {});
    await query("DELETE FROM bank_transfers WHERE order_id = ANY($1::uuid[])", [state.createdOrderIds]).catch(() => {});
    await query("DELETE FROM invoices WHERE order_id = ANY($1::uuid[])", [state.createdOrderIds]).catch(() => {});
    await query("DELETE FROM orders WHERE id = ANY($1::uuid[])", [state.createdOrderIds]).catch(() => {});
  }

  // Collect all user IDs
  const userIds = [state.adminUser, state.superAdminUser, state.opsUser,
    state.customerUser, state.creditCustomer, state.anotherCustomer]
    .filter(Boolean).map((u: any) => u.id);
  if (userIds.length > 0) {
    await query("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)", [state.category?.id]).catch(() => {});
    await query("DELETE FROM product_attributes WHERE product_id IN (SELECT id FROM products WHERE category_id = $1)", [state.category?.id]).catch(() => {});
    await query("DELETE FROM products WHERE category_id = $1", [state.category?.id]).catch(() => {});
    await query("DELETE FROM categories WHERE id = $1", [state.category?.id]).catch(() => {});
    await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]).catch(() => {});
  }
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 1: Eligibility Checks
// ════════════════════════════════════════════════════════════════════

describe("Eligibility", () => {
  test("SB-1: Paid order is eligible for booking", async () => {
    const res = await request(app)
      .get(`/api/bookings/eligible/${state.paidOrder.id}`)
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
  });

  test("SB-2: Unpaid order is not eligible for booking", async () => {
    const res = await request(app)
      .get(`/api/bookings/eligible/${state.unpaidOrder.id}`)
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reason).toContain("not eligible");
  });

  test("SB-3: Approved credit order is eligible for booking", async () => {
    const res = await request(app)
      .get(`/api/bookings/eligible/${state.creditOrder.id}`)
      .set("Authorization", `Bearer ${state.creditToken}`);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
  });

  test("SB-4: Ready-for-service order is eligible for booking", async () => {
    const res = await request(app)
      .get(`/api/bookings/eligible/${state.readyOrder.id}`)
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
  });

  test("SB-5: Cannot book service for another customer's order", async () => {
    const res = await request(app)
      .get(`/api/bookings/eligible/${state.paidOrder.id}`)
      .set("Authorization", `Bearer ${state.otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.reason).toContain("not belong to you");
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 2: Create Booking
// ════════════════════════════════════════════════════════════════════

describe("Create Booking", () => {
  test("SB-6: Customer can create booking for eligible order", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        orderId: state.paidOrder.id,
        preferredDate: "2026-06-15",
        preferredTime: "morning",
        location: "14 Test Street, Ikeja, Lagos",
        contactName: "Booking Customer",
        contactPhone: "08012345678",
        serviceType: "installation",
        notes: "Please call before arrival",
      });

    expect(res.status).toBe(201);
    expect(res.body.booking).toBeDefined();
    expect(res.body.booking.status).toBe("requested");
    expect(res.body.booking.order_id).toBe(state.paidOrder.id);
    expect(res.body.booking.location).toBe("14 Test Street, Ikeja, Lagos");

    state.booking1 = res.body.booking;
    state.createdBookingIds.push(res.body.booking.id);
  });

  test("SB-7: Cannot create booking for ineligible (unpaid) order", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        orderId: state.unpaidOrder.id,
        preferredDate: "2026-06-20",
        location: "Test Location",
        contactName: "Test",
        contactPhone: "0800000000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not eligible");
  });

  test("SB-8: Cannot create duplicate booking for same order", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        orderId: state.paidOrder.id,
        preferredDate: "2026-07-01",
        location: "Another Location",
        contactName: "Test",
        contactPhone: "0800000000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("booking already exists");
  });

  test("SB-9: Cannot create booking for another customer's order", async () => {
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${state.otherToken}`)
      .send({
        orderId: state.paidOrder.id,
        preferredDate: "2026-06-15",
        location: "Test Location",
        contactName: "Other",
        contactPhone: "0800000000",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not belong to you");
  });

  test("SB-10: Activity log created on booking creation", async () => {
    const activities = await query(
      `SELECT type, description FROM activities WHERE entity_id = $1 AND entity_type = 'booking'`,
      [state.booking1.id]
    );
    expect(activities.rows.length).toBeGreaterThanOrEqual(1);
    expect(activities.rows[0].type).toBe("booking.created");
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 3: Customer Access Control
// ════════════════════════════════════════════════════════════════════

describe("Customer Access Control", () => {
  test("SB-11: Customer can list own bookings", async () => {
    const res = await request(app)
      .get("/api/bookings")
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBeGreaterThanOrEqual(1);
    expect(res.body.bookings.some((b: any) => b.id === state.booking1.id)).toBe(true);
  });

  test("SB-12: Customer can view own booking detail", async () => {
    const res = await request(app)
      .get(`/api/bookings/${state.booking1.id}`)
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.id).toBe(state.booking1.id);
  });

  test("SB-13: Customer cannot view another customer's booking", async () => {
    const res = await request(app)
      .get(`/api/bookings/${state.booking1.id}`)
      .set("Authorization", `Bearer ${state.otherToken}`);

    expect(res.status).toBe(404);
  });

  test("SB-14: Unauthenticated user cannot access bookings", async () => {
    const res = await request(app).get("/api/bookings");
    expect(res.status).toBe(401);

    const res2 = await request(app)
      .post("/api/bookings")
      .send({ orderId: state.paidOrder.id, location: "Test" });
    expect(res2.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 4: Admin Management
// ════════════════════════════════════════════════════════════════════

describe("Admin Management", () => {
  let adminBooking: any;

  beforeAll(async () => {
    // Create a fresh booking for admin tests (using ready order for credit customer)
    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${state.creditToken}`)
      .send({
        orderId: state.creditOrder.id,
        preferredDate: "2026-07-10",
        location: "Admin Test Location",
        contactName: "Admin Test",
        contactPhone: "08098765432",
      });
    adminBooking = res.body.booking;
    state.createdBookingIds.push(adminBooking.id);

    // Create another booking for more testing
    const res2 = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${state.customerToken}`)
      .send({
        orderId: state.readyOrder.id,
        preferredDate: "2026-07-15",
        location: "Second Test Location",
        contactName: "Second",
        contactPhone: "08055555555",
      });
    state.booking2 = res2.body.booking;
    state.createdBookingIds.push(res2.body.booking.id);
  });

  test("SB-15: Admin can list all bookings", async () => {
    const res = await request(app)
      .get("/api/bookings/admin")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings.length).toBeGreaterThanOrEqual(2);
  });

  test("SB-16: Admin can filter bookings by status", async () => {
    const res = await request(app)
      .get("/api/bookings/admin?status=requested")
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings.every((b: any) => b.status === "requested")).toBe(true);
  });

  test("SB-17: Admin can view booking detail", async () => {
    const res = await request(app)
      .get(`/api/bookings/admin/${adminBooking.id}`)
      .set("Authorization", `Bearer ${state.adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.id).toBe(adminBooking.id);
    expect(res.body.booking.customer_name).toBeDefined();
  });

  test("SB-18: Customer user cannot access admin bookings endpoint", async () => {
    const res = await request(app)
      .get("/api/bookings/admin")
      .set("Authorization", `Bearer ${state.customerToken}`);

    expect(res.status).toBe(403);
  });

  test("SB-19: Admin can update booking status (requested → confirmed)", async () => {
    const res = await request(app)
      .patch(`/api/bookings/admin/${adminBooking.id}/status`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("confirmed");
  });

  test("SB-20: Admin can transition confirmed → in_progress → completed", async () => {
    // confirmed → in_progress
    const res1 = await request(app)
      .patch(`/api/bookings/admin/${adminBooking.id}/status`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ status: "in_progress" });

    expect(res1.status).toBe(200);
    expect(res1.body.booking.status).toBe("in_progress");

    // in_progress → completed
    const res2 = await request(app)
      .patch(`/api/bookings/admin/${adminBooking.id}/status`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ status: "completed" });

    expect(res2.status).toBe(200);
    expect(res2.body.booking.status).toBe("completed");
    expect(res2.body.booking.completed_at).not.toBeNull();
  });

  test("SB-21: Invalid status transition is rejected", async () => {
    // Booking is already completed; can't transition from completed
    const res = await request(app)
      .patch(`/api/bookings/admin/${adminBooking.id}/status`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ status: "confirmed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot transition");
  });

  test("SB-22: Admin can reschedule a booking", async () => {
    const res = await request(app)
      .patch(`/api/bookings/admin/${state.booking2.id}/reschedule`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        preferredDate: "2026-08-01",
        preferredTime: "afternoon",
        notes: "Customer requested new date",
      });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("rescheduled");
    expect(res.body.booking.preferred_date).toContain("2026-08-01");
    expect(res.body.booking.preferred_time_slot).toBe("afternoon");
  });

  test("SB-23: Admin can add notes to booking", async () => {
    const res = await request(app)
      .post(`/api/bookings/admin/${state.booking2.id}/notes`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ adminNotes: "Customer prefers weekend visit" });

    expect(res.status).toBe(200);
    expect(res.body.booking.admin_notes).toContain("weekend visit");
  });

  test("SB-24: Cancellation records reason", async () => {
    const res = await request(app)
      .patch(`/api/bookings/admin/${state.booking2.id}/status`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ status: "cancelled", cancellationReason: "Customer cancelled due to change of plans" });

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("cancelled");
    expect(res.body.booking.cancelled_at).not.toBeNull();
    expect(res.body.booking.cancellation_reason).toBe("Customer cancelled due to change of plans");
  });

  test("SB-25: Activity logs created for status changes and reschedules", async () => {
    const activities = await query(
      `SELECT type FROM activities WHERE entity_id = ANY($1::uuid[]) AND entity_type = 'booking' ORDER BY created_at`,
      [state.createdBookingIds]
    );
    const types = activities.rows.map((r: any) => r.type);
    expect(types).toContain("booking.created");
    expect(types).toContain("booking.completed");
    expect(types).toContain("booking.rescheduled");
    expect(types).toContain("booking.cancelled");
  });
});

// ════════════════════════════════════════════════════════════════════
//  SECTION 5: Admin & Ops Role Access
// ════════════════════════════════════════════════════════════════════

describe("Role-Based Access", () => {
  test("SB-26: Admin can access admin booking endpoints", async () => {
    const res = await request(app)
      .get("/api/bookings/admin")
      .set("Authorization", `Bearer ${state.adminToken}`);
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .patch(`/api/bookings/admin/${state.booking2?.id}/status`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ status: "cancelled" });
    // Booking is already cancelled, should be rejected for invalid transition, not 403
    expect(res2.status).not.toBe(403);
  });

  test("SB-27: Non-admin/super_admin role cannot manage bookings", async () => {
    // Customer cannot access admin endpoint
    const res = await request(app)
      .get("/api/bookings/admin")
      .set("Authorization", `Bearer ${state.customerToken}`);
    expect(res.status).toBe(403);
  });
});
