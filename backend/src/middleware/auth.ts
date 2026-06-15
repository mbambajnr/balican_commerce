import { Request, Response, NextFunction } from "express";
import { query } from "../config/db";
import { resolveAuthSession } from "../services/auth-session";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  sessionId?: string;
  accountStatus?: string;
  companyId?: string | null;
  companyRole?: string | null;
  companyStatus?: string | null;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];
  try {
    const session = await resolveAuthSession(token);
    if (!session || session.accountStatus === "suspended") {
      return res.status(401).json({ error: "Session is invalid, expired, or revoked" });
    }
    req.userId = session.userId;
    req.userRole = session.role;
    req.sessionId = session.sessionId;
    req.accountStatus = session.accountStatus;
    req.companyId = session.companyId;
    req.companyRole = session.companyRole;
    req.companyStatus = session.companyStatus;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const ADMIN_ROLES = ["admin", "super_admin"];

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userRole || !ADMIN_ROLES.includes(req.userRole)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.userRole || req.userRole !== "super_admin") {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ error: `Access restricted to: ${roles.join(", ")}` });
    }
    next();
  };
}

export async function requireCompanyAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `SELECT company_role FROM users WHERE id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0 || result.rows[0].company_role !== "company_admin") {
      return res.status(403).json({ error: "Company admin access required" });
    }
    next();
  } catch {
    return res.status(500).json({ error: "Authorization check failed" });
  }
}

const RESTRICTED_COMPANY_STATUSES = ["rejected", "suspended", "payment_suspended", "deactivated"];
const VERIFICATION_REQUIRED_TYPES = ["supplier", "service_provider", "both_supplier_and_service_provider"];

export async function requireCompanyActive(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Admins bypass all checks
    if (req.userRole === "admin" || req.userRole === "super_admin") {
      return next();
    }

    const result = await query(
      `SELECT u.account_status, c.status as company_status,
              c.verification_status, c.is_provider, c.company_type, c.id as company_id
       FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Account not found." });
    }

    const u = result.rows[0];

    // User-level status check
    if (u.account_status !== "active") {
      return res.status(403).json({ error: "Your account is not active. Please contact support.", code: "ACCOUNT_NOT_ACTIVE" });
    }

    // Company-level status check (if user has a company)
    if (u.company_id) {
      if (RESTRICTED_COMPANY_STATUSES.includes(u.company_status)) {
        const messages: Record<string, string> = {
          rejected: "Your company account has been rejected.",
          suspended: "Your company account has been suspended. Please contact support.",
          payment_suspended: "Your company account has a payment suspension. Please resolve outstanding payments.",
          deactivated: "Your company account has been deactivated.",
        };
        return res.status(403).json({ error: messages[u.company_status] || "Company account is restricted.", code: `COMPANY_${u.company_status.toUpperCase()}` });
      }

      if (u.company_status === "pending") {
        return res.status(403).json({ error: "Your company registration is pending approval.", code: "COMPANY_PENDING" });
      }

      // Provider verification check
      const isProvider = u.is_provider || VERIFICATION_REQUIRED_TYPES.includes(u.company_type);
      if (isProvider) {
        if (u.verification_status === "rejected") {
          return res.status(403).json({ error: "Your provider verification was rejected. Please contact support.", code: "VERIFICATION_REJECTED" });
        }
        if (u.verification_status !== "approved") {
          return res.status(403).json({ error: "Provider verification is required before trading. Please complete verification.", code: "VERIFICATION_REQUIRED" });
        }
      }
    } else {
      return res.status(403).json({ error: "No company account found. Please register a company to use business features.", code: "NO_COMPANY" });
    }

    next();
  } catch {
    return res.status(500).json({ error: "Authorization check failed. Please try again." });
  }
}

// Resolve full company context for a user — used by route handlers that need company info
export interface CompanyContext {
  companyId: string;
  companyName: string;
  status: string;
  verificationStatus: string;
  isProvider: boolean;
  companyType: string;
}

export async function resolveCompanyContext(userId: string): Promise<CompanyContext | null> {
  const result = await query(
    `SELECT c.id as "companyId", c.name as "companyName", c.status,
            c.verification_status as "verificationStatus", c.is_provider as "isProvider", c.company_type as "companyType"
     FROM users u JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}
