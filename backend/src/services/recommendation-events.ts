import { query } from "../config/db";

export type RecommendationEventType =
  | "RECOMMENDATION_VIEWED"
  | "PROVIDER_INVITED"
  | "PROPOSAL_VIEWED"
  | "PROPOSAL_SUBMITTED"
  | "QUOTE_ACCEPTED"
  | "AGREEMENT_CREATED"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELLED"
  | "PROVIDER_RATING_SUBMITTED";

export async function trackRecommendationEvent(params: {
  buyerCompanyId: string;
  providerCompanyId: string;
  eventType: RecommendationEventType;
  offeringId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}) {
  await query(
    `INSERT INTO recommendation_events (buyer_company_id, provider_company_id, offering_id, request_id, event_type, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.buyerCompanyId,
      params.providerCompanyId,
      params.offeringId || null,
      params.requestId || null,
      params.eventType,
      JSON.stringify(params.metadata || {}),
    ]
  );
}
