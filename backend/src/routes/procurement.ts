import { Router, Response } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate, requireAdmin, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { logProcurementActivity } from "../services/procurement-activity";
import { trackFunnelEvent } from "../services/funnel-events";

const router = Router();

/* ── Helpers ── */

/** Resolve user's company_id. Returns 403 if no company. */
async function resolveUserCompany(req: AuthRequest, res: Response): Promise<string | null> {
  const result = await query("SELECT company_id, company_role, account_status FROM users WHERE id = $1", [req.userId]);
  if (!result.rows[0]?.company_id) { res.status(403).json({ error: "No company" }); return null; }
  return result.rows[0].company_id;
}

/** Resolve provider's company_id. Returns 403 if not a verified provider. */
async function resolveProviderCompany(req: AuthRequest, res: Response): Promise<string | null> {
  const result = await query(
    `SELECT u.company_id, c.is_provider, c.verification_status, c.status
     FROM users u JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
    [req.userId]
  );
  if (!result.rows[0]?.company_id) { res.status(403).json({ error: "No company" }); return null; }
  const r = result.rows[0];
  if (!r.is_provider) { res.status(403).json({ error: "Not a provider company" }); return null; }
  if (r.status !== "active") { res.status(403).json({ error: "Company not active" }); return null; }
  if (r.verification_status !== "approved") { res.status(403).json({ error: "Provider not verified" }); return null; }
  return r.company_id;
}

/* ═══════════════════════════════════════════════
   BUYER APIs
   ═══════════════════════════════════════════════ */

/* ── List available providers to invite ── */
router.get("/procurement/providers", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const { type, search, creditTier, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [
      "c.is_provider = true",
      "c.status = 'active'",
      "c.verification_status = 'approved'",
    ];

    if (type === "service") conds.push("c.company_type IN ('service_provider', 'both_supplier_and_service_provider')");
    if (type === "product") conds.push("c.company_type IN ('supplier', 'both_supplier_and_service_provider')");
    if (search) { params.push(`%${search}%`); conds.push(`(c.name ILIKE $${params.length} OR c.description ILIKE $${params.length})`); }
    if (creditTier) { params.push(creditTier); conds.push(`scp.credit_tier = $${params.length}`); }

    const joins = "LEFT JOIN supplier_credit_profiles scp ON scp.company_id = c.id";
    const where = `WHERE ${conds.join(" AND ")}`;
    const countResult = await query(`SELECT COUNT(*) FROM companies c ${joins} ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT c.id, c.name, c.description, c.logo_url, c.company_type, c.business_categories,
              c.service_areas, c.website, scp.credit_tier
       FROM companies c ${joins} ${where}
       ORDER BY c.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({ providers: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("Procurement providers list error:", err);
    res.status(500).json({ error: "Failed to list providers" });
  }
});

/* ── Create procurement request ── */
router.post("/procurement/requests", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const { title, description, requestType, deliveryLocation, preferredTimeline, estimatedBudget, notes, isUrgent, items, providerIds } = req.body;

    if (!title) return res.status(400).json({ error: "Title is required" });
    if (!items || items.length === 0) return res.status(400).json({ error: "At least one item is required" });

    // If items reference products by ID, validate that selected providers own those products
    if (providerIds && Array.isArray(providerIds) && providerIds.length > 0) {
      const productIds = items.filter((i: any) => i.productId).map((i: any) => i.productId);
      if (productIds.length > 0) {
        const prodCheck = await query(
          `SELECT p.id FROM products p
           WHERE p.id = ANY($1::uuid[]) AND p.provider_company_id = ANY($2::uuid[])`,
          [productIds, providerIds]
        );
        if (prodCheck.rows.length === 0 && productIds.length > 0) {
          return res.status(400).json({ error: "None of the selected providers sell the requested product" });
        }
        // Verify each product ID has at least one selected provider
        for (const pid of productIds) {
          const match = await query(
            `SELECT 1 FROM products WHERE id = $1 AND provider_company_id = ANY($2::uuid[])`,
            [pid, providerIds]
          );
          if (match.rows.length === 0) {
            return res.status(400).json({ error: "Selected provider does not sell the requested product" });
          }
        }
      }
      if (providerIds.length > 0 && items.some((i: any) => i.productId)) {
        // For product-led RFQ, at least one provider who sells the product is required
        const hasValidProvider = await query(
          `SELECT 1 FROM products p
           WHERE p.id = ANY($1::uuid[])
             AND p.provider_company_id = ANY($2::uuid[])`,
          [items.filter((i: any) => i.productId).map((i: any) => i.productId), providerIds]
        );
        if (hasValidProvider.rows.length === 0) {
          return res.status(400).json({ error: "At least one selected supplier must sell the requested product" });
        }
      }
    }

    const requestResult = await query(
      `INSERT INTO procurement_requests (company_id, created_by, title, description, request_type,
        delivery_location, preferred_timeline, estimated_budget, notes, is_urgent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [companyId, req.userId, title, description || null, requestType || "product_supply",
       deliveryLocation || null, preferredTimeline || null, estimatedBudget || null, notes || null, isUrgent || false]
    );

    const requestId = requestResult.rows[0].id;

    // Insert items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await query(
        `INSERT INTO request_items (request_id, product_id, product_name, product_sku, service_description, quantity, unit, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [requestId, item.productId || null, item.productName || null, item.productSku || null,
         item.serviceDescription || null, item.quantity || 1, item.unit || null, item.notes || null, i]
      );
    }

    // Invite providers if specified
    const validIds: string[] = [];
    if (providerIds && Array.isArray(providerIds)) {
      for (const pid of providerIds) {
        const prov = await query(
          `SELECT id FROM companies WHERE id = $1 AND is_provider = true AND status = 'active' AND verification_status = 'approved'`,
          [pid]
        );
        if (prov.rows[0]) validIds.push(pid);
      }
      for (const pid of validIds) {
        await query(
          `INSERT INTO procurement_request_providers (request_id, provider_company_id) VALUES ($1, $2)
           ON CONFLICT (request_id, provider_company_id) DO NOTHING`,
          [requestId, pid]
        );
      }
    }

    // Log activity
    await logProcurementActivity({
      companyId,
      userId: req.userId,
      procurementRequestId: requestId,
      eventType: "request.created",
      description: `Procurement request "${title}" created`,
      metadata: { title, requestType: requestType || "product_supply", itemsCount: items.length },
    });

    if (providerIds && Array.isArray(providerIds) && validIds.length > 0) {
      await logProcurementActivity({
        companyId,
        userId: req.userId,
        providerCompanyIds: validIds,
        procurementRequestId: requestId,
        eventType: "provider.invited",
        description: `${validIds.length} provider(s) invited to quote`,
        metadata: { providerIds: validIds, count: validIds.length },
      });
    }

    const created = await query(
      `SELECT pr.*, json_agg(json_build_object(
        'id', ri.id, 'product_id', ri.product_id, 'product_name', ri.product_name,
        'product_sku', ri.product_sku, 'service_description', ri.service_description,
        'quantity', ri.quantity, 'unit', ri.unit, 'notes', ri.notes, 'sort_order', ri.sort_order
       ) ORDER BY ri.sort_order) as items,
       (SELECT json_agg(json_build_object('id', prp.id, 'provider_company_id', prp.provider_company_id,
         'company_name', c.name, 'status', prp.status))
        FROM procurement_request_providers prp
        LEFT JOIN companies c ON prp.provider_company_id = c.id
        WHERE prp.request_id = pr.id) as providers
       FROM procurement_requests pr
       LEFT JOIN request_items ri ON ri.request_id = pr.id
       WHERE pr.id = $1
       GROUP BY pr.id`,
      [requestId]
    );

    res.status(201).json({ request: created.rows[0] });
  } catch (err) {
    console.error("Create procurement request error:", err);
    res.status(500).json({ error: "Failed to create request" });
  }
});

/* ── List my company's procurement requests ── */
router.get("/procurement/requests", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const { page = "1", limit = "20", status: filterStatus, type } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [companyId];
    const conds: string[] = ["pr.company_id = $1"];

    if (filterStatus) { params.push(filterStatus); conds.push(`pr.status = $${params.length}`); }
    if (type) { params.push(type); conds.push(`pr.request_type = $${params.length}`); }

    const where = `WHERE ${conds.join(" AND ")}`;
    const countResult = await query(`SELECT COUNT(*) FROM procurement_requests pr ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT pr.*,
        (SELECT COUNT(*) FROM request_items ri WHERE ri.request_id = pr.id) as items_count,
        (SELECT json_agg(json_build_object('id', prp.id, 'provider_company_id', prp.provider_company_id,
          'company_name', c.name, 'status', prp.status))
         FROM procurement_request_providers prp
         LEFT JOIN companies c ON prp.provider_company_id = c.id
         WHERE prp.request_id = pr.id) as providers
       FROM procurement_requests pr
       ${where}
       ORDER BY pr.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({ requests: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("List procurement requests error:", err);
    res.status(500).json({ error: "Failed to list requests" });
  }
});

/* ── View procurement request detail ── */
router.get("/procurement/requests/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const result = await query(
      `SELECT pr.*,
        (SELECT json_agg(json_build_object(
          'id', ri.id, 'product_id', ri.product_id, 'product_name', ri.product_name,
          'product_sku', ri.product_sku, 'service_description', ri.service_description,
          'quantity', ri.quantity, 'unit', ri.unit, 'notes', ri.notes, 'sort_order', ri.sort_order
         ) ORDER BY ri.sort_order) FROM request_items ri WHERE ri.request_id = pr.id) as items,
        (SELECT json_agg(json_build_object(
          'id', prp.id, 'provider_company_id', prp.provider_company_id,
          'company_name', c.name, 'company_logo', c.logo_url,
          'status', prp.status, 'response_notes', prp.response_notes,
          'quote_amount', prp.quote_amount, 'viewed_at', prp.viewed_at,
          'responded_at', prp.responded_at
         ) ORDER BY prp.created_at)
         FROM procurement_request_providers prp
         LEFT JOIN companies c ON prp.provider_company_id = c.id
         WHERE prp.request_id = pr.id) as providers,
        (SELECT json_agg(json_build_object(
          'id', ra.id, 'url', ra.url, 'name', ra.name, 'type', ra.type
         ) ORDER BY ra.created_at) FROM request_attachments ra WHERE ra.request_id = pr.id) as attachments
       FROM procurement_requests pr
       WHERE pr.id = $1 AND pr.company_id = $2`,
      [req.params.id, companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Request not found" });
    res.json({ request: result.rows[0] });
  } catch (err: any) {
    if (err?.code === "22P02") return res.status(404).json({ error: "Request not found" });
    console.error("View procurement request error:", err);
    res.status(500).json({ error: "Failed to view request" });
  }
});

/* ── Update draft procurement request ── */
router.put("/procurement/requests/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const existing = await query(
      "SELECT id, status FROM procurement_requests WHERE id = $1 AND company_id = $2",
      [req.params.id, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Request not found" });
    if (existing.rows[0].status !== "draft") return res.status(400).json({ error: "Only draft requests can be updated" });

    const { title, description, requestType, deliveryLocation, preferredTimeline, estimatedBudget, notes, isUrgent, items, providerIds } = req.body;
    const requestId = req.params.id;

    await query(
      `UPDATE procurement_requests SET
        title = COALESCE($1, title), description = COALESCE($2, description),
        request_type = COALESCE($3, request_type), delivery_location = COALESCE($4, delivery_location),
        preferred_timeline = COALESCE($5, preferred_timeline), estimated_budget = COALESCE($6, estimated_budget),
        notes = COALESCE($7, notes), is_urgent = COALESCE($8, is_urgent),
        updated_at = NOW()
       WHERE id = $9 AND company_id = $10`,
      [title || null, description !== undefined ? description : null, requestType || null,
       deliveryLocation || null, preferredTimeline || null, estimatedBudget || null,
       notes !== undefined ? notes : null, isUrgent !== undefined ? isUrgent : null,
       requestId, companyId]
    );

    // Replace items if provided
    if (items && Array.isArray(items)) {
      await query("DELETE FROM request_items WHERE request_id = $1", [requestId]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await query(
          `INSERT INTO request_items (request_id, product_id, product_name, product_sku, service_description, quantity, unit, notes, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [requestId, item.productId || null, item.productName || null, item.productSku || null,
           item.serviceDescription || null, item.quantity || 1, item.unit || null, item.notes || null, i]
        );
      }
    }

    // Replace providers if provided
    if (providerIds && Array.isArray(providerIds)) {
      await query("DELETE FROM procurement_request_providers WHERE request_id = $1", [requestId]);
      for (const pid of providerIds) {
        await query(
          `INSERT INTO procurement_request_providers (request_id, provider_company_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [requestId, pid]
        );
      }
    }

    const updated = await query(
      `SELECT pr.*,
        (SELECT json_agg(json_build_object(
          'id', ri.id, 'product_id', ri.product_id, 'product_name', ri.product_name,
          'product_sku', ri.product_sku, 'service_description', ri.service_description,
          'quantity', ri.quantity, 'unit', ri.unit, 'notes', ri.notes, 'sort_order', ri.sort_order
         ) ORDER BY ri.sort_order) FROM request_items ri WHERE ri.request_id = pr.id) as items,
        (SELECT json_agg(json_build_object(
          'id', prp.id, 'provider_company_id', prp.provider_company_id,
      'company_name', c.name, 'status', prp.status))
     FROM procurement_request_providers prp
     LEFT JOIN companies c ON prp.provider_company_id = c.id
     WHERE prp.request_id = pr.id) as providers
   FROM procurement_requests pr WHERE pr.id = $1 AND pr.company_id = $2`,
  [requestId, companyId]
);

    res.json({ request: updated.rows[0] });
  } catch (err) {
    console.error("Update procurement request error:", err);
    res.status(500).json({ error: "Failed to update request" });
  }
});

/* ── Submit or cancel a request ── */
router.patch("/procurement/requests/:id/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const { status: newStatus } = req.body;
    if (!newStatus || !["submitted", "cancelled"].includes(newStatus)) {
      return res.status(400).json({ error: "Status must be 'submitted' or 'cancelled'" });
    }

    const existing = await query(
      "SELECT id, status FROM procurement_requests WHERE id = $1 AND company_id = $2",
      [req.params.id, companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Request not found" });

    const current = existing.rows[0].status;
    if (newStatus === "submitted" && current !== "draft") return res.status(400).json({ error: "Only draft requests can be submitted" });
    if (newStatus === "cancelled" && !["draft", "submitted", "in_review"].includes(current)) return res.status(400).json({ error: "Cannot cancel in current status" });

    await query("UPDATE procurement_requests SET status = $1, updated_at = NOW() WHERE id = $2", [newStatus, req.params.id]);

    if (newStatus === "submitted") {
      await logProcurementActivity({
        companyId,
        userId: req.userId,
        procurementRequestId: req.params.id,
        eventType: "request.submitted",
        description: `Procurement request submitted for quoting`,
      });
    } else if (newStatus === "cancelled") {
      await logProcurementActivity({
        companyId,
        userId: req.userId,
        procurementRequestId: req.params.id,
        eventType: "request.cancelled",
        description: `Procurement request cancelled`,
      });
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("Update procurement request status error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

/* ═══════════════════════════════════════════════
   PROVIDER APIs
   ═══════════════════════════════════════════════ */

/* ── List requests sent to my provider company ── */
router.get("/provider/procurement/requests", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const { page = "1", limit = "20", status: filterStatus } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [providerCompanyId];
    const conds: string[] = ["prp.provider_company_id = $1"];

    if (filterStatus) { params.push(filterStatus); conds.push(`prp.status = $${params.length}`); }

    const where = `WHERE ${conds.join(" AND ")}`;
    const countResult = await query(
      `SELECT COUNT(*) FROM procurement_request_providers prp JOIN procurement_requests pr ON prp.request_id = pr.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT prp.id as prp_id, prp.status as response_status, prp.viewed_at, prp.responded_at,
              pr.id as request_id, pr.title, pr.description, pr.request_type, pr.delivery_location,
              pr.preferred_timeline, pr.estimated_budget, pr.is_urgent, pr.status as request_status,
              pr.created_at as requested_at,
              buyer.name as company_name, buyer.logo_url as company_logo
       FROM procurement_request_providers prp
       JOIN procurement_requests pr ON prp.request_id = pr.id
       LEFT JOIN companies buyer ON pr.company_id = buyer.id
       ${where}
       ORDER BY pr.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({ requests: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("Provider list procurement requests error:", err);
    res.status(500).json({ error: "Failed to list requests" });
  }
});

/* ── View request detail (provider side) ── */
router.get("/provider/procurement/requests/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const prp = await query(
      `SELECT prp.id as prp_id, prp.status as response_status, prp.response_notes, prp.quote_amount,
              prp.responded_at, prp.viewed_at,
              pr.id, pr.title, pr.description, pr.request_type, pr.status as request_status,
              pr.delivery_location, pr.preferred_timeline, pr.estimated_budget, pr.notes, pr.is_urgent,
              pr.created_at, pr.company_id as buyer_company_id,
              buyer.name as company_name, buyer.logo_url as company_logo,
              buyer.description as company_description
       FROM procurement_request_providers prp
       JOIN procurement_requests pr ON prp.request_id = pr.id
       LEFT JOIN companies buyer ON pr.company_id = buyer.id
       WHERE prp.request_id = $1 AND prp.provider_company_id = $2`,
      [req.params.id, providerCompanyId]
    );
    if (prp.rows.length === 0) return res.status(404).json({ error: "Request not found" });

    // Get items
    const items = await query(
      `SELECT id, product_id, product_name, product_sku, service_description, quantity, unit, notes, sort_order
       FROM request_items WHERE request_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );

    // Get all providers on this request (for context — which competitors are invited)
    const otherProviders = await query(
      `SELECT prp.provider_company_id, c.name as company_name, prp.status
       FROM procurement_request_providers prp
       LEFT JOIN companies c ON prp.provider_company_id = c.id
       WHERE prp.request_id = $1`,
      [req.params.id]
    );

    res.json({
      request: prp.rows[0],
      items: items.rows,
      otherProviders: otherProviders.rows,
    });
  } catch (err) {
    console.error("Provider view request detail error:", err);
    res.status(500).json({ error: "Failed to view request" });
  }
});

/* ── Mark request as viewed ── */
router.patch("/provider/procurement/requests/:id/view", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const result = await query(
      `UPDATE procurement_request_providers
       SET status = CASE WHEN status = 'invited' THEN 'viewed' ELSE status END,
           viewed_at = COALESCE(viewed_at, NOW())
       WHERE request_id = $1 AND provider_company_id = $2
       RETURNING id, status, viewed_at`,
      [req.params.id, providerCompanyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Request not found" });

    await logProcurementActivity({
      providerCompanyId,
      userId: req.userId,
      procurementRequestId: req.params.id,
      eventType: "provider.viewed",
      description: `Provider viewed the request`,
    });

    res.json({ success: true, status: result.rows[0].status });
  } catch (err) {
    console.error("Mark procurement request viewed error:", err);
    res.status(500).json({ error: "Failed to mark as viewed" });
  }
});

/* ── Respond to a request (interested / declined / quote) ── */
router.patch("/provider/procurement/requests/:id/respond", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const { response: responseAction, notes, quoteAmount, quoteDetails } = req.body;
    if (!responseAction || !["interested", "declined", "quote"].includes(responseAction)) {
      return res.status(400).json({ error: "Response must be 'interested', 'declined', or 'quote'" });
    }

    const existing = await query(
      "SELECT id, status FROM procurement_request_providers WHERE request_id = $1 AND provider_company_id = $2",
      [req.params.id, providerCompanyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Request not found" });

    const allowedPrevStatuses = responseAction === "declined" ? ["invited", "viewed", "interested"] : ["invited", "viewed"];
    if (!allowedPrevStatuses.includes(existing.rows[0].status)) {
      return res.status(400).json({ error: `Cannot respond with '${responseAction}' from current status '${existing.rows[0].status}'` });
    }

    const newStatus = responseAction === "quote" ? "quoted" : responseAction;
    const result = await query(
      `UPDATE procurement_request_providers
       SET status = $1, response_notes = COALESCE($2, response_notes),
           quote_amount = $3, quote_details = $4,
           responded_at = NOW(), updated_at = NOW()
       WHERE id = $5
       RETURNING id, status, response_notes, quote_amount, responded_at`,
      [newStatus, notes || null, quoteAmount || null, quoteDetails ? JSON.stringify(quoteDetails) : null, existing.rows[0].id]
    );

    // Log activity
    const eventTypeMap: Record<string, "provider.interested" | "provider.declined" | "provider.quoted"> = {
      interested: "provider.interested",
      declined: "provider.declined",
      quote: "provider.quoted",
    };
    await logProcurementActivity({
      providerCompanyId,
      userId: req.userId,
      procurementRequestId: req.params.id,
      eventType: eventTypeMap[responseAction],
      description: responseAction === "quote"
        ? `Provider submitted a quote for GH₵${Number(quoteAmount || 0).toLocaleString()}`
        : `Provider responded: ${responseAction}`,
      metadata: { responseAction, quoteAmount: quoteAmount || null },
    });

    // If the request was in draft, submit it now (first response triggers submission)
    await query(
      `UPDATE procurement_requests SET status = 'in_review', updated_at = NOW()
       WHERE id = $1 AND status = 'submitted'`,
      [req.params.id]
    );

    res.json({ success: true, response: result.rows[0] });
  } catch (err) {
    console.error("Provider respond to request error:", err);
    res.status(500).json({ error: "Failed to respond" });
  }
});

/* ═══════════════════════════════════════════════
   SUPPLIER SELECTION (BUYER ACCEPTS QUOTE)
   ═══════════════════════════════════════════════ */

const acceptProviderSchema = z.object({
  adminOverride: z.boolean().optional().default(false),
});

/* ── Accept a provider's quote / select a supplier ── */
router.post(
  "/procurement/requests/:requestId/accept-provider/:providerCompanyId",
  authenticate,
  requireCompanyActive,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = await resolveUserCompany(req, res);
      if (!companyId) return;

      const { requestId, providerCompanyId } = req.params;
      const { adminOverride } = acceptProviderSchema.parse(req.body);

      // Verify the request belongs to this buyer
      const requestRow = await query(
        "SELECT id, status FROM procurement_requests WHERE id = $1 AND company_id = $2",
        [requestId, companyId]
      );
      if (requestRow.rows.length === 0) return res.status(404).json({ error: "Request not found" });
      if (!["in_review", "submitted"].includes(requestRow.rows[0].status)) {
        return res.status(400).json({ error: "Request must be in review or submitted to accept a quote" });
      }

      // Verify the provider was invited and has a quote
      const prpRow = await query(
        `SELECT id, status, quote_amount
         FROM procurement_request_providers
         WHERE request_id = $1 AND provider_company_id = $2`,
        [requestId, providerCompanyId]
      );
      if (prpRow.rows.length === 0) return res.status(404).json({ error: "Provider not found on this request" });
      if (prpRow.rows[0].status !== "quoted") {
        return res.status(400).json({ error: "Provider must have submitted a quote before being selected" });
      }

      // ── SUPPLIER CREDIT ENFORCEMENT ──
      const creditProfile = await query(
        `SELECT vetting_status, credit_tier
         FROM supplier_credit_profiles
         WHERE company_id = $1`,
        [providerCompanyId]
      );

      const status = creditProfile.rows[0]?.vetting_status || "pending";
      const tier = creditProfile.rows[0]?.credit_tier || "unrated";

      if (status === "rejected") {
        await logProcurementActivity({
          companyId,
          userId: req.userId,
          providerCompanyId,
          procurementRequestId: requestId,
          eventType: "credit.rejected",
          description: `Attempted to select provider with rejected credit`,
          metadata: { vettingStatus: status, creditTier: tier },
        });
        return res.status(400).json({
          error: "This supplier's credit has been rejected and cannot be selected.",
          code: "CREDIT_REJECTED",
        });
      }

      if (status !== "approved" && status !== "rejected") {
        if (!adminOverride) {
          return res.status(409).json({
            error: "This supplier's credit has not been assessed. Set adminOverride=true to proceed.",
            code: "CREDIT_NOT_ASSESSED",
          });
        }
      }

      // Allowed — mark provider as selected
      await query(
        `UPDATE procurement_request_providers
         SET status = 'selected', updated_at = NOW()
         WHERE id = $1`,
        [prpRow.rows[0].id]
      );

      // Mark request as accepted
      await query(
        `UPDATE procurement_requests
         SET status = 'accepted', updated_at = NOW()
         WHERE id = $1`,
        [requestId]
      );

      // Reject all other quoted providers (they weren't selected)
      await query(
        `UPDATE procurement_request_providers
         SET status = 'declined', updated_at = NOW()
         WHERE request_id = $1 AND provider_company_id != $2 AND status = 'quoted'`,
        [requestId, providerCompanyId]
      );

      // Log activity
      await logProcurementActivity({
        companyId,
        userId: req.userId,
        providerCompanyId,
        procurementRequestId: requestId,
        eventType: "provider.selected",
        description: `Provider selected for the request`,
        metadata: { quoteAmount: prpRow.rows[0].quote_amount },
      });
      await logProcurementActivity({
        companyId,
        userId: req.userId,
        providerCompanyId,
        procurementRequestId: requestId,
        eventType: "request.accepted",
        description: `Request accepted — provider selected`,
      });
      if (status !== "approved" && status !== "rejected") {
        await logProcurementActivity({
          companyId,
          userId: req.userId,
          providerCompanyId,
          procurementRequestId: requestId,
          eventType: "credit.override_used",
          description: `Supplier credit override used — credit status was "${status}"`,
          metadata: { vettingStatus: status, creditTier: tier },
        });
      }

      res.json({
        success: true,
        supplierCreditWarning: (status !== "approved" && status !== "rejected") ? "Supplier credit not assessed — proceed with caution." : undefined,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      console.error("Accept provider error:", err);
      res.status(500).json({ error: "Failed to accept provider" });
    }
  }
);

/* ═══════════════════════════════════════════════
   PROCUREMENT → ORDER CONVERSION
   ═══════════════════════════════════════════════ */

/* ── Convert an accepted procurement request into an order ── */
router.post(
  "/procurement/requests/:id/convert-to-order",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const companyId = await resolveUserCompany(req, res);
      if (!companyId) return;

      // Verify request exists, is accepted, and belongs to this buyer
      const requestRow = await query(
        `SELECT pr.id, pr.status, pr.title, pr.request_type,
                prp.provider_company_id, prp.quote_amount, prp.quote_details,
                c.name as provider_name
         FROM procurement_requests pr
         LEFT JOIN procurement_request_providers prp ON prp.request_id = pr.id AND prp.status = 'selected'
         LEFT JOIN companies c ON c.id = prp.provider_company_id
         WHERE pr.id = $1 AND pr.company_id = $2`,
        [req.params.id, companyId]
      );
      if (requestRow.rows.length === 0) return res.status(404).json({ error: "Request not found" });
      const reqData = requestRow.rows[0];
      if (reqData.status !== "accepted") {
        return res.status(400).json({ error: "Request must be accepted before converting to an order" });
      }
      if (!reqData.provider_company_id) {
        return res.status(400).json({ error: "No provider has been selected for this request" });
      }

      // Prevent duplicate conversion
      const existingOrder = await query(
        "SELECT id, order_number FROM orders WHERE procurement_request_id = $1",
        [req.params.id]
      );
      if (existingOrder.rows.length > 0) {
        return res.status(409).json({
          error: "Already converted to order",
          order_number: existingOrder.rows[0].order_number,
          code: "ALREADY_CONVERTED",
        });
      }

      // Load request items
      const itemsResult = await query(
        `SELECT product_id, product_name, product_sku, service_description, quantity, unit, notes
         FROM request_items WHERE request_id = $1 ORDER BY sort_order`,
        [req.params.id]
      );
      const requestItems = itemsResult.rows;

      // Build order items array
      let perItemPrices: Record<string, number> = {};
      try {
        const qd = typeof reqData.quote_details === "string" ? JSON.parse(reqData.quote_details) : (reqData.quote_details || {});
        if (qd.prices && typeof qd.prices === "object") {
          perItemPrices = qd.prices;
        }
      } catch { /* ignore malformed quote_details */ }

      const totalQuantity = requestItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
      const baseUnitPrice = totalQuantity > 0 ? Number(reqData.quote_amount) / totalQuantity : 0;

      const orderItems = requestItems.map((item: any) => {
        const qty = item.quantity || 1;
        const unitPrice = perItemPrices[item.product_id] || perItemPrices[item.product_sku] || baseUnitPrice;
        return {
          productId: item.product_id,
          name: item.product_name || item.service_description || "Item",
          sku: item.product_sku,
          price: Math.round(unitPrice * 100) / 100,
          quantity: qty,
          notes: item.notes || null,
        };
      });

      const subtotal = orderItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
      const total = Math.round(subtotal * 100) / 100;

      const orderNumber = `PROC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const orderResult = await query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_status,
          payment_method, order_source, order_type, procurement_request_id, notes)
         VALUES ($1, $2, $3, $4, 0, $5, 'pending', 'unpaid', 'bank_transfer', 'procurement',
           CASE WHEN $6 = 'service' THEN 'service'::order_type ELSE 'sales'::order_type END,
           $7, $8)
         RETURNING id, order_number, items, subtotal, total, payment_status, status, created_at`,
        [req.userId, orderNumber, JSON.stringify(orderItems), subtotal, total,
         reqData.request_type, req.params.id,
         `Procurement order from request: ${reqData.title}`]
      );

      await logProcurementActivity({
        companyId,
        userId: req.userId,
        providerCompanyId: reqData.provider_company_id,
        procurementRequestId: req.params.id,
        eventType: "request.converted_to_order",
        description: `Request converted to order ${orderNumber}`,
        metadata: { orderId: orderResult.rows[0].id, orderNumber },
      });

      void trackFunnelEvent({
        eventName: "procurement_order_created",
        eventKey: `procurement_order_created:${orderResult.rows[0].id}`,
        companyId,
        userId: req.userId,
        entityType: "order",
        entityId: orderResult.rows[0].id,
        metadata: { requestId: req.params.id, providerCompanyId: reqData.provider_company_id, source: "procurement" },
      });

      res.status(201).json({
        success: true,
        order: orderResult.rows[0],
      });
    } catch (err) {
      console.error("Convert procurement to order error:", err);
      res.status(500).json({ error: "Failed to convert to order" });
    }
  }
);

/* ═══════════════════════════════════════════════
   ACTIVITY FEED ENDPOINTS
   ═══════════════════════════════════════════════ */

/* ── Buyer activity feed (own company) ── */
router.get("/procurement/activity", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req, res);
    if (!companyId) return;

    const { page = "1", limit = "50", eventType } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [companyId];
    const conds: string[] = ["pal.company_id = $1"];

    if (eventType) { params.push(eventType); conds.push(`pal.event_type = $${params.length}`); }

    const where = `WHERE ${conds.join(" AND ")}`;
    const countResult = await query(`SELECT COUNT(*) FROM procurement_activity_log pal ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT pal.id, pal.event_type, pal.description, pal.metadata, pal.created_at,
              pal.procurement_request_id, pal.provider_company_id,
              CONCAT(u.first_name, ' ', u.last_name) as user_name,
              c.name as provider_name
       FROM procurement_activity_log pal
       LEFT JOIN users u ON u.id = pal.user_id
       LEFT JOIN companies c ON c.id = pal.provider_company_id
       ${where}
       ORDER BY pal.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({ activities: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("Procurement activity feed error:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

/* ── Provider activity feed (own company) ── */
router.get("/provider/procurement/activity", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const { page = "1", limit = "50", eventType } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [providerCompanyId];
    const conds: string[] = ["pal.provider_company_id = $1"];

    if (eventType) { params.push(eventType); conds.push(`pal.event_type = $${params.length}`); }

    const where = `WHERE ${conds.join(" AND ")}`;
    const countResult = await query(`SELECT COUNT(*) FROM procurement_activity_log pal ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT pal.id, pal.event_type, pal.description, pal.metadata, pal.created_at,
              pal.procurement_request_id, pal.company_id,
              CONCAT(u.first_name, ' ', u.last_name) as user_name,
              buyer.name as buyer_name
       FROM procurement_activity_log pal
       LEFT JOIN users u ON u.id = pal.user_id
       LEFT JOIN companies buyer ON buyer.id = pal.company_id
       ${where}
       ORDER BY pal.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({ activities: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("Provider procurement activity feed error:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

/* ── Admin activity feed (all procurement activity) ── */
router.get("/admin/procurement/activity", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { page = "1", limit = "50", eventType, companyId, providerCompanyId } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [];

    if (eventType) { params.push(eventType); conds.push(`pal.event_type = $${params.length}`); }
    if (companyId) { params.push(companyId); conds.push(`pal.company_id = $${params.length}`); }
    if (providerCompanyId) { params.push(providerCompanyId); conds.push(`pal.provider_company_id = $${params.length}`); }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const countResult = await query(`SELECT COUNT(*) FROM procurement_activity_log pal ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT pal.id, pal.event_type, pal.description, pal.metadata, pal.created_at,
              pal.procurement_request_id, pal.company_id, pal.provider_company_id,
              CONCAT(u.first_name, ' ', u.last_name) as user_name,
              buyer.name as buyer_name,
              c.name as provider_name
       FROM procurement_activity_log pal
       LEFT JOIN users u ON u.id = pal.user_id
       LEFT JOIN companies buyer ON buyer.id = pal.company_id
       LEFT JOIN companies c ON c.id = pal.provider_company_id
       ${where}
       ORDER BY pal.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({ activities: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("Admin procurement activity feed error:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

/* ═══════════════════════════════════════════════
   NOTIFICATION ENDPOINTS
   ═══════════════════════════════════════════════ */

/* ── Get my notifications (paginated) ── */
router.get("/notifications", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1`, [req.userId]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT id, type, title, description, link, is_read, metadata, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.userId, limitNum, offset]
    );

    res.json({ notifications: result.rows, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

/* ── Get unread count ── */
router.get("/notifications/unread-count", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND NOT is_read`, [req.userId]
    );
    res.json({ unread: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error("Unread count error:", err);
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

/* ── Mark notification as read ── */
router.patch("/notifications/:id/read", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Mark read error:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

/* ── Mark all notifications as read ── */
router.patch("/notifications/read-all", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read`,
      [req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

export default router;
