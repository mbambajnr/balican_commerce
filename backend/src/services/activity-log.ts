import { query } from "../config/db";

export interface CreateActivityLogParams {
  companyId?: string;
  userId?: string;
  action: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export async function createActivityLog(params: CreateActivityLogParams): Promise<void> {
  await query(
    `INSERT INTO activity_logs (company_id, user_id, action, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.companyId || null,
      params.userId || null,
      params.action,
      params.description || null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]
  );
}
