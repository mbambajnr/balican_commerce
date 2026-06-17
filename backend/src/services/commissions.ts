import { TransactionClient } from "../config/db";
import { config } from "../config";
import { emitCriticalAlert } from "./alerts";

export interface CommissionAccrualResult {
  accrued: boolean;
  ledgerId?: string;
  reason?: string;
}

export async function accrueCommissionForCompletedOrder(
  client: TransactionClient,
  orderId: string,
): Promise<CommissionAccrualResult> {
  const existing = await client.query(
    "SELECT id FROM commission_ledger WHERE order_id = $1 FOR UPDATE",
    [orderId]
  );
  if (existing.rows.length > 0) {
    return { accrued: false, ledgerId: existing.rows[0].id, reason: "already_accrued" };
  }

  const context = await client.query(
    `WITH order_base AS (
       SELECT o.id, o.total, o.user_id, o.scout_request_id, o.procurement_request_id, o.agreement_id,
              buyer.company_id as buyer_company_id
       FROM orders o
       JOIN users buyer ON buyer.id = o.user_id
       WHERE o.id = $1
     ),
     provider_context AS (
       SELECT ob.id as order_id, ob.total, ob.buyer_company_id,
              COALESCE(sa.provider_company_id, prp.provider_company_id, sq.provider_company_id) as provider_company_id,
              COALESCE(sr.category_id, product_category.category_id) as category_id,
              CASE
                WHEN sa.id IS NOT NULL THEN 'agreement'
                WHEN pr.id IS NOT NULL THEN 'procurement'
                WHEN sq.id IS NOT NULL THEN 'scout_quote'
                ELSE 'unknown'
              END as source
       FROM order_base ob
       LEFT JOIN scout_agreements sa ON sa.id = ob.agreement_id
       LEFT JOIN scout_requests sr ON sr.id = COALESCE(sa.scout_request_id, ob.scout_request_id)
       LEFT JOIN scout_quotes sq ON sq.order_id = ob.id
       LEFT JOIN procurement_requests pr ON pr.id = ob.procurement_request_id
       LEFT JOIN procurement_request_providers prp ON prp.request_id = pr.id AND prp.status = 'selected'
       LEFT JOIN LATERAL (
         SELECT p.category_id
         FROM request_items ri
         JOIN products p ON p.id = ri.product_id
         WHERE ri.request_id = pr.id
         ORDER BY ri.sort_order ASC NULLS LAST
         LIMIT 1
       ) product_category ON TRUE
     ),
     rate_context AS (
       SELECT pc.*,
              COALESCE(category_rate.rate_percent, global_rate.rate_percent, 0)::numeric(5,2) as rate_percent
       FROM provider_context pc
       LEFT JOIN commission_rates category_rate
         ON category_rate.category_id = pc.category_id AND category_rate.is_active = TRUE
       LEFT JOIN commission_rates global_rate
         ON global_rate.category_id IS NULL AND global_rate.is_active = TRUE
     )
     SELECT * FROM rate_context`,
    [orderId]
  );

  const row = context.rows[0];
  if (!row?.buyer_company_id || !row?.provider_company_id) {
    return { accrued: false, reason: "missing_buyer_or_provider" };
  }

  const insert = await client.query(
    `INSERT INTO commission_ledger
       (order_id, buyer_company_id, provider_company_id, category_id,
        base_amount, rate_percent, commission_amount, currency, status, metadata)
     VALUES (
       $1, $2, $3, $4,
       $5::numeric(12,2),
       $6::numeric(5,2),
       ROUND(($5::numeric * $6::numeric / 100), 2),
       $7,
       'accrued',
       $8
     )
     ON CONFLICT (order_id) DO NOTHING
     RETURNING id`,
    [
      orderId,
      row.buyer_company_id,
      row.provider_company_id,
      row.category_id || null,
      row.total,
      row.rate_percent,
      config.paystack.currency,
      JSON.stringify({ source: row.source }),
    ]
  );

  if (insert.rows.length === 0) {
    return { accrued: false, reason: "already_accrued" };
  }

  await client.query(
    `INSERT INTO activities (entity_type, entity_id, type, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      "order",
      orderId,
      "commission.accrued",
      "Platform commission accrued",
      JSON.stringify({
        ledgerId: insert.rows[0].id,
        baseAmount: row.total,
        ratePercent: row.rate_percent,
        currency: config.paystack.currency,
      }),
    ]
  );

  return { accrued: true, ledgerId: insert.rows[0].id };
}

export function alertCommissionAccrualFailure(orderId: string, error: unknown) {
  emitCriticalAlert("commission.accrual_failed", {
    orderId,
    error: error instanceof Error ? error.message : String(error),
  }, 0);
}
