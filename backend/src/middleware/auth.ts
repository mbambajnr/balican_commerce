import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { query } from "../config/db";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as {
      userId: string;
      role: string;
    };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
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

export async function requireCompanyActive(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await query(
      `SELECT u.account_status, c.status as company_status
       FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length > 0) {
      const u = result.rows[0];
      if (u.account_status !== "active" || (u.company_id && u.company_status !== "active")) {
        return res.status(403).json({ error: "Company account is not active. Please wait for approval." });
      }
    }
    next();
  } catch {
    next();
  }
}
