import jwt from "jsonwebtoken";
import { config } from "../config";
import { query } from "../config/db";

const SESSION_DURATION_MS = 60 * 60 * 1000;

export interface AuthSessionContext {
  userId: string;
  sessionId: string;
  role: string;
  accountStatus: string;
  companyId: string | null;
  companyRole: string | null;
  companyStatus: string | null;
}

export async function createAuthSession(
  userId: string,
  request?: { ip?: string | null; userAgent?: string | null }
): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const result = await query(
    `INSERT INTO auth_sessions (user_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, expiresAt, request?.ip || null, request?.userAgent || null]
  );

  return jwt.sign(
    { userId, sid: result.rows[0].id },
    config.jwtSecret,
    { expiresIn: "1h" }
  );
}

export async function resolveAuthSession(token: string): Promise<AuthSessionContext | null> {
  let decoded: { userId: string; sid?: string };
  try {
    decoded = jwt.verify(token, config.jwtSecret) as { userId: string; sid?: string };
  } catch {
    return null;
  }

  if (!decoded.sid) {
    if (config.nodeEnv !== "test") return null;
    const legacy = await query(
      `SELECT u.id, u.role, u.account_status, u.company_id, u.company_role,
              c.status AS company_status
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [decoded.userId]
    );
    if (legacy.rows.length === 0) return null;
    return {
      userId: legacy.rows[0].id,
      sessionId: "test-legacy-session",
      role: legacy.rows[0].role,
      accountStatus: legacy.rows[0].account_status,
      companyId: legacy.rows[0].company_id,
      companyRole: legacy.rows[0].company_role,
      companyStatus: legacy.rows[0].company_status,
    };
  }

  const result = await query(
    `SELECT s.id AS session_id, u.id, u.role, u.account_status, u.company_id, u.company_role,
            c.status AS company_status
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE s.id = $1
       AND s.user_id = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()`,
    [decoded.sid, decoded.userId]
  );
  if (result.rows.length === 0) return null;

  await query(
    `UPDATE auth_sessions
     SET last_seen_at = NOW()
     WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '5 minutes'`,
    [decoded.sid]
  ).catch(() => {});

  const row = result.rows[0];
  return {
    userId: row.id,
    sessionId: row.session_id,
    role: row.role,
    accountStatus: row.account_status,
    companyId: row.company_id,
    companyRole: row.company_role,
    companyStatus: row.company_status,
  };
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  if (sessionId === "test-legacy-session") return;
  await query(
    "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1",
    [sessionId]
  );
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await query(
    "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1",
    [userId]
  );
}

export async function revokeCompanySessions(companyId: string): Promise<void> {
  await query(
    `UPDATE auth_sessions
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
    [companyId]
  );
}
