import { query } from "../config/db";

export interface CreateAuditLogParams {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  await query(
    `INSERT INTO audit_logs (admin_user_id, action, target_type, target_id, previous_value, new_value, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.adminUserId,
      params.action,
      params.targetType,
      params.targetId || null,
      params.previousValue || null,
      params.newValue || null,
      params.reason || null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]
  );
}
