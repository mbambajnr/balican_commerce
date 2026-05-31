import { query } from "../config/db";

export type ProcurementEventType =
  | "request.created"
  | "request.submitted"
  | "request.cancelled"
  | "provider.invited"
  | "provider.viewed"
  | "provider.interested"
  | "provider.declined"
  | "provider.quoted"
  | "provider.selected"
  | "request.accepted"
  | "request.converted_to_order"
  | "credit.override_used"
  | "credit.rejected";

export interface ActivityInput {
  companyId?: string;
  userId?: string;
  providerCompanyIds?: string[];
  providerCompanyId?: string;
  procurementRequestId?: string;
  eventType: ProcurementEventType;
  description: string;
  metadata?: Record<string, any>;
}

const NOTIFICATION_CONFIG: Record<string, {
  title: string;
  audience: "buyer" | "provider" | "both" | "none";
}> = {
  "request.submitted":       { title: "New procurement request available", audience: "provider" },
  "request.cancelled":       { title: "Procurement request cancelled", audience: "both" },
  "provider.invited":        { title: "You've been invited to quote", audience: "provider" },
  "provider.interested":     { title: "Provider is interested", audience: "buyer" },
  "provider.declined":       { title: "Provider declined to quote", audience: "buyer" },
  "provider.quoted":         { title: "Quote received", audience: "buyer" },
  "provider.selected":       { title: "Provider selected", audience: "both" },
  "request.accepted":        { title: "Request accepted", audience: "provider" },
  "request.converted_to_order": { title: "Request converted to order", audience: "both" },
};

export async function logProcurementActivity(input: ActivityInput) {
  await query(
    `INSERT INTO procurement_activity_log (company_id, user_id, provider_company_id, procurement_request_id, event_type, description, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.companyId || null,
      input.userId || null,
      input.providerCompanyId || null,
      input.procurementRequestId || null,
      input.eventType,
      input.description,
      JSON.stringify(input.metadata || {}),
    ]
  );

  const cfg = NOTIFICATION_CONFIG[input.eventType];
  if (!cfg || cfg.audience === "none") return;

  const link = input.procurementRequestId
    ? `/procurement/requests/${input.procurementRequestId}`
    : undefined;

  if (cfg.audience === "buyer" || cfg.audience === "both") {
    if (input.companyId) {
      await notifyCompany(input.companyId, input.eventType, cfg.title, input.description, link, input.metadata);
    }
  }

  if (cfg.audience === "provider" || cfg.audience === "both") {
    const providerIds = input.providerCompanyIds
      ?? (input.providerCompanyId ? [input.providerCompanyId] : null)
      ?? (input.procurementRequestId ? await lookupRequestProviders(input.procurementRequestId) : []);
    for (const pid of providerIds) {
      await notifyCompany(pid, input.eventType, cfg.title, input.description, link, input.metadata);
    }
  }
}

async function lookupRequestProviders(requestId: string): Promise<string[]> {
  try {
    const result = await query(
      `SELECT DISTINCT provider_company_id FROM procurement_request_providers WHERE request_id = $1`,
      [requestId]
    );
    return result.rows.map((r: any) => r.provider_company_id);
  } catch {
    return [];
  }
}

async function notifyCompany(
  companyId: string,
  type: string,
  title: string,
  description?: string,
  link?: string,
  metadata?: Record<string, any>,
) {
  const users = await query(
    `SELECT id FROM users WHERE company_id = $1`,
    [companyId]
  );
  for (const u of users.rows) {
    const dedupKey = `${type}:${u.id}:${link || ""}`;
    await query(
      `INSERT INTO notifications (user_id, company_id, type, title, description, link, metadata, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING`,
      [u.id, companyId, type, title, description || null, link || null, JSON.stringify(metadata || {}), dedupKey]
    );
  }
}
