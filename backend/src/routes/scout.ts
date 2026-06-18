import { Router, Response } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { dispatchOpportunityNotifications } from "../services/opportunity-notifications";
import { trackCompanyActivation, trackFunnelEvent } from "../services/funnel-events";

const router = Router();

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

/** Resolve company_id for the authenticated user. Returns null + 403 on failure. */
async function resolveCompany(req: AuthRequest, res: Response): Promise<string | null> {
  const r = await query(
    "SELECT company_id, account_status FROM users WHERE id = $1",
    [req.userId]
  );
  const row = r.rows[0];
  if (!row?.company_id) { res.status(403).json({ error: "No company associated with this account" }); return null; }
  if (row.account_status !== "active") { res.status(403).json({ error: "Account is not active" }); return null; }
  return row.company_id;
}

/** Resolve provider company — must be is_provider + verified + active. */
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
  if (!row.is_provider) { res.status(403).json({ error: "Only provider companies can submit quotes" }); return null; }
  if (row.verification_status !== "approved") { res.status(403).json({ error: "Provider not yet verified" }); return null; }
  if (row.company_status !== "active") { res.status(403).json({ error: "Company not active" }); return null; }
  return row.company_id;
}

function genOrderNumber() {
  return `SCT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

/* ─────────────────────────────────────────
   Schemas
───────────────────────────────────────── */

const createRequestSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(5000).optional(),
  quantity: z.number().positive(),
  unit: z.string().max(50).optional(),
  deliveryLocation: z.string().max(500).optional(),
  desiredDeliveryDate: z.string().optional(),  // ISO date
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  notes: z.string().max(5000).optional(),
  categoryId: z.string().uuid().optional(),
  requestType: z.enum(["product", "service"]).optional(),
});

const submitQuoteSchema = z.object({
  quotedPrice: z.number().positive(),
  deliveryDate: z.string().optional(),
  paymentTerms: z.string().max(300).optional(),
  notes: z.string().max(5000).optional(),
});

/* ═══════════════════════════════════════════
   CUSTOMER ROUTES
═══════════════════════════════════════════ */

/* POST /scout/requests — create a Scout request */
router.post(
  "/scout/requests",
  authenticate,
  requireCompanyActive,
  validate(createRequestSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = await resolveCompany(req, res);
      if (!companyId) return;

      const {
        title, description, quantity, unit,
        deliveryLocation, desiredDeliveryDate,
        budgetMin, budgetMax, notes,
        categoryId, requestType,
      } = req.body;

      const result = await query(
        `INSERT INTO scout_requests
           (company_id, created_by, title, description, quantity, unit,
            delivery_location, desired_delivery_date, budget_min, budget_max, notes,
            category_id, request_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          companyId, req.userId, title, description || null,
          quantity, unit || null, deliveryLocation || null,
          desiredDeliveryDate || null, budgetMin ?? null, budgetMax ?? null,
          notes || null, categoryId || null, requestType || "product",
        ]
      );

      await dispatchOpportunityNotifications(result.rows[0].id, "new").catch((err) => {
        console.error("Scout opportunity notification error:", err);
      });
      void Promise.all([
        trackCompanyActivation({ companyId, userId: req.userId, entityType: "scout_request", entityId: result.rows[0].id }),
        trackFunnelEvent({
          eventName: "sourcing_request_created",
          eventKey: `sourcing_request_created:${result.rows[0].id}`,
          companyId,
          userId: req.userId,
          entityType: "scout_request",
          entityId: result.rows[0].id,
          metadata: { categoryId: categoryId || null, requestType: requestType || "product" },
        }),
      ]);

      res.status(201).json({ request: result.rows[0] });
    } catch (err) {
      console.error("Scout create request error:", err);
      res.status(500).json({ error: "Failed to create Scout request" });
    }
  }
);

/* GET /scout/requests — list customer's own Scout requests */
router.get("/scout/requests", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveCompany(req, res);
    if (!companyId) return;

    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ["sr.company_id = $1"];
    const params: any[] = [companyId];

    if (status) { conditions.push(`sr.status = $${params.length + 1}`); params.push(status); }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const [listResult, countResult] = await Promise.all([
      query(
        `SELECT sr.*,
                cat.name as category_name,
                (SELECT COUNT(*) FROM scout_quotes sq WHERE sq.request_id = sr.id) as quote_count
         FROM scout_requests sr
         LEFT JOIN categories cat ON cat.id = sr.category_id
         ${where}
         ORDER BY sr.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]
      ),
      query(`SELECT COUNT(*) FROM scout_requests sr ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      requests: listResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Scout list requests error:", err);
    res.status(500).json({ error: "Failed to list Scout requests" });
  }
});

/* GET /scout/requests/:id — customer: request + all quotes */
router.get("/scout/requests/:id", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveCompany(req, res);
    if (!companyId) return;

    const reqResult = await query(
      "SELECT * FROM scout_requests WHERE id = $1 AND company_id = $2",
      [req.params.id, companyId]
    );
    if (reqResult.rows.length === 0) return res.status(404).json({ error: "Scout request not found" });

    const quotesResult = await query(
      `SELECT sq.*,
              c.name as provider_name, c.logo_url as provider_logo,
              c.city as provider_city, c.verification_status as provider_verification,
              sa.id as agreement_id
       FROM scout_quotes sq
       JOIN companies c ON c.id = sq.provider_company_id
       LEFT JOIN scout_agreements sa ON sa.accepted_quote_id = sq.id
       WHERE sq.request_id = $1
       ORDER BY sq.quoted_price ASC, sq.created_at ASC`,
      [req.params.id]
    );

    res.json({ request: reqResult.rows[0], quotes: quotesResult.rows });
  } catch (err) {
    console.error("Scout get request error:", err);
    res.status(500).json({ error: "Failed to fetch Scout request" });
  }
});

/* PATCH /scout/requests/:id/cancel — customer cancels */
router.patch("/scout/requests/:id/cancel", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveCompany(req, res);
    if (!companyId) return;

    const existing = await query(
      "SELECT id, status FROM scout_requests WHERE id = $1 AND company_id = $2",
      [req.params.id, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Scout request not found" });
    if (existing.rows[0].status !== "open") {
      return res.status(400).json({ error: `Cannot cancel a request that is already ${existing.rows[0].status}` });
    }

    await query(
      "UPDATE scout_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Scout cancel error:", err);
    res.status(500).json({ error: "Failed to cancel Scout request" });
  }
});

/* POST /scout/requests/:id/accept-quote/:quoteId — accept a quote + create order */
router.post(
  "/scout/requests/:id/accept-quote/:quoteId",
  authenticate,
  requireCompanyActive,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = await resolveCompany(req, res);
      if (!companyId) return;

      // Verify request belongs to this buyer and is open
      const reqResult = await query(
        "SELECT * FROM scout_requests WHERE id = $1 AND company_id = $2",
        [req.params.id, companyId]
      );
      if (reqResult.rows.length === 0) return res.status(404).json({ error: "Scout request not found" });
      const scoutReq = reqResult.rows[0];
      if (scoutReq.status !== "open") {
        return res.status(400).json({ error: `Request is already ${scoutReq.status}` });
      }

      // Verify the quote belongs to this request and is pending
      const quoteResult = await query(
        "SELECT sq.*, c.name as provider_name FROM scout_quotes sq JOIN companies c ON c.id = sq.provider_company_id WHERE sq.id = $1 AND sq.request_id = $2",
        [req.params.quoteId, req.params.id]
      );
      if (quoteResult.rows.length === 0) return res.status(404).json({ error: "Quote not found" });
      const quote = quoteResult.rows[0];
      if (quote.status !== "pending") {
        return res.status(400).json({ error: `Quote is already ${quote.status}` });
      }

      // Prevent duplicate conversion
      const existingOrder = await query(
        "SELECT id, order_number FROM orders WHERE scout_request_id = $1",
        [req.params.id]
      );
      if (existingOrder.rows.length > 0) {
        return res.status(409).json({
          error: "Already converted to order",
          order_number: existingOrder.rows[0].order_number,
          code: "ALREADY_CONVERTED",
        });
      }

      // Build order items
      const orderItems = [{
        name: scoutReq.title,
        price: Number(quote.quoted_price),
        quantity: Number(scoutReq.quantity),
        unit: scoutReq.unit || null,
        notes: scoutReq.description || null,
        supplierName: quote.provider_name,
      }];
      const subtotal = Number(quote.quoted_price) * Number(scoutReq.quantity);
      const total = Math.round(subtotal * 100) / 100;
      const orderNumber = genOrderNumber();

      // All mutations in sequence (no nested transaction helper needed)
      const orderResult = await query(
        `INSERT INTO orders
           (user_id, order_number, items, subtotal, tax, total, status, payment_status,
            payment_method, payment_terms, order_source, scout_request_id, notes)
         VALUES ($1,$2,$3,$4,0,$5,'pending','unpaid','bank_transfer',$6,'scout',$7,$8)
         RETURNING id, order_number, subtotal, total, status, created_at`,
        [
          req.userId, orderNumber, JSON.stringify(orderItems),
          subtotal, total,
          quote.payment_terms || null,
          req.params.id,
          `Scout order from: ${scoutReq.title}`,
        ]
      );
      const order = orderResult.rows[0];

      // Mark accepted quote
      await query(
        "UPDATE scout_quotes SET status = 'accepted', order_id = $1, updated_at = NOW() WHERE id = $2",
        [order.id, quote.id]
      );

      // Decline all competing quotes
      await query(
        "UPDATE scout_quotes SET status = 'declined', updated_at = NOW() WHERE request_id = $1 AND id != $2 AND status = 'pending'",
        [req.params.id, quote.id]
      );

      // Mark Scout request as awarded
      await query(
        "UPDATE scout_requests SET status = 'awarded', updated_at = NOW() WHERE id = $1",
        [req.params.id]
      );

      void Promise.all([
        trackFunnelEvent({
          eventName: "proposal_accepted",
          eventKey: `proposal_accepted:${quote.id}`,
          companyId,
          userId: req.userId,
          entityType: "scout_quote",
          entityId: quote.id,
          metadata: { requestId: req.params.id, providerCompanyId: quote.provider_company_id },
        }),
        trackFunnelEvent({
          eventName: "procurement_order_created",
          eventKey: `procurement_order_created:${order.id}`,
          companyId,
          userId: req.userId,
          entityType: "order",
          entityId: order.id,
          metadata: { requestId: req.params.id, source: "scout" },
        }),
      ]);

      res.status(201).json({ success: true, order });
    } catch (err) {
      console.error("Scout accept quote error:", err);
      res.status(500).json({ error: "Failed to accept quote" });
    }
  }
);

/* ═══════════════════════════════════════════
   SUPPLIER ROUTES
═══════════════════════════════════════════ */

/* GET /scout/available — open requests any verified supplier can quote on */
router.get("/scout/available", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const {
      search, category, location, requestType,
      deliveryDateBefore, page = "1", limit = "20",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ["sr.status = 'open'"];
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(sr.title ILIKE $${params.length} OR sr.description ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      conditions.push(`sr.category_id = $${params.length}`);
    }
    if (location) {
      params.push(`%${location}%`);
      conditions.push(`sr.delivery_location ILIKE $${params.length}`);
    }
    if (requestType) {
      params.push(requestType);
      conditions.push(`sr.request_type = $${params.length}`);
    }
    if (deliveryDateBefore) {
      params.push(deliveryDateBefore);
      conditions.push(`sr.desired_delivery_date <= $${params.length}::date`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // providerCompanyId is always the first extra param after the filter params
    const [listResult, countResult] = await Promise.all([
      query(
        `SELECT sr.*,
                cat.name as category_name,
                bc.name as buyer_company_name,
                bc.city as buyer_city,
                (SELECT COUNT(*) FROM scout_quotes sq WHERE sq.request_id = sr.id) as quote_count,
                (SELECT sq2.status FROM scout_quotes sq2
                 WHERE sq2.request_id = sr.id AND sq2.provider_company_id = $${params.length + 1}
                 LIMIT 1) as my_quote_status
         FROM scout_requests sr
         LEFT JOIN categories cat ON cat.id = sr.category_id
         JOIN companies bc ON bc.id = sr.company_id
         ${where}
         ORDER BY sr.created_at DESC
         LIMIT $${params.length + 2} OFFSET $${params.length + 3}`,
        [...params, providerCompanyId, limitNum, offset]
      ),
      query(
        `SELECT COUNT(*) FROM scout_requests sr
         LEFT JOIN categories cat ON cat.id = sr.category_id
         ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      requests: listResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Scout available requests error:", err);
    res.status(500).json({ error: "Failed to list available Scout requests" });
  }
});

/* GET /scout/requests/:id/my-quote — supplier views their quote on a request */
router.get("/scout/requests/:id/my-quote", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const reqRow = await query(
      "SELECT id, title, description, quantity, unit, delivery_location, desired_delivery_date, budget_min, budget_max, notes, status FROM scout_requests WHERE id = $1 AND status IN ('open','awarded')",
      [req.params.id]
    );
    if (reqRow.rows.length === 0) return res.status(404).json({ error: "Scout request not found or not open" });

    const quoteRow = await query(
      "SELECT * FROM scout_quotes WHERE request_id = $1 AND provider_company_id = $2",
      [req.params.id, providerCompanyId]
    );

    res.json({ request: reqRow.rows[0], quote: quoteRow.rows[0] || null });
  } catch (err) {
    console.error("Scout my-quote error:", err);
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

/* POST /scout/requests/:id/quote — supplier submits or updates their quote */
router.post(
  "/scout/requests/:id/quote",
  authenticate,
  requireCompanyActive,
  validate(submitQuoteSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const providerCompanyId = await resolveProviderCompany(req, res);
      if (!providerCompanyId) return;

      const reqRow = await query(
        "SELECT id, status FROM scout_requests WHERE id = $1",
        [req.params.id]
      );
      if (reqRow.rows.length === 0) return res.status(404).json({ error: "Scout request not found" });
      if (reqRow.rows[0].status !== "open") {
        return res.status(400).json({ error: "This Scout request is no longer open for quotes" });
      }

      const { quotedPrice, deliveryDate, paymentTerms, notes } = req.body;

      // Upsert — one quote per provider per request
      const result = await query(
        `INSERT INTO scout_quotes
           (request_id, provider_company_id, submitted_by, quoted_price, delivery_date, payment_terms, notes)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7)
         ON CONFLICT (request_id, provider_company_id) DO UPDATE SET
           submitted_by   = EXCLUDED.submitted_by,
           quoted_price   = EXCLUDED.quoted_price,
           delivery_date  = EXCLUDED.delivery_date,
           payment_terms  = EXCLUDED.payment_terms,
           notes          = EXCLUDED.notes,
           status         = 'pending',
           updated_at     = NOW()
         RETURNING *`,
        [
          req.params.id, providerCompanyId, req.userId,
          quotedPrice, deliveryDate || null, paymentTerms || null, notes || null,
        ]
      );

      res.status(201).json({ quote: result.rows[0] });
    } catch (err) {
      console.error("Scout submit quote error:", err);
      res.status(500).json({ error: "Failed to submit quote" });
    }
  }
);

export default router;
