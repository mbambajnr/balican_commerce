import { Router, Response } from "express";
import { z } from "zod";
import { query } from "../config/db";
import { authenticate, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { trackCompanyActivation, trackFunnelEvent } from "../services/funnel-events";

const router = Router();

async function resolveProviderCompany(req: AuthRequest, res: Response): Promise<string | null> {
  // Super admins bypass all provider checks
  if (req.userRole === "super_admin") {
    const userResult = await query(
      "SELECT company_id, company_role FROM users WHERE id = $1",
      [req.userId]
    );
    if (!userResult.rows[0]?.company_id) {
      res.status(403).json({ error: "No company associated with this account" });
      return null;
    }
    return userResult.rows[0].company_id;
  }
  const ctx = await (await import("../middleware/auth")).resolveCompanyContext(req.userId!);
  if (!ctx) { res.status(403).json({ error: "No company associated with this account" }); return null; }
  if (!ctx.isProvider) { res.status(403).json({ error: "Only provider companies can access opportunities" }); return null; }
  return ctx.companyId;
}

const submitProposalSchema = z.object({
  amount: z.number().positive().optional(),
  deliveryDate: z.string().optional(),
  creditTerms: z.string().max(300).optional(),
  availabilityStatus: z.string().max(100).optional(),
  proposalText: z.string().min(10).max(5000),
});

/* GET /api/provider/opportunities — list open procurement requests */
router.get("/provider/opportunities", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const {
      category, requestType, location, deadline,
      search, status, page = "1", limit = "20",
    } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: any[] = [];

    if (status === "open" || !status) {
      conditions.push("sr.status = 'open'");
    } else {
      conditions.push(`sr.status = $${params.length + 1}`);
      params.push(status);
    }

    if (category) {
      params.push(category);
      conditions.push(`(cat.slug = $${params.length} OR cat.id::text = $${params.length})`);
    }
    if (requestType) {
      params.push(requestType);
      conditions.push(`sr.request_type = $${params.length}`);
    }
    if (location) {
      params.push(`%${location}%`);
      conditions.push(`sr.delivery_location ILIKE $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(sr.title ILIKE $${params.length} OR sr.description ILIKE $${params.length})`);
    }
    if (deadline === "closing_soon") {
      conditions.push("sr.desired_delivery_date IS NOT NULL AND sr.desired_delivery_date <= NOW() + INTERVAL '7 days'");
    } else if (deadline === "open") {
      conditions.push("(sr.desired_delivery_date IS NULL OR sr.desired_delivery_date > NOW())");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [listResult, countResult] = await Promise.all([
      query(
        `SELECT sr.*,
                cat.name as category_name,
                cat.slug as category_slug,
                (SELECT COUNT(*) FROM scout_quotes sq WHERE sq.request_id = sr.id) as proposal_count,
                (SELECT sq2.status FROM scout_quotes sq2
                 WHERE sq2.request_id = sr.id AND sq2.provider_company_id = $${params.length + 1}
                 LIMIT 1) as my_proposal_status
         FROM scout_requests sr
         LEFT JOIN categories cat ON cat.id = sr.category_id
         ${where}
         ORDER BY
           CASE WHEN sr.desired_delivery_date IS NOT NULL AND sr.desired_delivery_date <= NOW() + INTERVAL '7 days' THEN 0 ELSE 1 END,
           sr.created_at DESC
         LIMIT $${params.length + 2} OFFSET $${params.length + 3}`,
        [...params, providerCompanyId, limitNum, offset]
      ),
      query(`SELECT COUNT(*) FROM scout_requests sr LEFT JOIN categories cat ON cat.id = sr.category_id ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      opportunities: listResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Provider opportunities error:", err);
    res.status(500).json({ error: "Failed to list opportunities" });
  }
});

/* GET /api/provider/opportunities/:id — single opportunity detail */
router.get("/provider/opportunities/:id", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const reqResult = await query(
      `SELECT sr.*,
              cat.name as category_name,
              cat.slug as category_slug,
              (SELECT COUNT(*) FROM scout_quotes sq WHERE sq.request_id = sr.id) as proposal_count,
              (SELECT sq2.status FROM scout_quotes sq2
               WHERE sq2.request_id = sr.id AND sq2.provider_company_id = $1
               LIMIT 1) as my_proposal_status
       FROM scout_requests sr
       LEFT JOIN categories cat ON cat.id = sr.category_id
       WHERE sr.id = $2`,
      [providerCompanyId, req.params.id]
    );
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: "Opportunity not found" });
    }

    const row = reqResult.rows[0];
    void Promise.all([
      trackCompanyActivation({ companyId: providerCompanyId, userId: req.userId, entityType: "scout_request", entityId: row.id }),
      trackFunnelEvent({
        eventName: "opportunity_viewed",
        eventKey: `opportunity_viewed:${providerCompanyId}:${row.id}`,
        companyId: providerCompanyId,
        userId: req.userId,
        entityType: "scout_request",
        entityId: row.id,
        metadata: { buyerCompanyId: row.company_id, categoryId: row.category_id },
      }),
    ]);

    const opportunity = {
      id: row.id,
      title: row.title,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      requestType: row.request_type,
      quantity: row.quantity,
      unit: row.unit,
      deliveryLocation: row.delivery_location,
      desiredDeliveryDate: row.desired_delivery_date,
      budgetMin: row.budget_min,
      budgetMax: row.budget_max,
      notes: row.notes,
      status: row.status,
      proposalCount: parseInt(row.proposal_count) || 0,
      myProposalStatus: row.my_proposal_status,
      buyerLabel: "Verified buyer",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    res.json({ opportunity });
  } catch (err) {
    console.error("Provider opportunity detail error:", err);
    res.status(500).json({ error: "Failed to fetch opportunity" });
  }
});

/* POST /api/provider/opportunities/:id/proposals — submit/update proposal */
router.post(
  "/provider/opportunities/:id/proposals",
  authenticate,
  requireCompanyActive,
  validate(submitProposalSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const providerCompanyId = await resolveProviderCompany(req, res);
      if (!providerCompanyId) return;

      const reqRow = await query(
        "SELECT id, status, company_id FROM scout_requests WHERE id = $1",
        [req.params.id]
      );
      if (reqRow.rows.length === 0) return res.status(404).json({ error: "Opportunity not found" });
      if (reqRow.rows[0].status !== "open") {
        return res.status(400).json({ error: "This opportunity is no longer accepting proposals" });
      }
      if (reqRow.rows[0].company_id === providerCompanyId) {
        return res.status(400).json({ error: "Cannot submit a proposal to your own request" });
      }

      const { amount, deliveryDate, creditTerms, availabilityStatus, proposalText } = req.body;

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
          amount ?? null, deliveryDate || null,
          creditTerms || null, proposalText,
        ]
      );

      const proposal = result.rows[0];
      void Promise.all([
        trackCompanyActivation({ companyId: providerCompanyId, userId: req.userId, entityType: "scout_quote", entityId: proposal.id }),
        trackFunnelEvent({
          eventName: "supplier_responded",
          eventKey: `supplier_responded:${providerCompanyId}:${req.params.id}`,
          companyId: providerCompanyId,
          userId: req.userId,
          entityType: "scout_quote",
          entityId: proposal.id,
          metadata: { requestId: req.params.id, buyerCompanyId: reqRow.rows[0].company_id },
        }),
      ]);
      res.status(201).json({
        proposal: {
          id: proposal.id,
          amount: proposal.quoted_price,
          deliveryDate: proposal.delivery_date,
          creditTerms: proposal.payment_terms,
          proposalText: proposal.notes,
          status: proposal.status,
          createdAt: proposal.created_at,
          updatedAt: proposal.updated_at,
        },
      });
    } catch (err) {
      console.error("Proposal submission error:", err);
      res.status(500).json({ error: "Failed to submit proposal" });
    }
  }
);

/* GET /api/provider/opportunities/:id/my-proposal — view own proposal */
router.get("/provider/opportunities/:id/my-proposal", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const providerCompanyId = await resolveProviderCompany(req, res);
    if (!providerCompanyId) return;

    const quoteRow = await query(
      `SELECT sq.*, sr.title as request_title
       FROM scout_quotes sq
       JOIN scout_requests sr ON sr.id = sq.request_id
       WHERE sq.request_id = $1 AND sq.provider_company_id = $2`,
      [req.params.id, providerCompanyId]
    );

    if (quoteRow.rows.length === 0) {
      return res.json({ proposal: null });
    }

    const p = quoteRow.rows[0];
    res.json({
      proposal: {
        id: p.id,
        amount: p.quoted_price,
        deliveryDate: p.delivery_date,
        creditTerms: p.payment_terms,
        proposalText: p.notes,
        status: p.status,
        requestTitle: p.request_title,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      },
    });
  } catch (err) {
    console.error("My proposal fetch error:", err);
    res.status(500).json({ error: "Failed to fetch proposal" });
  }
});

/* GET /api/scout/requests/:id/proposals — buyer-facing: view proposals on their request */
router.get("/scout/requests/:id/proposals", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      "SELECT u.company_id, u.role FROM users u WHERE u.id = $1",
      [req.userId]
    );
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    const requestRow = await query(
      "SELECT * FROM scout_requests WHERE id = $1",
      [req.params.id]
    );
    if (requestRow.rows.length === 0) return res.status(404).json({ error: "Request not found" });
    const scoutReq = requestRow.rows[0];

    if (!isAdmin && scoutReq.company_id !== user.company_id) {
      return res.status(403).json({ error: "You can only view proposals for your own requests" });
    }

    const proposalsResult = await query(
      `SELECT sq.id, sq.request_id, sq.quoted_price, sq.delivery_date, sq.payment_terms,
              sq.notes, sq.status, sq.created_at, sq.updated_at,
              c.name as provider_name, c.logo_url as provider_logo,
              c.city as provider_city, c.verification_status as provider_verification
       FROM scout_quotes sq
       JOIN companies c ON c.id = sq.provider_company_id
       WHERE sq.request_id = $1
       ORDER BY sq.quoted_price ASC, sq.created_at ASC`,
      [req.params.id]
    );

    res.json({
      request: { id: scoutReq.id, title: scoutReq.title, status: scoutReq.status },
      proposals: proposalsResult.rows.map((p: any) => ({
        id: p.id,
        requestId: p.request_id,
        amount: p.quoted_price,
        deliveryTimeline: p.delivery_date,
        creditTerms: p.payment_terms,
        proposalText: p.notes,
        status: p.status,
        providerName: p.provider_name,
        providerLogo: p.provider_logo,
        providerCity: p.provider_city,
        providerVerification: p.provider_verification,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (err) {
    console.error("Proposals list error:", err);
    res.status(500).json({ error: "Failed to fetch proposals" });
  }
});

export default router;
