import { query } from "../config/db";
import { trackRecommendationEvent } from "./recommendation-events";

export interface MatchReason {
  reason: string;
  weight: number;
}

export interface Recommendation {
  providerCompanyId: string;
  providerName: string;
  providerType: string;
  offeringId: string | null;
  offeringType: "PRODUCT" | "SERVICE" | null;
  offeringName: string | null;
  rulesScore: number;
  mlScore: number | null;
  finalScore: number;
  matchReasons: MatchReason[];
}

interface RequestContext {
  categoryId?: string;
  categoryName?: string;
  requestType?: string;
  deliveryLocation?: string;
  buyerCompanyId?: string;
  buyerIndustry?: string;
}

function blendScore(rulesScore: number, mlScore: number | null): number {
  if (mlScore === null || mlScore === undefined) return rulesScore;
  return Math.round(rulesScore * 0.7 + mlScore * 0.3);
}

export async function getRecommendationsForRequest(
  requestId: string,
  context: RequestContext
): Promise<Recommendation[]> {
  const providers = await query(
    `SELECT c.id, c.name, c.company_type, c.verification_status,
            pp.industries_served, pp.service_areas, pp.operating_regions,
            pp.years_experience, pp.rating_average, pp.completed_orders_count,
            pp.verification_badge,
            scp.credit_tier, scp.vetting_status, scp.credit_limit
     FROM companies c
     LEFT JOIN provider_profiles pp ON pp.company_id = c.id
     LEFT JOIN supplier_credit_profiles scp ON scp.company_id = c.id
     WHERE c.is_provider = true
       AND c.status = 'active'
       AND c.verification_status = 'approved'`,
    []
  );

  const recommendations: Recommendation[] = [];

  for (const provider of providers.rows) {
    let score = 0;
    const reasons: MatchReason[] = [];
    const maxScore = 100;
    const providerName = provider.name || "Provider";

    // Weight 1: Provider verification (10 pts)
    if (provider.verification_status === "approved") {
      score += 10;
      reasons.push({ reason: `${providerName} is a verified provider`, weight: 10 });
    }

    // Weight 2: Location/coverage match (15 pts)
    if (context.deliveryLocation) {
      const areas = provider.service_areas || [];
      const regions = provider.operating_regions || [];
      const allAreas = [...areas, ...regions];
      const locationMatch = allAreas.some((a: string) =>
        context.deliveryLocation!.toLowerCase().includes(a.toLowerCase()) ||
        a.toLowerCase().includes(context.deliveryLocation!.toLowerCase())
      );
      if (locationMatch) {
        score += 15;
        const matched = allAreas.find((a: string) =>
          context.deliveryLocation!.toLowerCase().includes(a.toLowerCase()) ||
          a.toLowerCase().includes(context.deliveryLocation!.toLowerCase())
        );
        reasons.push({ reason: `Covers ${context.deliveryLocation}${matched && matched !== context.deliveryLocation ? ` (${matched})` : ""}`, weight: 15 });
      }
    }

    // Weight 3: Category match (15 pts)
    if (context.categoryId) {
      const [prodMatch, svcMatch] = await Promise.all([
        query(
          `SELECT COUNT(*)::int as cnt, MIN(name) as name FROM products
           WHERE provider_company_id = $1 AND category_id = $2 AND is_active = true`,
          [provider.id, context.categoryId]
        ),
        query(
          `SELECT COUNT(*)::int as cnt, MIN(name) as name FROM services
           WHERE provider_company_id = $1 AND category_id = $2 AND is_active = true`,
          [provider.id, context.categoryId]
        ),
      ]);
      const prodCnt = prodMatch.rows[0].cnt;
      const svcCnt = svcMatch.rows[0].cnt;
      if (prodCnt > 0 || svcCnt > 0) {
        score += 15;
        const catLabel = context.categoryName || "this category";
        const offeringName = prodCnt > 0 ? prodMatch.rows[0].name : svcMatch.rows[0].name;
        if (offeringName) {
          reasons.push({ reason: `Offers "${offeringName}" in ${catLabel}`, weight: 15 });
        } else {
          reasons.push({ reason: `Has offerings in ${catLabel}`, weight: 15 });
        }
      }
    }

    // Weight 4: Request type match (10 pts)
    if (context.requestType) {
      const isProduct = context.requestType === "product";
      const isService = context.requestType === "service";
      if (isProduct && provider.company_type?.includes("supplier")) {
        score += 10;
        reasons.push({ reason: `Supplies products matching your request`, weight: 10 });
      }
      if (isService && provider.company_type?.includes("service")) {
        score += 10;
        reasons.push({ reason: `Offers services matching your request`, weight: 10 });
      }
    }

    // Weight 5: Document/certificate completeness (10 pts)
    const docCount = await query(
      `SELECT COUNT(*)::int as cnt FROM offering_documents
       WHERE company_id = $1 AND is_active = true AND is_public = true`,
      [provider.id]
    );
    const docs = docCount.rows[0].cnt;
    if (docs > 0) {
      const docPts = Math.min(10, docs * 2);
      score += docPts;
      reasons.push({ reason: `${docs} supporting document${docs > 1 ? "s" : ""} available (datasheets, certificates)`, weight: docPts });
    }

    // Weight 6: Credit/payment terms (10 pts)
    if (provider.credit_tier && provider.credit_tier !== "unrated") {
      const tierPts = provider.credit_tier === "premium" ? 10 :
                      provider.credit_tier === "standard" ? 7 : 4;
      score += tierPts;
      const tierLabel = provider.credit_tier.charAt(0).toUpperCase() + provider.credit_tier.slice(1);
      reasons.push({ reason: `${tierLabel} credit tier — supports flexible payment terms`, weight: tierPts });
    }

    // Weight 7: Past orders/agreements (10 pts)
    if (provider.completed_orders_count > 0) {
      const orderPts = Math.min(10, provider.completed_orders_count * 2);
      score += orderPts;
      reasons.push({ reason: `${provider.completed_orders_count} completed order${provider.completed_orders_count > 1 ? "s" : ""} on platform`, weight: orderPts });
    }

    // Weight 8: Experience (5 pts)
    if (provider.years_experience && provider.years_experience >= 1) {
      const expPts = Math.min(5, Math.floor(provider.years_experience / 2));
      score += expPts;
      reasons.push({ reason: `${provider.years_experience}+ years in business`, weight: expPts });
    }

    // Weight 9: Rating (5 pts)
    if (provider.rating_average && provider.rating_average > 0) {
      const ratingPts = Math.round(provider.rating_average * 1.5);
      score += ratingPts;
      reasons.push({ reason: `${provider.rating_average.toFixed(1)} star rating from buyers`, weight: ratingPts });
    }

    // Weight 10: Buyer industry match (5 pts)
    if (context.buyerIndustry && provider.industries_served) {
      const match = (provider.industries_served || []).some(
        (ind: string) => ind.toLowerCase().includes(context.buyerIndustry!.toLowerCase()) ||
                         context.buyerIndustry!.toLowerCase().includes(ind.toLowerCase())
      );
      if (match) {
        score += 5;
        reasons.push({ reason: `Serves your industry (${context.buyerIndustry})`, weight: 5 });
      }
    }

    // Weight 11: Response time bonus (5 pts)
    if (context.requestType === "service") {
      const svcResponse = await query(
        `SELECT COUNT(*)::int as cnt FROM services
         WHERE provider_company_id = $1 AND is_active = true
           AND estimated_response_time IS NOT NULL`,
        [provider.id]
      );
      if (svcResponse.rows[0].cnt > 0) {
        score += 5;
        reasons.push({ reason: "Provides estimated response times on services", weight: 5 });
      }
    }

    const rulesScore = Math.round((score / (maxScore + 5)) * 100);
    const mlScore: number | null = null;
    const finalScore = blendScore(rulesScore, mlScore);

    if (finalScore > 0) {
      let offeringId: string | null = null;
      let offeringName: string | null = null;
      let offeringType: "PRODUCT" | "SERVICE" | null = null;

      if (context.categoryId) {
        const bestProd = await query(
          `SELECT id, name FROM products
           WHERE provider_company_id = $1 AND category_id = $2 AND is_active = true
           ORDER BY created_at DESC LIMIT 1`,
          [provider.id, context.categoryId]
        );
        if (bestProd.rows.length > 0) {
          offeringId = bestProd.rows[0].id;
          offeringName = bestProd.rows[0].name;
          offeringType = "PRODUCT";
        } else {
          const bestSvc = await query(
            `SELECT id, name FROM services
             WHERE provider_company_id = $1 AND category_id = $2 AND is_active = true
             ORDER BY created_at DESC LIMIT 1`,
            [provider.id, context.categoryId]
          );
          if (bestSvc.rows.length > 0) {
            offeringId = bestSvc.rows[0].id;
            offeringName = bestSvc.rows[0].name;
            offeringType = "SERVICE";
          }
        }
      }

      recommendations.push({
        providerCompanyId: provider.id,
        providerName,
        providerType: provider.company_type,
        offeringId,
        offeringType,
        offeringName,
        rulesScore,
        mlScore,
        finalScore,
        matchReasons: reasons,
      });
    }
  }

  const sorted = recommendations.sort((a, b) => b.finalScore - a.finalScore).slice(0, 15);

  // Track recommendation view event if buyer context is known
  if (context.buyerCompanyId) {
    for (const rec of sorted) {
      await trackRecommendationEvent({
        buyerCompanyId: context.buyerCompanyId,
        providerCompanyId: rec.providerCompanyId,
        eventType: "RECOMMENDATION_VIEWED",
        offeringId: rec.offeringId || undefined,
        requestId,
        metadata: { score: rec.finalScore, rulesScore: rec.rulesScore, matchReasons: rec.matchReasons.map(r => r.reason) },
      }).catch(() => {});
    }
  }

  return sorted;
}

export async function getRecommendedOpportunitiesForProvider(
  providerCompanyId: string
): Promise<any[]> {
  const provider = (await query(
    `SELECT c.id, c.name, pp.service_areas, pp.operating_regions, pp.industries_served
     FROM companies c
     LEFT JOIN provider_profiles pp ON pp.company_id = c.id
     WHERE c.id = $1`,
    [providerCompanyId]
  )).rows[0];

  if (!provider) return [];

  const scopes = [...(provider.service_areas || []), ...(provider.operating_regions || [])];
  const categories = await query(
    `SELECT DISTINCT category_id FROM products WHERE provider_company_id = $1 AND is_active = true
     UNION
     SELECT DISTINCT category_id FROM services WHERE provider_company_id = $1 AND is_active = true`,
    [providerCompanyId]
  );
  const catIds = categories.rows.map((r: any) => r.category_id);

  if (catIds.length === 0) return [];

  const opportunities = await query(
    `SELECT sr.*, c.name as category_name
     FROM scout_requests sr
     LEFT JOIN categories c ON c.id = sr.category_id
     WHERE sr.status = 'open'
       AND (sr.category_id = ANY($1) OR $1 = ARRAY[]::uuid[])
       AND sr.company_id != $2
     ORDER BY sr.created_at DESC
     LIMIT 20`,
    [catIds, providerCompanyId]
  );

  return opportunities.rows.map((opp: any) => {
    const locationMatch = scopes.some(
      (s: string) => opp.delivery_location?.toLowerCase().includes(s.toLowerCase())
    );
    return {
      ...opp,
      matchReason: locationMatch
        ? "This opportunity matches your catalogue and service area coverage."
        : "This opportunity matches your product/service catalogue.",
    };
  });
}
