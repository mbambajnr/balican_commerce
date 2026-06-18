import { query } from "../config/db";
import { emitCriticalAlert } from "./alerts";
import { logger } from "./logger";

export type FunnelEventName =
  | "company_activated"
  | "sourcing_request_created"
  | "opportunity_viewed"
  | "supplier_responded"
  | "proposal_accepted"
  | "agreement_signed"
  | "procurement_order_created"
  | "order_fulfilled"
  | "credit_drawdown"
  | "repayment_received"
  | "commission_accrued";

export interface FunnelEventInput {
  eventName: FunnelEventName;
  eventKey: string;
  companyId?: string | null;
  userId?: string | null;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function trackFunnelEvent(input: FunnelEventInput): Promise<boolean> {
  try {
    const result = await query(
      `INSERT INTO funnel_events
         (event_name, event_key, company_id, user_id, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_key) DO NOTHING
       RETURNING id`,
      [
        input.eventName,
        input.eventKey,
        input.companyId || null,
        input.userId || null,
        input.entityType,
        input.entityId || null,
        JSON.stringify(input.metadata || {}),
      ]
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error("analytics.funnel_event_failed", {
      eventName: input.eventName,
      eventKey: input.eventKey,
      error,
    });
    emitCriticalAlert("analytics.funnel_event_failed", {
      eventName: input.eventName,
      eventKey: input.eventKey,
    });
    return false;
  }
}

export function trackCompanyActivation(params: {
  companyId: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
}) {
  return trackFunnelEvent({
    eventName: "company_activated",
    eventKey: `company_activated:${params.companyId}`,
    companyId: params.companyId,
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
  });
}
