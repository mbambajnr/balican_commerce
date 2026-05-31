import { query } from "../config/db";

export interface ScoreComponent {
  score: number;
  max: number;
  label: string;
}

export interface SupplierScoreBreakdown {
  credit: ScoreComponent;
  responseRate: ScoreComponent;
  responseSpeed: ScoreComponent;
  completedOrders: ScoreComponent;
  profileCompleteness: ScoreComponent;
}

export interface SupplierTrustSignals {
  creditTier: string;
  creditStatus: string;
  quoteResponseRate: number | null;
  averageResponseHours: number | null;
  completedProcurementOrders: number;
  profileCompleteness: number;
}

export interface SupplierScoreResult {
  supplierScore: number;
  scoreBreakdown: SupplierScoreBreakdown;
  trustSignals: SupplierTrustSignals;
}

/* ── Credit tier score (30 pts) ── */
function scoreCreditTier(tier: string, status: string): ScoreComponent {
  const MAX = 30;
  if (status === "approved") {
    if (tier === "premium") return { score: 30, max: MAX, label: "Premium credit approved" };
    if (tier === "standard") return { score: 22, max: MAX, label: "Standard credit approved" };
    return { score: 14, max: MAX, label: "Basic credit approved" };
  }
  if (status === "pending_review") return { score: 5, max: MAX, label: "Credit review in progress" };
  if (status === "rejected") return { score: 0, max: MAX, label: "Credit rejected" };
  return { score: 0, max: MAX, label: "Credit not yet assessed" };
}

/* ── Response rate (25 pts) ── */
function scoreResponseRate(rate: number | null): ScoreComponent {
  const MAX = 25;
  if (rate === null) return { score: 0, max: MAX, label: "No procurement history yet" };
  const pct = Math.round(rate * 100);
  const score = Math.round(rate * MAX);
  return { score, max: MAX, label: `${pct}% quote response rate` };
}

/* ── Response speed (20 pts) ── */
function scoreResponseSpeed(avgHours: number | null): ScoreComponent {
  const MAX = 20;
  if (avgHours === null) return { score: 0, max: MAX, label: "No response data yet" };
  // ≤2h → 20, ≤6h → 16, ≤24h → 12, ≤48h → 8, ≤96h → 4, >96h → 0
  let score: number;
  let label: string;
  if (avgHours <= 2) { score = 20; label = `Usually responds in ${Math.round(avgHours)}h`; }
  else if (avgHours <= 6) { score = 16; label = `Usually responds in ${Math.round(avgHours)}h`; }
  else if (avgHours <= 24) { score = 12; label = `Usually responds in ${Math.round(avgHours)}h`; }
  else if (avgHours <= 48) { score = 8; label = `Usually responds within 2 days`; }
  else if (avgHours <= 96) { score = 4; label = `Usually responds within 4 days`; }
  else { score = 0; label = `Slow to respond (${Math.round(avgHours / 24)}d avg)`; }
  return { score, max: MAX, label };
}

/* ── Completed procurement orders (15 pts) ── */
function scoreCompletedOrders(count: number): ScoreComponent {
  const MAX = 15;
  // 0→0, 1-2→4, 3-9→8, 10-24→12, 25+→15
  let score: number;
  if (count === 0) score = 0;
  else if (count <= 2) score = 4;
  else if (count <= 9) score = 8;
  else if (count <= 24) score = 12;
  else score = 15;
  const label = count === 0
    ? "No completed procurement orders yet"
    : `${count} completed procurement order${count !== 1 ? "s" : ""}`;
  return { score, max: MAX, label };
}

/* ── Profile completeness (10 pts) ── */
function scoreProfileCompleteness(completeness: number): ScoreComponent {
  const MAX = 10;
  const score = Math.round(completeness * MAX);
  const pct = Math.round(completeness * 100);
  return { score, max: MAX, label: `Profile ${pct}% complete` };
}

/* ── Profile completeness calculation ── */
function calcProfileCompleteness(row: {
  description: string | null;
  website: string | null;
  logo_url: string | null;
  city: string | null;
  phone: string | null;
  years_experience: number | null;
  certifications: string[] | null;
  display_name: string | null;
  provider_type: string | null;
  service_areas: string[] | null;
}): number {
  const fields = [
    Boolean(row.description),
    Boolean(row.website),
    Boolean(row.logo_url),
    Boolean(row.city),
    Boolean(row.phone),
    Boolean(row.years_experience),
    Boolean(row.certifications && row.certifications.length > 0),
    Boolean(row.display_name),
    Boolean(row.provider_type),
    Boolean(row.service_areas && row.service_areas.length > 0),
  ];
  const filled = fields.filter(Boolean).length;
  return filled / fields.length;
}

/* ── Main scoring function ── */
export async function computeSupplierScore(companyId: string): Promise<SupplierScoreResult> {
  // Fetch all needed data in parallel
  const [companyResult, creditResult, procResult] = await Promise.all([
    query(
      `SELECT c.description, c.website, c.logo_url, c.city, c.phone,
              pp.years_experience, pp.certifications, pp.display_name,
              pp.provider_type, pp.service_areas
       FROM companies c
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       WHERE c.id = $1`,
      [companyId]
    ),
    query(
      `SELECT vetting_status, credit_tier
       FROM supplier_credit_profiles WHERE company_id = $1`,
      [companyId]
    ),
    // Response rate = invited/viewed who then submitted a quote / total invited
    // Response speed = avg hours from created_at to responded_at where responded_at is not null
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'invited') as total_engaged,
         COUNT(*) FILTER (WHERE status = 'quoted') as total_quoted,
         COUNT(*) as total_invited,
         AVG(
           EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600.0
         ) FILTER (WHERE responded_at IS NOT NULL) as avg_response_hours
       FROM procurement_request_providers
       WHERE provider_company_id = $1`,
      [companyId]
    ),
  ]);

  // Completed procurement orders
  const ordersResult = await query(
    `SELECT COUNT(*) as count
     FROM orders o
     JOIN procurement_requests pr ON pr.id = o.procurement_request_id
     JOIN procurement_request_providers prp
       ON prp.request_id = pr.id AND prp.provider_company_id = $1
     WHERE o.status = 'completed'`,
    [companyId]
  );

  const company = companyResult.rows[0] || {};
  const credit = creditResult.rows[0] || { vetting_status: "unrated", credit_tier: "basic" };
  const proc = procResult.rows[0] || {};
  const completedOrders = parseInt(ordersResult.rows[0]?.count ?? "0");

  // Response rate: only count suppliers that were at minimum viewed/engaged
  const totalInvited = parseInt(proc.total_invited ?? "0");
  const totalQuoted = parseInt(proc.total_quoted ?? "0");
  const quoteResponseRate = totalInvited > 0 ? totalQuoted / totalInvited : null;
  const averageResponseHours = proc.avg_response_hours != null
    ? parseFloat(proc.avg_response_hours)
    : null;

  const profileCompleteness = calcProfileCompleteness(company);

  const creditComp = scoreCreditTier(credit.credit_tier ?? "basic", credit.vetting_status ?? "unrated");
  const responseRateComp = scoreResponseRate(quoteResponseRate);
  const responseSpeedComp = scoreResponseSpeed(averageResponseHours);
  const completedOrdersComp = scoreCompletedOrders(completedOrders);
  const profileComp = scoreProfileCompleteness(profileCompleteness);

  const supplierScore = creditComp.score + responseRateComp.score +
    responseSpeedComp.score + completedOrdersComp.score + profileComp.score;

  return {
    supplierScore,
    scoreBreakdown: {
      credit: creditComp,
      responseRate: responseRateComp,
      responseSpeed: responseSpeedComp,
      completedOrders: completedOrdersComp,
      profileCompleteness: profileComp,
    },
    trustSignals: {
      creditTier: credit.credit_tier ?? "basic",
      creditStatus: credit.vetting_status ?? "unrated",
      quoteResponseRate,
      averageResponseHours,
      completedProcurementOrders: completedOrders,
      profileCompleteness,
    },
  };
}
