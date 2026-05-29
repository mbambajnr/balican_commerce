import { Router, Response } from "express";
import { z } from "zod";
import { query, transaction } from "../config/db";
import { authenticate, requireAdmin, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { notifyAndLog } from "../services/notifications";

const router = Router();

const VALID_STATUSES = ["requested", "confirmed", "rescheduled", "in_progress", "completed", "cancelled"] as const;

async function logActivity(entityType: string, entityId: string, type: string, description: string, metadata: Record<string, any> = {}, userId?: string) {
  await query(
    `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, type, description, JSON.stringify(metadata), userId || null]
  );
}

async function isEligibleForBooking(orderId: string, userId: string): Promise<{ eligible: boolean; reason?: string }> {
  const result = await query(
    `SELECT o.id, o.user_id, o.payment_method, o.payment_status, o.status, o.total,
            o.ready_for_service,
            u.is_credit_approved, u.credit_limit, u.outstanding_balance
     FROM orders o
     JOIN users u ON o.user_id = u.id
     WHERE o.id = $1`,
    [orderId]
  );

  if (result.rows.length === 0) return { eligible: false, reason: "Order not found" };

  const order = result.rows[0];
  if (order.user_id !== userId) return { eligible: false, reason: "Order does not belong to you" };

  const existing = await query(
    `SELECT id, status FROM service_bookings WHERE order_id = $1 AND status NOT IN ('cancelled')`,
    [orderId]
  );
  if (existing.rows.length > 0) {
    return { eligible: false, reason: "A booking already exists for this order" };
  }

  if (order.payment_status === "paid") return { eligible: true };

  if (order.payment_method === "credit" && order.is_credit_approved) {
    const balanceAfter = parseFloat(order.outstanding_balance || 0);
    if (order.credit_limit === 0 || balanceAfter <= parseFloat(order.credit_limit || 0)) {
      return { eligible: true };
    }
    return { eligible: false, reason: "Order credit limit exceeded" };
  }

  if (order.ready_for_service === true) return { eligible: true };

  return { eligible: false, reason: "Order is not eligible for service booking. Only paid orders can book service." };
}

// ════════════════════════════════════════════════════════════════════
//  Eligibility Check
// ════════════════════════════════════════════════════════════════════

router.get("/eligible/:orderId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await isEligibleForBooking(req.params.orderId, req.userId!);
    res.json(result);
  } catch (err) {
    console.error("Eligibility check error:", err);
    res.status(500).json({ error: "Failed to check eligibility" });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Create Booking
// ════════════════════════════════════════════════════════════════════

const createBookingSchema = z.object({
  orderId: z.string().uuid(),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTime: z.string().optional(),
  location: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  serviceType: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/", authenticate, requireCompanyActive, validate(createBookingSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { orderId, preferredDate, preferredTime, location, contactName, contactPhone, serviceType, notes } = req.body;

    const eligibility = await isEligibleForBooking(orderId, req.userId!);
    if (!eligibility.eligible) {
      return res.status(400).json({ error: eligibility.reason });
    }

    const result = await transaction(async (client) => {
      const existing = await client.query(
        `SELECT id, status FROM service_bookings WHERE order_id = $1 AND status NOT IN ('cancelled') FOR UPDATE`,
        [orderId]
      );
      if (existing.rows.length > 0) {
        throw new Error("ACTIVE_BOOKING_EXISTS");
      }

      const bookingResult = await client.query(
        `INSERT INTO service_bookings (order_id, user_id, preferred_date, preferred_time_slot, location, contact_name, contact_phone, service_type, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'requested')
         RETURNING *`,
        [orderId, req.userId, preferredDate, preferredTime || null, location, contactName, contactPhone || null, serviceType || "installation", notes || null]
      );

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["booking", bookingResult.rows[0].id, "booking.created",
         `Service booking created for order`, JSON.stringify({ orderId }), req.userId]
      );

      return bookingResult.rows[0];
    });

    res.status(201).json({ booking: result });

    const userInfo = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [req.userId]);
    await notifyAndLog({
      recipientEmail: userInfo.rows[0].email,
      recipientName: `${userInfo.rows[0].first_name} ${userInfo.rows[0].last_name}`,
      subject: "Service Booking Request Received",
      body: `Your service booking #${result.booking_number} has been received and is pending confirmation.`,
      eventType: "booking.requested",
      entityType: "booking",
      entityId: result.id,
      performedBy: req.userId!,
    }).catch(() => {});
  } catch (err: any) {
    if (err.message === "ACTIVE_BOOKING_EXISTS" || err.code === "23505") {
      return res.status(400).json({ error: "A booking already exists for this order" });
    }
    console.error("Create booking error:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Customer: list own bookings
// ════════════════════════════════════════════════════════════════════

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT b.*, o.order_number, o.total as order_total, o.payment_method, o.payment_status,
              q.quotation_number
       FROM service_bookings b
       LEFT JOIN orders o ON b.order_id = o.id
       LEFT JOIN quotations q ON b.quotation_id = q.id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [req.userId]
    );

    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("Get customer bookings error:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Admin routes (must be before /:id wildcard)
// ════════════════════════════════════════════════════════════════════

// Admin: list all bookings
router.get("/admin", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (status && VALID_STATUSES.includes(status as any)) {
      conditions.push(`b.status = $${params.length + 1}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(o.order_number ILIKE $${params.length + 1} OR b.location ILIKE $${params.length + 1} OR b.contact_name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT b.*, o.order_number, o.total as order_total, o.payment_method, o.payment_status,
              u.first_name || ' ' || u.last_name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM service_bookings b
       LEFT JOIN orders o ON b.order_id = o.id
       LEFT JOIN users u ON b.user_id = u.id
       ${where}
       ORDER BY b.created_at DESC`,
      params
    );

    res.json({ bookings: result.rows });
  } catch (err) {
    console.error("Get admin bookings error:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// Admin: get single booking
router.get("/admin/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT b.*, o.order_number, o.total as order_total, o.payment_method, o.payment_status,
              o.items as order_items, o.created_at as order_created_at,
              u.first_name || ' ' || u.last_name as customer_name, u.email as customer_email, u.phone as customer_phone,
              q.quotation_number
       FROM service_bookings b
       LEFT JOIN orders o ON b.order_id = o.id
       LEFT JOIN users u ON b.user_id = u.id
       LEFT JOIN quotations q ON b.quotation_id = q.id
       WHERE b.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ booking: result.rows[0] });
  } catch (err) {
    console.error("Get admin booking error:", err);
    res.status(500).json({ error: "Failed to fetch booking" });
  }
});

// Admin: update booking status
const statusUpdateSchema = z.object({
  status: z.enum(VALID_STATUSES),
  cancellationReason: z.string().optional(),
});

router.patch("/admin/:id/status", authenticate, requireAdmin, validate(statusUpdateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { status, cancellationReason } = req.body;

    const result = await transaction(async (client) => {
      const booking = await client.query(
        `SELECT b.*, u.email AS booking_user_email, u.first_name || ' ' || u.last_name AS booking_user_name
         FROM service_bookings b
         JOIN users u ON b.user_id = u.id
         WHERE b.id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (booking.rows.length === 0) {
        throw new Error("Booking not found");
      }

      const currentStatus = booking.rows[0].status;
      const allowedTransitions: Record<string, string[]> = {
        requested: ["confirmed", "cancelled"],
        confirmed: ["rescheduled", "in_progress", "cancelled"],
        rescheduled: ["confirmed", "in_progress", "cancelled"],
        in_progress: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };

      if (!allowedTransitions[currentStatus]?.includes(status)) {
        throw Object.assign(new Error("INVALID_TRANSITION"), {
          currentStatus,
          allowedTransitions: allowedTransitions[currentStatus] || [],
          newStatus: status,
        });
      }

      const setFields: string[] = ["status = $1"];
      const params: any[] = [status];

      if (status === "completed") {
        setFields.push("completed_at = NOW()");
      }
      if (status === "cancelled") {
        setFields.push("cancelled_at = NOW()");
        setFields.push(`cancellation_reason = $${params.length + 1}`);
        params.push(cancellationReason || null);
      }

      setFields.push("updated_at = NOW()");
      params.push(req.params.id);

      const lastIdx = params.length;
      const updateResult = await client.query(
        `UPDATE service_bookings SET ${setFields.join(", ")} WHERE id = $${lastIdx} RETURNING *`,
        params
      );

      const description = `Booking status changed from "${currentStatus}" to "${status}"`;
      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["booking", updateResult.rows[0].id, `booking.${status}`,
         description, JSON.stringify({ previousStatus: currentStatus, newStatus: status, cancellationReason }), req.userId]
      );

      return { booking: updateResult.rows[0], bookingUserEmail: booking.rows[0].booking_user_email, bookingUserName: booking.rows[0].booking_user_name };
    });

    await notifyAndLog({
      recipientEmail: result.bookingUserEmail,
      recipientName: result.bookingUserName,
      subject: `Booking ${status}`,
      body: `Your service booking #${result.booking.booking_number} has been marked as ${status}.`,
      eventType: `booking.${status}` as any,
      entityType: "booking",
      entityId: req.params.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.json({ booking: result.booking });
  } catch (err: any) {
    if (err.message === "Booking not found") return res.status(404).json({ error: "Booking not found" });
    if (err.message === "INVALID_TRANSITION") {
      return res.status(400).json({
        error: `Cannot transition from "${err.currentStatus}" to "${err.newStatus}". Allowed transitions: ${err.allowedTransitions.join(", ") || "none"}`,
        currentStatus: err.currentStatus,
        allowedTransitions: err.allowedTransitions,
      });
    }
    console.error("Update booking status error:", err);
    res.status(500).json({ error: "Failed to update booking status" });
  }
});

// Admin: reschedule booking
const rescheduleSchema = z.object({
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTime: z.string().optional(),
  confirmedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  confirmedTimeSlot: z.string().optional(),
  notes: z.string().optional(),
});

router.patch("/admin/:id/reschedule", authenticate, requireAdmin, validate(rescheduleSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { preferredDate, preferredTime, confirmedDate, confirmedTimeSlot, notes } = req.body;

    const booking = await query(
      `SELECT b.*, u.email AS booking_user_email, u.first_name || ' ' || u.last_name AS booking_user_name
       FROM service_bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (booking.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const currentStatus = booking.rows[0].status;
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      return res.status(400).json({ error: `Cannot reschedule a ${currentStatus} booking` });
    }

    const result = await query(
      `UPDATE service_bookings
       SET preferred_date = $1, preferred_time_slot = $2,
           confirmed_date = COALESCE($3, confirmed_date),
           confirmed_time_slot = COALESCE($4, confirmed_time_slot),
           admin_notes = CASE WHEN $5::text IS NOT NULL THEN COALESCE(admin_notes, '') || E'\\n---\\n' || $5::text ELSE admin_notes END,
           status = 'rescheduled', updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [preferredDate, preferredTime || null, confirmedDate || null, confirmedTimeSlot || null,
       notes || null, req.params.id]
    );

    await logActivity("booking", result.rows[0].id, "booking.rescheduled",
      `Booking rescheduled to ${preferredDate}`, { preferredDate, preferredTime, confirmedDate, confirmedTimeSlot }, req.userId);

    await notifyAndLog({
      recipientEmail: booking.rows[0].booking_user_email,
      recipientName: booking.rows[0].booking_user_name,
      subject: "Booking Rescheduled",
      body: `Your service booking #${result.rows[0].booking_number} has been rescheduled.`,
      eventType: "booking.rescheduled",
      entityType: "booking",
      entityId: req.params.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.json({ booking: result.rows[0] });
  } catch (err) {
    console.error("Reschedule booking error:", err);
    res.status(500).json({ error: "Failed to reschedule booking" });
  }
});

/* ── Admin: convert booking to service order ── */

router.post("/admin/:id/convert-to-service-order", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await transaction(async (client) => {
      const bookingResult = await client.query(
        `SELECT * FROM service_bookings WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (bookingResult.rows.length === 0) throw new Error("Booking not found");

      const booking = bookingResult.rows[0];

      let linkedOrderItems: any[] = [];
      let linkedOrderQuotationId: string | null = null;
      let linkedOrderRfqId: string | null = null;
      if (booking.order_id) {
        const ord = await client.query("SELECT id, items, quotation_id, rfq_id FROM orders WHERE id = $1", [booking.order_id]);
        if (ord.rows.length > 0) {
          linkedOrderItems = ord.rows[0].items || [];
          linkedOrderQuotationId = ord.rows[0].quotation_id;
          linkedOrderRfqId = ord.rows[0].rfq_id;
        }
      }
      if (booking.status === "completed" || booking.status === "cancelled") {
        throw new Error(`Cannot create service order from a ${booking.status} booking`);
      }

      const existingServiceOrder = await client.query(
        `SELECT id FROM orders WHERE booking_id = $1 LIMIT 1`,
        [req.params.id]
      );
      if (existingServiceOrder.rows.length > 0) {
        throw new Error("A service order already exists for this booking");
      }

      const orderNumber = `SRV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const serviceOrderResult = await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status,
          payment_method, payment_status, amount_paid, outstanding_amount,
          order_type, service_type, service_description, site_location,
          scheduled_date, scheduled_time, linked_sales_order_id, booking_id,
          quotation_id, rfq_id, notes)
         VALUES ($1, $2, $3, 0, 0, 0, 'pending', NULL, 'unpaid', 0, 0,
          'service', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          booking.user_id,
          orderNumber,
          JSON.stringify(linkedOrderItems),
          booking.service_type || null,
          booking.notes || null,
          booking.location || null,
          booking.preferred_date || null,
          booking.preferred_time_slot || null,
          booking.order_id || null,
          req.params.id,
          linkedOrderQuotationId,
          linkedOrderRfqId,
          `Service order created from booking #${req.params.id.substring(0, 8)}`,
        ]
      );

      await client.query(
        `UPDATE service_bookings SET status = 'confirmed', confirmed_date = COALESCE(confirmed_date, NOW()::date), updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", serviceOrderResult.rows[0].id, "service_order.created",
         `Service order ${orderNumber} created from booking`,
         JSON.stringify({ bookingId: req.params.id, bookingNumber: booking.booking_number }), req.userId]
      );

      return serviceOrderResult.rows[0];
    });

    res.status(201).json({ serviceOrder: result });
  } catch (err: any) {
    if (err.message === "Booking not found") return res.status(404).json({ error: "Booking not found" });
    if (err.message?.includes("cannot create service order from") || err.message?.includes("already exists")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Convert booking to service order error:", err);
    res.status(500).json({ error: "Failed to convert booking to service order" });
  }
});

// Admin: add notes to booking
const notesSchema = z.object({
  adminNotes: z.string().min(1),
});

router.post("/admin/:id/notes", authenticate, requireAdmin, validate(notesSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { adminNotes } = req.body;

    const result = await query(
      `UPDATE service_bookings
       SET admin_notes = CASE WHEN admin_notes IS NULL THEN $1 ELSE admin_notes || E'\\n---\\n' || $1 END,
           updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [adminNotes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    await logActivity("booking", result.rows[0].id, "booking.note_added",
      `Admin note added to booking`, { note: adminNotes }, req.userId);

    res.json({ booking: result.rows[0] });
  } catch (err) {
    console.error("Add booking note error:", err);
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Customer: get single booking
//  (Must be after admin routes to avoid "admin" being treated as an ID)
// ════════════════════════════════════════════════════════════════════

router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT b.*, o.order_number, o.total as order_total, o.payment_method, o.payment_status,
              q.quotation_number
       FROM service_bookings b
       LEFT JOIN orders o ON b.order_id = o.id
       LEFT JOIN quotations q ON b.quotation_id = q.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json({ booking: result.rows[0] });
  } catch (err) {
    console.error("Get booking error:", err);
    res.status(500).json({ error: "Failed to fetch booking" });
  }
});

export default router;
