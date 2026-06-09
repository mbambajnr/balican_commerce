import { Router, Response } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

interface TimelineItem {
  type: string;
  title: string;
  description?: string;
  timestamp?: string;
  status: "completed" | "current" | "pending" | "cancelled";
  actorLabel?: string;
  href?: string;
}

function buildTimeline(
  sr: { created_at: string; title: string },
  sq: { created_at: string; quoted_price?: string; provider_company_name?: string },
  sa: { status: string; agreed_at: string; created_at: string; updated_at: string; scout_request_id: string },
  order?: { id: string; order_number: string; created_at: string } | null,
): TimelineItem[] {
  const items: TimelineItem[] = [];

  // 1. Request posted
  items.push({
    type: "request_posted",
    title: "Request posted",
    description: "Buyer created a procurement request",
    timestamp: sr.created_at,
    status: "completed",
    actorLabel: "Buyer",
  });

  // 2. Proposal submitted
  items.push({
    type: "proposal_submitted",
    title: "Proposal submitted",
    description: `${sq.provider_company_name || "Provider"} submitted a proposal`,
    timestamp: sq.created_at,
    status: "completed",
    actorLabel: "Provider",
  });

  // 3. Proposal accepted (same moment agreement was created)
  items.push({
    type: "proposal_accepted",
    title: "Proposal accepted",
    description: "Buyer accepted the provider's proposal",
    timestamp: sa.agreed_at || sa.created_at,
    status: "completed",
    actorLabel: "Buyer",
  });

  // 4. Agreement created
  items.push({
    type: "agreement_created",
    title: "Agreement created",
    description: "Agreement became active",
    timestamp: sa.created_at,
    status: "completed",
  });

  if (sa.status === "cancelled") {
    // 5. Cancelled
    const nextHref = `/scout/${sa.scout_request_id}`;
    items.push({
      type: "agreement_cancelled",
      title: "Agreement cancelled",
      description: "The agreement was cancelled. The scout request has been reopened.",
      timestamp: sa.updated_at,
      status: "cancelled",
      href: nextHref,
    });
  } else if (order) {
    // 5. Order created
    items.push({
      type: "order_created",
      title: "Order created",
      description: `Order ${order.order_number} was created from this agreement`,
      timestamp: order.created_at,
      status: "completed",
      actorLabel: "Buyer",
      href: `/account/orders/${order.id}`,
    });
    // 6. Agreement completed (order conversion completes the agreement)
    items.push({
      type: "agreement_completed",
      title: "Agreement completed",
      description: "Agreement completed after order conversion",
      timestamp: sa.updated_at,
      status: "completed",
    });
  } else {
    // 5. Active - awaiting conversion
    items.push({
      type: "agreement_active",
      title: "Agreement active",
      description: "Agreement is active, awaiting order conversion",
      timestamp: sa.created_at,
      status: "current",
    });
    // 6. Pending step
    items.push({
      type: "convert_to_order",
      title: "Convert to Order",
      description: "Convert this agreement to a purchase order to proceed",
      status: "pending",
    });
  }

  return items;
}

function genOrderNumber() {
  return `AGR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

async function resolveBuyerCompany(req: AuthRequest, res: Response): Promise<string | null> {
  const r = await query(
    "SELECT company_id, account_status FROM users WHERE id = $1",
    [req.userId]
  );
  const row = r.rows[0];
  if (!row?.company_id) { res.status(403).json({ error: "No company associated with this account" }); return null; }
  if (row.account_status !== "active") { res.status(403).json({ error: "Account is not active" }); return null; }
  return row.company_id;
}

async function resolveProviderCompany(req: AuthRequest, res: Response): Promise<string | null> {
  const r = await query(
    `SELECT u.company_id, u.account_status, c.is_provider, c.verification_status, c.status as company_status
     FROM users u JOIN companies c ON c.id = u.company_id
     WHERE u.id = $1`,
    [req.userId]
  );
  const row = r.rows[0];
  if (!row?.company_id) { res.status(403).json({ error: "No company associated with this account" }); return null; }
  if (row.account_status !== "active") { res.status(403).json({ error: "Account is not active" }); return null; }
  if (!row.is_provider) { res.status(403).json({ error: "Only provider companies can access this" }); return null; }
  if (row.verification_status !== "approved") { res.status(403).json({ error: "Provider not yet verified" }); return null; }
  if (row.company_status !== "active") { res.status(403).json({ error: "Company not active" }); return null; }
  return row.company_id;
}

/* ─────────────────────────────────────────
   POST /api/scout/proposals/:id/accept — accept a proposal and create an agreement
   ───────────────────────────────────────── */
const acceptSchema = z.object({
  notes: z.string().max(2000).optional(),
});

router.post(
  "/scout/proposals/:id/accept",
  authenticate,
  requireCompanyActive,
  validate(acceptSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const buyerCompanyId = await resolveBuyerCompany(req, res);
      if (!buyerCompanyId) return;

      const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

      // Fetch the quote (proposal) with the request
      const quoteResult = await query(
        `SELECT sq.*, sr.company_id as request_company_id, sr.status as request_status,
                sr.title as request_title, sr.quantity, sr.unit, sr.description,
                sr.delivery_location, sr.desired_delivery_date,
                c.name as provider_name, c.id as provider_company_id
         FROM scout_quotes sq
         JOIN scout_requests sr ON sr.id = sq.request_id
         JOIN companies c ON c.id = sq.provider_company_id
         WHERE sq.id = $1`,
        [req.params.id]
      );
      if (quoteResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      const quote = quoteResult.rows[0];

      // Verify buyer owns the request (or is admin)
      if (!isAdmin && quote.request_company_id !== buyerCompanyId) {
        return res.status(403).json({ error: "You can only accept proposals on your own requests" });
      }

      // Verify request is open
      if (quote.request_status !== "open") {
        return res.status(400).json({ error: `Request is ${quote.request_status}, not open for acceptance` });
      }

      // Verify quote is pending
      if (quote.status !== "pending") {
        return res.status(400).json({ error: `Proposal is already ${quote.status}` });
      }

      // Check no agreement already exists for this request
      const existingAgreement = await query(
        "SELECT id FROM scout_agreements WHERE scout_request_id = $1 AND status != 'cancelled' LIMIT 1",
        [quote.request_id]
      );
      if (existingAgreement.rows.length > 0) {
        return res.status(409).json({ error: "An active agreement already exists for this request" });
      }

      const { notes } = req.body;

      // Begin transaction
      const agreementResult = await query(
        `INSERT INTO scout_agreements
           (scout_request_id, buyer_company_id, provider_company_id,
            accepted_quote_id, status, agreed_price,
            agreed_delivery_date, payment_terms, notes)
         VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8)
         RETURNING *`,
        [
          quote.request_id, buyerCompanyId, quote.provider_company_id,
          quote.id, quote.quoted_price,
          quote.delivery_date || null, quote.payment_terms || null,
          notes || quote.notes || null,
        ]
      );
      const agreement = agreementResult.rows[0];

      // Mark quote as accepted
      await query(
        "UPDATE scout_quotes SET status = 'accepted', updated_at = NOW() WHERE id = $1",
        [quote.id]
      );

      // Decline all other pending quotes on this request
      await query(
        "UPDATE scout_quotes SET status = 'declined', updated_at = NOW() WHERE request_id = $1 AND id != $2 AND status = 'pending'",
        [quote.request_id, quote.id]
      );

      // Mark request as awarded
      await query(
        "UPDATE scout_requests SET status = 'awarded', updated_at = NOW() WHERE id = $1",
        [quote.request_id]
      );

      res.status(201).json({
        agreement: {
          id: agreement.id,
          scoutRequestId: agreement.scout_request_id,
          buyerCompanyId: agreement.buyer_company_id,
          providerCompanyId: agreement.provider_company_id,
          acceptedQuoteId: agreement.accepted_quote_id,
          status: agreement.status,
          agreedPrice: Number(agreement.agreed_price),
          agreedDeliveryDate: agreement.agreed_delivery_date,
          paymentTerms: agreement.payment_terms,
          notes: agreement.notes,
          agreedAt: agreement.agreed_at,
          createdAt: agreement.created_at,
        },
      });
    } catch (err) {
      console.error("Accept proposal error:", err);
      res.status(500).json({ error: "Failed to accept proposal" });
    }
  }
);

/* ─────────────────────────────────────────
   GET /api/agreements — list agreements
   ───────────────────────────────────────── */
router.get("/agreements", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const r = await query("SELECT u.company_id, u.role FROM users u WHERE u.id = $1", [req.userId]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: any[] = [];

    if (!isAdmin && user.company_id) {
      conditions.push(`(sa.buyer_company_id = $${params.length + 1} OR sa.provider_company_id = $${params.length + 1})`);
      params.push(user.company_id);
    }

    if (status) {
      conditions.push(`sa.status = $${params.length + 1}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [listResult, countResult] = await Promise.all([
      query(
        `SELECT sa.*,
                sr.title as request_title,
                buyer.name as buyer_company_name,
                provider.name as provider_company_name
         FROM scout_agreements sa
         JOIN scout_requests sr ON sr.id = sa.scout_request_id
         JOIN companies buyer ON buyer.id = sa.buyer_company_id
         JOIN companies provider ON provider.id = sa.provider_company_id
         ${where}
         ORDER BY sa.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]
      ),
      query(
        `SELECT COUNT(*) FROM scout_agreements sa ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      agreements: listResult.rows.map((a: any) => ({
        id: a.id,
        scoutRequestId: a.scout_request_id,
        buyerCompanyId: a.buyer_company_id,
        providerCompanyId: a.provider_company_id,
        acceptedQuoteId: a.accepted_quote_id,
        status: a.status,
        agreedPrice: Number(a.agreed_price),
        agreedDeliveryDate: a.agreed_delivery_date,
        paymentTerms: a.payment_terms,
        notes: a.notes,
        orderId: a.order_id,
        agreedAt: a.agreed_at,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        requestTitle: a.request_title,
        buyerCompanyName: a.buyer_company_name,
        providerCompanyName: a.provider_company_name,
      })),
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("List agreements error:", err);
    res.status(500).json({ error: "Failed to list agreements" });
  }
});

/* ─────────────────────────────────────────
   GET /api/agreements/:id — single agreement detail
   ───────────────────────────────────────── */
router.get("/agreements/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const r = await query("SELECT u.company_id, u.role FROM users u WHERE u.id = $1", [req.userId]);
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    const result = await query(
      `SELECT sa.*,
              sr.title as request_title, sr.description as request_description,
              sr.quantity, sr.unit, sr.delivery_location,
              sr.created_at as request_created_at,
              buyer.name as buyer_company_name, buyer.email as buyer_company_email,
              buyer.phone as buyer_company_phone,
              provider.name as provider_company_name,
              provider.email as provider_company_email,
              provider.phone as provider_company_phone,
              provider.logo_url as provider_logo,
              provider.city as provider_city,
              sq.quoted_price, sq.delivery_date as quote_delivery_date,
              sq.payment_terms as quote_payment_terms, sq.notes as quote_notes,
              sq.created_at as quote_created_at,
              o.order_number, o.status as order_status, o.total as order_total,
              o.created_at as order_created_at
       FROM scout_agreements sa
       JOIN scout_requests sr ON sr.id = sa.scout_request_id
       JOIN companies buyer ON buyer.id = sa.buyer_company_id
       JOIN companies provider ON provider.id = sa.provider_company_id
       JOIN scout_quotes sq ON sq.id = sa.accepted_quote_id
       LEFT JOIN orders o ON o.id = sa.order_id
       WHERE sa.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Agreement not found" });
    }

    const a = result.rows[0];

    // Access control: buyer, provider, or admin
    if (!isAdmin && a.buyer_company_id !== user.company_id && a.provider_company_id !== user.company_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const timeline = buildTimeline(
      { created_at: a.request_created_at, title: a.request_title },
      { created_at: a.quote_created_at, quoted_price: a.quoted_price, provider_company_name: a.provider_company_name },
      { status: a.status, agreed_at: a.agreed_at, created_at: a.created_at, updated_at: a.updated_at, scout_request_id: a.scout_request_id },
      a.order_id ? { id: a.order_id, order_number: a.order_number, created_at: a.order_created_at } : null,
    );

    res.json({
      agreement: {
        id: a.id,
        scoutRequestId: a.scout_request_id,
        buyerCompanyId: a.buyer_company_id,
        providerCompanyId: a.provider_company_id,
        acceptedQuoteId: a.accepted_quote_id,
        status: a.status,
        agreedPrice: Number(a.agreed_price),
        agreedDeliveryDate: a.agreed_delivery_date,
        paymentTerms: a.payment_terms,
        notes: a.notes,
        orderId: a.order_id,
        agreedAt: a.agreed_at,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        requestTitle: a.request_title,
        requestDescription: a.request_description,
        quantity: Number(a.quantity),
        unit: a.unit,
        deliveryLocation: a.delivery_location,
        buyerCompanyName: a.buyer_company_name,
        buyerCompanyEmail: a.buyer_company_email,
        buyerCompanyPhone: a.buyer_company_phone,
        providerCompanyName: a.provider_company_name,
        providerCompanyEmail: a.provider_company_email,
        providerCompanyPhone: a.provider_company_phone,
        providerLogo: a.provider_logo,
        providerCity: a.provider_city,
        quotedPrice: Number(a.quoted_price),
        quoteDeliveryDate: a.quote_delivery_date,
        quotePaymentTerms: a.quote_payment_terms,
        quoteNotes: a.quote_notes,
        order: a.order_id ? {
          id: a.order_id,
          orderNumber: a.order_number,
          status: a.order_status,
          total: a.order_total ? Number(a.order_total) : null,
        } : null,
        timeline,
      },
    });
  } catch (err) {
    console.error("Get agreement error:", err);
    res.status(500).json({ error: "Failed to fetch agreement" });
  }
});

/* ─────────────────────────────────────────
   PATCH /api/agreements/:id/status — update agreement status
   ───────────────────────────────────────── */
const updateStatusSchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]),
  reason: z.string().max(2000).optional(),
});

router.patch(
  "/agreements/:id/status",
  authenticate,
  requireCompanyActive,
  validate(updateStatusSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const r = await query("SELECT u.company_id, u.role FROM users u WHERE u.id = $1", [req.userId]);
      const user = r.rows[0];
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const isAdmin = user.role === "admin" || user.role === "super_admin";

      const existing = await query(
        "SELECT * FROM scout_agreements WHERE id = $1",
        [req.params.id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Agreement not found" });
      }

      const agreement = existing.rows[0];

      // Access control
      if (!isAdmin && agreement.buyer_company_id !== user.company_id && agreement.provider_company_id !== user.company_id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { status: newStatus, reason } = req.body;

      // Validation rules
      if (agreement.status === "completed") {
        return res.status(400).json({ error: "Cannot change status of a completed agreement" });
      }
      if (agreement.status === "cancelled") {
        return res.status(400).json({ error: "Cannot change status of a cancelled agreement" });
      }
      if (newStatus === "completed" && !agreement.order_id) {
        return res.status(400).json({ error: "Cannot mark as completed without converting to an order. Use /convert-to-order instead." });
      }

      const updateNotes = reason
        ? (agreement.notes ? `${agreement.notes}\n[Status change: ${agreement.status} → ${newStatus}] ${reason}` : `[Status change: ${agreement.status} → ${newStatus}] ${reason}`)
        : agreement.notes;

      await query(
        "UPDATE scout_agreements SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3",
        [newStatus, updateNotes, req.params.id]
      );

      // If cancelled, reopen the scout request so other proposals can be accepted
      if (newStatus === "cancelled") {
        await query(
          "UPDATE scout_requests SET status = 'open', updated_at = NOW() WHERE id = $1",
          [agreement.scout_request_id]
        );
        // Reset the previously accepted quote back to pending
        await query(
          "UPDATE scout_quotes SET status = 'pending', updated_at = NOW() WHERE id = $1",
          [agreement.accepted_quote_id]
        );
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Update agreement status error:", err);
      res.status(500).json({ error: "Failed to update agreement status" });
    }
  }
);

/* ─────────────────────────────────────────
   POST /api/agreements/:id/convert-to-order — convert an agreement to an order
   ───────────────────────────────────────── */
router.post(
  "/agreements/:id/convert-to-order",
  authenticate,
  requireCompanyActive,
  async (req: AuthRequest, res: Response) => {
    try {
      const buyerCompanyId = await resolveBuyerCompany(req, res);
      if (!buyerCompanyId) return;

      const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

      const agreementResult = await query(
        `SELECT sa.*, sr.title as request_title, sr.description, sr.quantity, sr.unit,
                c.name as provider_name
         FROM scout_agreements sa
         JOIN scout_requests sr ON sr.id = sa.scout_request_id
         JOIN companies c ON c.id = sa.provider_company_id
         WHERE sa.id = $1`,
        [req.params.id]
      );

      if (agreementResult.rows.length === 0) {
        return res.status(404).json({ error: "Agreement not found" });
      }

      const agreement = agreementResult.rows[0];

      // Access control
      if (!isAdmin && agreement.buyer_company_id !== buyerCompanyId) {
        return res.status(403).json({ error: "Only the buyer can convert an agreement to an order" });
      }

      // Agreement must be active
      if (agreement.status !== "active") {
        return res.status(400).json({ error: `Agreement is ${agreement.status}, must be active to convert` });
      }

      // Prevent duplicate conversion
      if (agreement.order_id) {
        return res.status(409).json({
          error: "Already converted to order",
          code: "ALREADY_CONVERTED",
        });
      }

      // Build order items
      const orderItems = [{
        name: agreement.request_title,
        price: Number(agreement.agreed_price),
        quantity: Number(agreement.quantity),
        unit: agreement.unit || null,
        notes: agreement.description || null,
        supplierName: agreement.provider_name,
      }];

      const subtotal = Number(agreement.agreed_price) * Number(agreement.quantity);
      const total = Math.round(subtotal * 100) / 100;
      const orderNumber = genOrderNumber();

      // Insert order
      const orderResult = await query(
        `INSERT INTO orders
           (user_id, order_number, items, subtotal, tax, total, status, payment_status,
            payment_method, payment_terms, order_source, scout_request_id, notes,
            agreement_id)
         VALUES ($1,$2,$3,$4,0,$5,'pending','unpaid','bank_transfer',$6,'scout',$7,$8,$9)
         RETURNING id, order_number, subtotal, total, status, created_at`,
        [
          req.userId, orderNumber, JSON.stringify(orderItems),
          subtotal, total,
          agreement.payment_terms || null,
          agreement.scout_request_id,
          `Order from agreement: ${agreement.request_title}`,
          agreement.id,
        ]
      );
      const order = orderResult.rows[0];

      // Update agreement with order_id and mark completed
      await query(
        "UPDATE scout_agreements SET order_id = $1, status = 'completed', updated_at = NOW() WHERE id = $2",
        [order.id, agreement.id]
      );

      res.status(201).json({ success: true, order });
    } catch (err) {
      console.error("Convert to order error:", err);
      res.status(500).json({ error: "Failed to convert to order" });
    }
  }
);

export default router;
