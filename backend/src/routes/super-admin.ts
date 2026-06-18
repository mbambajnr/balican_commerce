import { Router, Response } from "express";
import { authenticate, requireSuperAdmin, AuthRequest } from "../middleware/auth";
import { query } from "../config/db";
import { createAuditLog } from "../services/audit-log";
import { createActivityLog } from "../services/activity-log";
import {
  notifyCompanyApproved, notifyCompanyRejected, notifyCompanySuspended,
  notifyCompanyReactivated, notifyPaymentSuspended, notifyPaymentSuspensionCleared,
  notifyVerificationApproved, notifyDocumentRejected, notifyDocumentReuploadRequested,
} from "../services/verification-notifications";
import { dispatchDueOpportunityReminders } from "../services/opportunity-notifications";

const router = Router();

// All super admin routes require auth + super_admin role
router.use(authenticate, requireSuperAdmin);

// ──────────────────────────────────────────────────
// Dashboard stats
// ──────────────────────────────────────────────────
router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const [companiesResult, pendingVResult, docsResult, planResult, activityResult] = await Promise.all([
      query(`SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'active')::int as active,
        COUNT(*) FILTER (WHERE status = 'rejected')::int as rejected,
        COUNT(*) FILTER (WHERE status = 'payment_suspended')::int as payment_suspended,
        COUNT(*) FILTER (WHERE status = 'suspended')::int as suspended
      FROM companies`),
      query(`SELECT COUNT(*)::int FROM companies WHERE verification_status = 'submitted' OR verification_status = 'under_review'`),
      query(`SELECT COUNT(*)::int FROM verification_documents WHERE status = 'pending'`),
      query(`SELECT p.name, p.display_name, COUNT(cs.id)::int as subscriber_count
        FROM plans p LEFT JOIN company_subscriptions cs ON cs.plan_id = p.id
        WHERE cs.status IN ('active','trialing','free_active')
        GROUP BY p.id, p.name, p.display_name ORDER BY p.sort_order`),
      query(`SELECT action, COUNT(*)::int as count FROM activity_logs WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY action ORDER BY count DESC LIMIT 10`),
    ]);

    res.json({
      companies: companiesResult.rows[0],
      pendingVerifications: pendingVResult.rows[0].count,
      pendingDocuments: docsResult.rows[0].count,
      planDistribution: planResult.rows,
      recentActivity: activityResult.rows,
    });
  } catch (err) {
    console.error("Error fetching super admin dashboard:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// ──────────────────────────────────────────────────
// Company management
// ──────────────────────────────────────────────────
router.get("/companies", async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search || "";
    const status = req.query.status || "";
    const vStatus = req.query.verificationStatus || "";
    const companyType = req.query.companyType || "";
    const sortBy = req.query.sortBy || "newest";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(c.name ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (status) {
      conditions.push(`c.status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (vStatus) {
      conditions.push(`c.verification_status = $${idx}`);
      params.push(vStatus);
      idx++;
    }
    if (companyType) {
      conditions.push(`c.company_type = $${idx}`);
      params.push(companyType);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*)::int FROM companies c ${whereClause}`,
      params
    );
    const total = countResult.rows[0].count;

    const orderClause = (() => {
      switch (sortBy) {
        case "oldest": return "c.created_at ASC";
        case "name": return "c.name ASC";
        case "status": return "c.status ASC, c.created_at DESC";
        case "verification": return "c.verification_status ASC, c.created_at DESC";
        case "type": return "c.company_type ASC, c.created_at DESC";
        default: return "c.created_at DESC";
      }
    })();

    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM users WHERE company_id = c.id) as user_count,
        cs.status as subscription_status, p.display_name as plan_name
      FROM companies c
      LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
      LEFT JOIN plans p ON p.id = cs.plan_id
      ${whereClause}
      ORDER BY ${orderClause} LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ companies: result.rows, total, page, limit });
  } catch (err) {
    console.error("Error listing companies:", err);
    res.status(500).json({ error: "Failed to list companies" });
  }
});

router.get("/companies/:id", async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT c.*,
        (SELECT json_agg(json_build_object(
          'id', vd.id, 'document_type', vd.document_type, 'file_name', vd.file_name,
          'mime_type', vd.mime_type, 'file_size', vd.file_size, 'status', vd.status,
          'rejection_reason', vd.rejection_reason, 'admin_review_notes', vd.admin_review_notes,
          'reviewed_at', vd.reviewed_at, 'created_at', vd.created_at
        ) ORDER BY vd.created_at DESC) FROM verification_documents vd WHERE vd.company_id = c.id) as verification_documents,
        (SELECT json_agg(json_build_object(
          'id', u.id, 'name', CONCAT(u.first_name, ' ', u.last_name), 'email', u.email, 'role', u.role,
          'company_role', u.company_role, 'account_status', u.account_status
        ) ORDER BY u.created_at) FROM users u WHERE u.company_id = c.id) as users,
        cs.status as subscription_status, cs.current_period_end, cs.trial_end_at,
        p.name as plan_name, p.display_name as plan_display_name,
        vfp.status as latest_verification_fee_status,
        vfp.amount as latest_verification_fee_amount,
        vfp.currency as latest_verification_fee_currency,
        vfp.paid_at as latest_verification_fee_paid_at
      FROM companies c
      LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
      LEFT JOIN plans p ON p.id = cs.plan_id
      LEFT JOIN LATERAL (
        SELECT status, amount, currency, paid_at
        FROM verification_fee_payments
        WHERE company_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) vfp ON TRUE
      WHERE c.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching company:", err);
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

// ── Company status changes ──
router.post("/companies/:id/approve", async (req: AuthRequest, res: Response) => {
  const { transaction } = await import("../config/db");
  try {
    await transaction(async (client) => {
      const company = await client.query(`SELECT status, verification_status, is_provider FROM companies WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (company.rows.length === 0) {
        throw Object.assign(new Error("Company not found"), { statusCode: 404 });
      }

      const c = company.rows[0];
      await client.query(
        `UPDATE companies SET status = 'active', status_change_reason = $2, status_changed_by = $3, status_changed_at = NOW() WHERE id = $1`,
        [req.params.id, req.body.reason || "Approved by super admin", req.userId]
      );

      const shouldVerify = c.is_provider && (c.verification_status === "submitted" || c.verification_status === "under_review");
      if (shouldVerify) {
        await client.query(
          `UPDATE companies
           SET verification_status = 'approved',
               verified_until = CURRENT_DATE + (
                 SELECT renewal_period_days FROM verification_fee_settings WHERE id = TRUE
               )::int
           WHERE id = $1`,
          [req.params.id]
        );
      }
    });

    await createAuditLog({
      adminUserId: req.userId!,
      action: "company_approved",
      targetType: "company",
      targetId: req.params.id,
      reason: req.body.reason,
    });
    await createActivityLog({
      companyId: req.params.id,
      userId: req.userId,
      action: "company_approved",
      description: req.body.reason || "Company approved by super admin",
    });
    await notifyCompanyApproved(req.params.id, req.userId!);

    res.json({ message: "Company approved" });
  } catch (err: any) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: "Company not found" });
    }
    console.error("Error approving company:", err);
    res.status(500).json({ error: "Failed to approve company" });
  }
});

router.post("/companies/:id/reject", async (req: AuthRequest, res: Response) => {
  const { transaction } = await import("../config/db");
  try {
    const reason = req.body.reason || "Rejected by super admin";
    await transaction(async (client) => {
      const company = await client.query(`SELECT status FROM companies WHERE id = $1 FOR UPDATE`, [req.params.id]);
      if (company.rows.length === 0) {
        throw Object.assign(new Error("Company not found"), { statusCode: 404 });
      }

      await client.query(
        `UPDATE companies SET status = 'rejected', verification_status = 'rejected', status_change_reason = $2, status_changed_by = $3, status_changed_at = NOW() WHERE id = $1`,
        [req.params.id, reason, req.userId]
      );
    });

    await createAuditLog({
      adminUserId: req.userId!,
      action: "company_rejected",
      targetType: "company",
      targetId: req.params.id,
      reason,
    });
    await notifyCompanyRejected(req.params.id, reason, req.userId!);

    res.json({ message: "Company rejected" });
  } catch (err: any) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: "Company not found" });
    }
    console.error("Error rejecting company:", err);
    res.status(500).json({ error: "Failed to reject company" });
  }
});

router.post("/companies/:id/suspend", async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body.reason || "Suspended by super admin";
    await query(
      `UPDATE companies SET status = 'suspended', status_change_reason = $2, status_changed_by = $3, status_changed_at = NOW() WHERE id = $1`,
      [req.params.id, reason, req.userId]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "company_suspended",
      targetType: "company",
      targetId: req.params.id,
      reason,
    });
    await notifyCompanySuspended(req.params.id, reason, req.userId!);

    res.json({ message: "Company suspended" });
  } catch (err) {
    console.error("Error suspending company:", err);
    res.status(500).json({ error: "Failed to suspend company" });
  }
});

router.post("/companies/:id/reactivate", async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body.reason || "Reactivated by super admin";
    await query(
      `UPDATE companies SET status = 'active', status_change_reason = $2, status_changed_by = $3, status_changed_at = NOW() WHERE id = $1`,
      [req.params.id, reason, req.userId]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "company_reactivated",
      targetType: "company",
      targetId: req.params.id,
      reason,
    });
    await notifyCompanyReactivated(req.params.id, req.userId!);

    res.json({ message: "Company reactivated" });
  } catch (err) {
    console.error("Error reactivating company:", err);
    res.status(500).json({ error: "Failed to reactivate company" });
  }
});

router.post("/companies/:id/payment-suspend", async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body.reason || "Payment issue";
    await query(
      `UPDATE companies SET status = 'payment_suspended', status_change_reason = $2, status_changed_by = $3, status_changed_at = NOW() WHERE id = $1`,
      [req.params.id, reason, req.userId]
    );

    const subResult = await query(
      `UPDATE company_subscriptions SET status = 'payment_suspended' WHERE company_id = $1 RETURNING id`,
      [req.params.id]
    );

    if (subResult.rows[0]) {
      await query(
        `INSERT INTO subscription_events (subscription_id, event_type, new_status, metadata) VALUES ($1, 'payment_suspended', 'payment_suspended', $2)`,
        [subResult.rows[0].id, JSON.stringify({ reason, byUserId: req.userId })]
      );
    }

    await createAuditLog({
      adminUserId: req.userId!,
      action: "company_payment_suspended",
      targetType: "company",
      targetId: req.params.id,
      reason,
    });
    await notifyPaymentSuspended(req.params.id, reason, req.userId!);

    res.json({ message: "Company payment suspended" });
  } catch (err) {
    console.error("Error suspending payments:", err);
    res.status(500).json({ error: "Failed to suspend payments" });
  }
});

router.post("/companies/:id/clear-payment-suspend", async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE companies SET status = 'active', status_change_reason = 'Payment resolved', status_changed_by = $2, status_changed_at = NOW() WHERE id = $1`,
      [req.params.id, req.userId]
    );

    const subResult = await query(
      `UPDATE company_subscriptions SET status = 'active' WHERE company_id = $1 RETURNING id`,
      [req.params.id]
    );

    if (subResult.rows[0]) {
      await query(
        `INSERT INTO subscription_events (subscription_id, event_type, new_status, metadata) VALUES ($1, 'payment_cleared', 'active', $2)`,
        [subResult.rows[0].id, JSON.stringify({ byUserId: req.userId })]
      );
    }

    await createAuditLog({
      adminUserId: req.userId!,
      action: "company_payment_suspend_cleared",
      targetType: "company",
      targetId: req.params.id,
    });
    await notifyPaymentSuspensionCleared(req.params.id, req.userId!);

    res.json({ message: "Payment suspension cleared" });
  } catch (err) {
    console.error("Error clearing payment suspend:", err);
    res.status(500).json({ error: "Failed to clear payment suspension" });
  }
});

// ──────────────────────────────────────────────────
// Document review
// ──────────────────────────────────────────────────
router.get("/documents", async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status || "pending";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*)::int
       FROM verification_documents vd
       JOIN companies c ON c.id = vd.company_id
       WHERE vd.status = $1
         AND c.verification_status IN ('submitted', 'under_review')`,
      [status]
    );
    const total = countResult.rows[0].count;

    const result = await query(
      `SELECT vd.*, c.name as company_name, c.email as company_email,
        CONCAT(u.first_name, ' ', u.last_name) as uploaded_by_name
       FROM verification_documents vd
       JOIN companies c ON c.id = vd.company_id
       LEFT JOIN users u ON u.id = vd.uploaded_by
       WHERE vd.status = $1
         AND c.verification_status IN ('submitted', 'under_review')
       ORDER BY vd.created_at ASC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    res.json({ documents: result.rows, total, page, limit });
  } catch (err) {
    console.error("Error listing documents:", err);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.get("/documents/:id/download", async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT vd.*, c.name as company_name FROM verification_documents vd JOIN companies c ON c.id = vd.company_id WHERE vd.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const doc = result.rows[0];
    const { getPrivateDocumentAccess } = await import("../services/storage");
    const safeFilename = String(doc.file_name)
      .split(/[\\/]/)
      .pop()!
      .replace(/[\r\n"]/g, "_")
      .slice(0, 200) || "document";
    const access = await getPrivateDocumentAccess(doc.storage_key, safeFilename, doc.mime_type);

    if (!access) {
      return res.status(404).json({ error: "File not found in storage" });
    }

    if (access.redirectUrl) {
      return res.redirect(302, access.redirectUrl);
    }

    res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    access.stream!.pipe(res);
  } catch (err) {
    console.error("Error downloading document:", err);
    res.status(500).json({ error: "Failed to download document" });
  }
});

router.post("/documents/:id/approve", async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE verification_documents SET status = 'approved', admin_review_notes = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $1 RETURNING id, company_id, document_type`,
      [req.params.id, req.body.notes || null, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const { company_id } = result.rows[0];
    await createAuditLog({
      adminUserId: req.userId!,
      action: "document_approved",
      targetType: "verification_document",
      targetId: req.params.id,
      reason: req.body.notes,
    });

    // Check if all docs approved, auto-update company status
    const pendingResult = await query(
      `SELECT COUNT(*)::int FROM verification_documents WHERE company_id = $1 AND status != 'approved'`,
      [company_id]
    );
    if (pendingResult.rows[0].count === 0) {
      await query(
        `UPDATE companies
         SET verification_status = 'approved',
             verified_until = CURRENT_DATE + (
               SELECT renewal_period_days FROM verification_fee_settings WHERE id = TRUE
             )::int
         WHERE id = $1 AND verification_status IN ('submitted','under_review')`,
        [company_id]
      );
      await createActivityLog({
        companyId: company_id,
        userId: req.userId,
        action: "verification_approved",
        description: "All verification documents approved",
      });
      await notifyVerificationApproved(company_id, req.userId!);
    }

    res.json({ message: "Document approved" });
  } catch (err) {
    console.error("Error approving document:", err);
    res.status(500).json({ error: "Failed to approve document" });
  }
});

router.post("/documents/:id/reject", async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body.reason || "Document does not meet requirements";
    const result = await query(
      `UPDATE verification_documents SET status = 'rejected', rejection_reason = $2, admin_review_notes = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE id = $1 RETURNING id, company_id, document_type`,
      [req.params.id, reason, req.body.notes || null, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const { company_id } = result.rows[0];
    await query(
      `UPDATE companies SET verification_status = 'changes_requested' WHERE id = $1`,
      [company_id]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "document_rejected",
      targetType: "verification_document",
      targetId: req.params.id,
      previousValue: "pending",
      newValue: "rejected",
      reason,
    });
    await createActivityLog({
      companyId: company_id,
      userId: req.userId,
      action: "document_rejected",
      description: reason,
    });
    await notifyDocumentRejected(company_id, result.rows[0].document_type, reason, req.userId!);

    res.json({ message: "Document rejected", reason });
  } catch (err) {
    console.error("Error rejecting document:", err);
    res.status(500).json({ error: "Failed to reject document" });
  }
});

router.post("/documents/:id/request-reupload", async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body.reason || "Document needs to be re-uploaded with corrections";
    const result = await query(
      `UPDATE verification_documents SET status = 'needs_reupload', rejection_reason = $2, admin_review_notes = $3, reviewed_by = $4, reviewed_at = NOW()
       WHERE id = $1 RETURNING id, company_id, document_type`,
      [req.params.id, reason, req.body.notes || null, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const { company_id } = result.rows[0];
    await query(
      `UPDATE companies SET verification_status = 'changes_requested' WHERE id = $1`,
      [company_id]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "document_reupload_requested",
      targetType: "verification_document",
      targetId: req.params.id,
      reason,
    });
    await notifyDocumentReuploadRequested(company_id, result.rows[0].document_type, reason, req.userId!);

    res.json({ message: "Re-upload requested", reason });
  } catch (err) {
    console.error("Error requesting re-upload:", err);
    res.status(500).json({ error: "Failed to request re-upload" });
  }
});

// ──────────────────────────────────────────────────
// Audit log viewer
// ──────────────────────────────────────────────────
router.get("/audit-logs", async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const action = req.query.action as string;
    const targetType = req.query.targetType as string;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (action) {
      conditions.push(`al.action = $${idx}`);
      params.push(action);
      idx++;
    }
    if (targetType) {
      conditions.push(`al.target_type = $${idx}`);
      params.push(targetType);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*)::int FROM audit_logs al ${whereClause}`,
      params
    );
    const total = countResult.rows[0].count;

    const result = await query(
      `SELECT al.*, CONCAT(u.first_name, ' ', u.last_name) as admin_name, u.email as admin_email
       FROM audit_logs al LEFT JOIN users u ON u.id = al.admin_user_id
       ${whereClause}
       ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ logs: result.rows, total, page, limit });
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.get("/activity-logs", async (req: AuthRequest, res: Response) => {
  try {
    const companyId = req.query.companyId as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (companyId) {
      conditions.push(`al.company_id = $${idx}`);
      params.push(companyId);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*)::int FROM activity_logs al ${whereClause}`,
      params
    );
    const total = countResult.rows[0].count;

    const result = await query(
      `SELECT al.*, CONCAT(u.first_name, ' ', u.last_name) as user_name
       FROM activity_logs al LEFT JOIN users u ON u.id = al.user_id
       ${whereClause}
       ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ logs: result.rows, total, page, limit });
  } catch (err) {
    console.error("Error fetching activity logs:", err);
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

// ──────────────────────────────────────────────────
// Balican Verified fee settings and waivers
// ──────────────────────────────────────────────────
router.get("/verification-fee/settings", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT amount, currency, renewal_period_days, grace_period_days, updated_at
       FROM verification_fee_settings WHERE id = TRUE`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching verification fee settings:", err);
    res.status(500).json({ error: "Failed to fetch verification fee settings" });
  }
});

router.patch("/verification-fee/settings", async (req: AuthRequest, res: Response) => {
  try {
    const amount = req.body.amount;
    const renewalPeriodDays = req.body.renewalPeriodDays;
    const gracePeriodDays = req.body.gracePeriodDays;

    if (amount === undefined || Number(amount) < 0) {
      return res.status(400).json({ error: "amount must be zero or greater" });
    }
    if (!renewalPeriodDays || Number(renewalPeriodDays) <= 0) {
      return res.status(400).json({ error: "renewalPeriodDays must be greater than zero" });
    }
    if (gracePeriodDays === undefined || Number(gracePeriodDays) < 0) {
      return res.status(400).json({ error: "gracePeriodDays must be zero or greater" });
    }

    const result = await query(
      `UPDATE verification_fee_settings
       SET amount = $1, currency = 'GHS', renewal_period_days = $2,
           grace_period_days = $3, updated_by = $4, updated_at = NOW()
       WHERE id = TRUE
       RETURNING amount, currency, renewal_period_days, grace_period_days, updated_at`,
      [amount, renewalPeriodDays, gracePeriodDays, req.userId]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "verification_fee_settings_updated",
      targetType: "verification_fee_settings",
      targetId: "default",
      metadata: { amount, renewalPeriodDays, gracePeriodDays },
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating verification fee settings:", err);
    res.status(500).json({ error: "Failed to update verification fee settings" });
  }
});

router.post("/companies/:id/verification-fee/waive", async (req: AuthRequest, res: Response) => {
  try {
    const reason = req.body.reason || "Founder onboarding waiver";
    const days = Math.max(1, Number(req.body.days || 365));
    const result = await query(
      `UPDATE companies
       SET verification_fee_waived_until = CURRENT_DATE + $2::int,
           verification_fee_waived_by = $3,
           verification_fee_waived_at = NOW(),
           verification_fee_waiver_reason = $4
       WHERE id = $1
       RETURNING id, verification_fee_waived_until, verification_fee_waiver_reason`,
      [req.params.id, days, req.userId, reason]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    await createAuditLog({
      adminUserId: req.userId!,
      action: "verification_fee_waived",
      targetType: "company",
      targetId: req.params.id,
      reason,
      metadata: { days, waivedUntil: result.rows[0].verification_fee_waived_until },
    });
    await createActivityLog({
      companyId: req.params.id,
      userId: req.userId,
      action: "verification_fee_waived",
      description: reason,
      metadata: { days, waivedUntil: result.rows[0].verification_fee_waived_until },
    });

    res.json({ company: result.rows[0] });
  } catch (err) {
    console.error("Error waiving verification fee:", err);
    res.status(500).json({ error: "Failed to waive verification fee" });
  }
});

router.post("/verification/expire-lapsed", async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE companies c
       SET verification_status = 'lapsed'
       FROM verification_fee_settings s
       WHERE c.verification_status = 'approved'
         AND c.verified_until IS NOT NULL
         AND c.verified_until < CURRENT_DATE - s.grace_period_days::int
       RETURNING c.id`
    );

    for (const row of result.rows) {
      await createActivityLog({
        companyId: row.id,
        userId: req.userId,
        action: "verification_lapsed",
        description: "Balican Verified status lapsed after renewal grace period",
      });
    }

    res.json({ lapsed: result.rows.length });
  } catch (err) {
    console.error("Error expiring lapsed verifications:", err);
    res.status(500).json({ error: "Failed to expire lapsed verifications" });
  }
});

router.post("/opportunities/send-reminders", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await dispatchDueOpportunityReminders();
    res.json(result);
  } catch (err) {
    console.error("Opportunity reminder job error:", err);
    res.status(500).json({ error: "Failed to send opportunity reminders" });
  }
});

// ──────────────────────────────────────────────────
// Commission rate management
// ──────────────────────────────────────────────────
router.get("/commission-rates", async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT cr.*, c.name as category_name
       FROM commission_rates cr
       LEFT JOIN categories c ON c.id = cr.category_id
       ORDER BY cr.category_id NULLS FIRST, c.name ASC`
    );
    res.json({ rates: result.rows });
  } catch (err) {
    console.error("Error fetching commission rates:", err);
    res.status(500).json({ error: "Failed to fetch commission rates" });
  }
});

router.post("/commission-rates", async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = req.body.categoryId || null;
    const ratePercent = Number(req.body.ratePercent);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      return res.status(400).json({ error: "ratePercent must be between 0 and 100" });
    }

    if (!categoryId) {
      const global = await query(
        `UPDATE commission_rates
         SET rate_percent = $1, is_active = COALESCE($2, TRUE), created_by = $3, updated_at = NOW()
         WHERE category_id IS NULL
         RETURNING *`,
        [ratePercent, req.body.isActive !== false, req.userId]
      );
      await createAuditLog({
        adminUserId: req.userId!,
        action: "commission_rate_upserted",
        targetType: "commission_rate",
        targetId: global.rows[0].id,
        metadata: { categoryId: null, ratePercent },
      });
      return res.status(201).json({ rate: global.rows[0] });
    }

    const result = await query(
      `INSERT INTO commission_rates (category_id, rate_percent, is_active, created_by)
       VALUES ($1, $2, COALESCE($3, TRUE), $4)
       ON CONFLICT (category_id) WHERE category_id IS NOT NULL
       DO UPDATE SET rate_percent = EXCLUDED.rate_percent,
                     is_active = EXCLUDED.is_active,
                     updated_at = NOW()
       RETURNING *`,
      [categoryId, ratePercent, req.body.isActive !== false, req.userId]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "commission_rate_upserted",
      targetType: "commission_rate",
      targetId: result.rows[0].id,
      metadata: { categoryId, ratePercent },
    });
    res.status(201).json({ rate: result.rows[0] });
  } catch (err) {
    console.error("Error saving commission rate:", err);
    res.status(500).json({ error: "Failed to save commission rate" });
  }
});

router.patch("/commission-rates/:id", async (req: AuthRequest, res: Response) => {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (req.body.ratePercent !== undefined) {
      const ratePercent = Number(req.body.ratePercent);
      if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
        return res.status(400).json({ error: "ratePercent must be between 0 and 100" });
      }
      fields.push(`rate_percent = $${idx++}`);
      values.push(ratePercent);
    }
    if (req.body.isActive !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(Boolean(req.body.isActive));
    }
    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
    fields.push("updated_at = NOW()");
    values.push(req.params.id);

    const result = await query(
      `UPDATE commission_rates SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Commission rate not found" });
    res.json({ rate: result.rows[0] });
  } catch (err) {
    console.error("Error updating commission rate:", err);
    res.status(500).json({ error: "Failed to update commission rate" });
  }
});

// ──────────────────────────────────────────────────
// Subscription & Plan management
// ──────────────────────────────────────────────────
router.get("/plans", async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM plans ORDER BY sort_order ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

router.post("/plans", async (req: AuthRequest, res: Response) => {
  try {
    const { name, displayName, description, priceMonthly, priceYearly, maxUsers, maxProducts, maxServices, features, sortOrder } = req.body;
    if (!name || !displayName) {
      return res.status(400).json({ error: "Name and display name are required" });
    }

    const result = await query(
      `INSERT INTO plans (name, display_name, description, price_monthly, price_yearly, max_users, max_products, max_services, features, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, displayName, description || null, priceMonthly || 0, priceYearly || 0, maxUsers || 1, maxProducts || 0, maxServices || 0, JSON.stringify(features || []), sortOrder || 0]
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "plan_created",
      targetType: "plan",
      targetId: result.rows[0].id,
      newValue: name,
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creating plan:", err);
    res.status(500).json({ error: "Failed to create plan" });
  }
});

router.patch("/plans/:id", async (req: AuthRequest, res: Response) => {
  try {
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      displayName: "display_name",
      description: "description",
      priceMonthly: "price_monthly",
      priceYearly: "price_yearly",
      maxUsers: "max_users",
      maxProducts: "max_products",
      maxServices: "max_services",
      features: "features",
      isActive: "is_active",
      sortOrder: "sort_order",
    };

    for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
      if (req.body[bodyKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`);
        params.push(bodyKey === "features" ? JSON.stringify(req.body[bodyKey]) : req.body[bodyKey]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    params.push(req.params.id);
    const result = await query(
      `UPDATE plans SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Plan not found" });
    }

    await createAuditLog({
      adminUserId: req.userId!,
      action: "plan_updated",
      targetType: "plan",
      targetId: req.params.id,
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating plan:", err);
    res.status(500).json({ error: "Failed to update plan" });
  }
});

router.get("/company-subscriptions", async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params: unknown[] = [];
    if (status) {
      whereClause = "WHERE cs.status = $1";
      params.push(status);
    }

    const countResult = await query(
      `SELECT COUNT(*)::int FROM company_subscriptions cs ${whereClause}`,
      params
    );
    const total = countResult.rows[0].count;

    params.push(limit, offset);
    const result = await query(
      `SELECT cs.*, c.name as company_name, c.email as company_email,
        p.name as plan_name, p.display_name as plan_display_name
       FROM company_subscriptions cs
       JOIN companies c ON c.id = cs.company_id
       JOIN plans p ON p.id = cs.plan_id
       ${whereClause}
       ORDER BY cs.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ subscriptions: result.rows, total, page, limit });
  } catch (err) {
    console.error("Error fetching subscriptions:", err);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
});

router.patch("/company-subscriptions/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { planId, status: newStatus } = req.body;
    if (!planId && !newStatus) {
      return res.status(400).json({ error: "Plan ID or new status required" });
    }

    const updateFields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (planId) {
      updateFields.push(`plan_id = $${idx}`);
      params.push(planId);
      idx++;
    }
    if (newStatus) {
      updateFields.push(`status = $${idx}`);
      params.push(newStatus);
      idx++;
      // Log subscription event
      const subResult = await query(
        `SELECT id, status FROM company_subscriptions WHERE id = $1`,
        [req.params.id]
      );
      if (subResult.rows.length > 0) {
        await query(
          `INSERT INTO subscription_events (subscription_id, event_type, previous_status, new_status, metadata)
           VALUES ($1, 'admin_change', $2, $3, $4)`,
          [req.params.id, subResult.rows[0].status, newStatus, JSON.stringify({ byUserId: req.userId })]
        );
      }
    }

    updateFields.push(`updated_at = NOW()`);
    params.push(req.params.id);

    await query(
      `UPDATE company_subscriptions SET ${updateFields.join(", ")} WHERE id = $${idx}`,
      params
    );

    await createAuditLog({
      adminUserId: req.userId!,
      action: "subscription_updated",
      targetType: "company_subscription",
      targetId: req.params.id,
    });

    res.json({ message: "Subscription updated" });
  } catch (err) {
    console.error("Error updating subscription:", err);
    res.status(500).json({ error: "Failed to update subscription" });
  }
});

export default router;
