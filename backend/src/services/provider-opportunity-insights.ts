import { query } from "../config/db";

export async function getProviderOpportunityInsights(companyId: string) {
  const companyResult = await query(
    `SELECT business_categories, verification_status
     FROM companies WHERE id = $1`,
    [companyId]
  );
  const company = companyResult.rows[0];
  if (!company) return null;

  const categories: string[] = (company.business_categories || []).filter(Boolean);
  let requestsInCategoriesLast60Days = 0;
  if (categories.length > 0) {
    const countResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM scout_requests sr
       LEFT JOIN categories cat ON cat.id = sr.category_id
       WHERE sr.created_at >= NOW() - INTERVAL '60 days'
         AND (cat.slug = ANY($1::text[]) OR cat.name = ANY($1::text[]) OR cat.id::text = ANY($1::text[]))`,
      [categories]
    );
    requestsInCategoriesLast60Days = countResult.rows[0]?.count || 0;
  }

  return {
    categories,
    hasCategories: categories.length > 0,
    requestsInCategoriesLast60Days,
    verificationStatus: company.verification_status,
  };
}
