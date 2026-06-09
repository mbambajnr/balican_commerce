import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { query } from "../config/db";

const router = Router();

// GET /api/account/status — returns user/company status for the account-status page
router.get("/account/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT
        u.account_status, u.role, u.company_role, u.email, u.first_name, u.last_name,
        c.id as company_id, c.name as company_name, c.status as company_status,
        c.verification_status, c.is_provider, c.company_type,
        c.status_change_reason, c.status_changed_at,
        c.rejection_reason,
        cs.status as subscription_status, p.name as plan_name, p.display_name as plan_display_name
      FROM users u
      LEFT JOIN companies c ON u.company_id = c.id
      LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
      LEFT JOIN plans p ON p.id = cs.plan_id
      WHERE u.id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching account status:", err);
    res.status(500).json({ error: "Failed to fetch account status" });
  }
});

export default router;
