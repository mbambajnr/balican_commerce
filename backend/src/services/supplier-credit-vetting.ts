import { query } from "../config/db";

export interface SupplierVettingResult {
  suggestedTier: "premium" | "standard" | "basic" | "unrated";
  suggestedCreditLimit: number | null;
  warnings: string[];
  scores: {
    accountAge: number;
    orderFulfillment: number;
    profileCompleteness: number;
    engagement: number;
    listingsQuality: number;
    weightedTotal: number;
  };
  details: {
    accountAgeDays: number;
    totalOrders: number;
    completedOrders: number;
    fulfilmentRate: number | null;
    hasVerificationBadge: boolean;
    hasDescription: boolean;
    hasLogo: boolean;
    hasBusinessCategories: boolean;
    hasServiceAreas: boolean;
    hasCertifications: boolean;
    hasYearsExperience: boolean;
    hasLicenses: boolean;
    hasWebsite: boolean;
    totalQuotes: number;
    totalActiveProducts: number;
    totalActiveServices: number;
    creditEligibleListings: number;
  };
}

export async function assessSupplierCreditVetting(companyId: string): Promise<SupplierVettingResult> {
  const company = (await query(
    `SELECT c.id, c.created_at, c.description, c.website, c.business_categories, c.service_areas,
            c.years_in_business, c.logo_url, c.verification_status, c.status, c.is_provider,
            pp.verification_badge, pp.years_experience, pp.certifications, pp.licenses,
            pp.completed_orders_count, pp.completed_jobs_count
     FROM companies c
     LEFT JOIN provider_profiles pp ON pp.company_id = c.id
     WHERE c.id = $1`,
    [companyId]
  )).rows[0];

  if (!company) throw new Error("Company not found");

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(company.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const [ordersData, quotesData, productsData, servicesData] = await Promise.all([
    query(
      `SELECT
        COUNT(*)::int as total_orders,
        COUNT(*) FILTER (WHERE o.status IN ('completed', 'paid'))::int as completed_orders
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE u.company_id = $1`,
      [companyId]
    ),
    query(
      `SELECT COUNT(*)::int as total_quotes
       FROM procurement_request_providers prp
       WHERE prp.provider_company_id = $1`,
      [companyId]
    ),
    query(
      `SELECT COUNT(*)::int as active_count,
              COUNT(*) FILTER (WHERE credit_eligible = true)::int as credit_eligible_count
       FROM products
       WHERE provider_company_id = $1 AND is_active = true`,
      [companyId]
    ),
    query(
      `SELECT COUNT(*)::int as active_count,
              COUNT(*) FILTER (WHERE credit_eligible = true)::int as credit_eligible_count
       FROM services
       WHERE provider_company_id = $1 AND is_active = true`,
      [companyId]
    ),
  ]);

  const totalOrders = ordersData.rows[0].total_orders;
  const completedOrders = ordersData.rows[0].completed_orders;
  const fulfillmentRate = totalOrders > 0 ? completedOrders / totalOrders : null;
  const totalQuotes = quotesData.rows[0].total_quotes;
  const totalActiveProducts = productsData.rows[0].active_count;
  const totalActiveServices = servicesData.rows[0].active_count;
  const creditEligibleListings =
    productsData.rows[0].credit_eligible_count + servicesData.rows[0].credit_eligible_count;

  const warnings: string[] = [];

  // 1. Account Age (15%)
  let accountAgeScore = 0;
  if (accountAgeDays >= 365) accountAgeScore = 90;
  else if (accountAgeDays >= 180) accountAgeScore = 75;
  else if (accountAgeDays >= 90) accountAgeScore = 50;
  else if (accountAgeDays >= 30) accountAgeScore = 25;
  if (accountAgeDays < 30) warnings.push("New provider (less than 30 days)");

  // 2. Order Fulfillment (30%)
  let fulfillmentScore = 0;
  if (totalOrders === 0) {
    fulfillmentScore = 0;
    warnings.push("No completed orders yet");
  } else if (fulfillmentRate !== null && fulfillmentRate >= 0.8) {
    fulfillmentScore = 100;
  } else if (fulfillmentRate !== null && fulfillmentRate >= 0.5) {
    fulfillmentScore = 60;
  } else if (fulfillmentRate !== null && fulfillmentRate >= 0.2) {
    fulfillmentScore = 30;
  } else {
    fulfillmentScore = 10;
  }
  if (fulfillmentRate !== null && fulfillmentRate < 0.5 && totalOrders > 2) {
    warnings.push("Low order fulfillment rate");
  }

  // 3. Profile Completeness (15%)
  const profileFields = [
    company.description, company.logo_url, company.business_categories,
    company.service_areas, company.certifications, company.years_experience,
    company.licenses, company.website,
  ];
  const profilePresent = profileFields.filter(Boolean).length;
  const profileTotal = profileFields.length;
  let profileScore = 0;
  if (profilePresent >= 7) profileScore = 100;
  else if (profilePresent >= 5) profileScore = 70;
  else if (profilePresent >= 3) profileScore = 40;
  else profileScore = 10;
  if (profilePresent < 3) warnings.push("Incomplete provider profile");

  // 4. Engagement (15%)
  let engagementScore = 0;
  if (totalQuotes >= 20) engagementScore = 100;
  else if (totalQuotes >= 10) engagementScore = 75;
  else if (totalQuotes >= 5) engagementScore = 50;
  else if (totalQuotes >= 1) engagementScore = 25;
  if (totalQuotes === 0) warnings.push("No procurement quotes submitted yet");

  // 5. Listings Quality (15%)
  const totalListings = totalActiveProducts + totalActiveServices;
  let listingsScore = 0;
  if (totalListings >= 20) listingsScore = 100;
  else if (totalListings >= 10) listingsScore = 80;
  else if (totalListings >= 5) listingsScore = 55;
  else if (totalListings >= 1) listingsScore = 25;

  // Bonus: credit_eligible listings
  if (creditEligibleListings > 0) listingsScore = Math.min(100, listingsScore + 10);

  // 6. Verification (10%)
  let verificationScore = 0;
  if (company.verification_status === "approved") verificationScore = 100;
  else if (company.verification_status === "pending") verificationScore = 30;
  else verificationScore = 0;
  if (company.verification_badge) verificationScore = Math.min(100, verificationScore + 10);

  // Weighted total
  const weightedTotal =
    accountAgeScore * 0.15 +
    fulfillmentScore * 0.30 +
    profileScore * 0.15 +
    engagementScore * 0.15 +
    listingsScore * 0.15 +
    verificationScore * 0.10;

  // Suggested tier
  let suggestedTier: "premium" | "standard" | "basic" | "unrated";
  if (totalListings === 0 && totalOrders === 0) {
    suggestedTier = "unrated";
  } else if (weightedTotal >= 70) {
    suggestedTier = "premium";
  } else if (weightedTotal >= 40) {
    suggestedTier = "standard";
  } else {
    suggestedTier = "basic";
  }

  // Suggested credit limit
  let suggestedCreditLimit: number | null = null;
  if (totalOrders > 0 && fulfillmentRate !== null && fulfillmentRate >= 0.5) {
    const avgQuoteResult = await query(
      `SELECT AVG(quote_amount) as avg_quote FROM procurement_request_providers
       WHERE provider_company_id = $1 AND quote_amount IS NOT NULL`,
      [companyId]
    );
    const avgQuote = avgQuoteResult.rows[0]?.avg_quote
      ? parseFloat(avgQuoteResult.rows[0].avg_quote)
      : null;

    if (avgQuote && avgQuote > 0) {
      suggestedCreditLimit = Math.round(avgQuote * 5);
    } else if (completedOrders > 0) {
      suggestedCreditLimit = completedOrders * 1000; // fallback: 1000 GHS per completed order
    }
  }
  if (suggestedCreditLimit !== null) {
    suggestedCreditLimit = Math.min(suggestedCreditLimit, 1000000); // cap at 1M GHS
  }

  // Additional warnings
  if (company.verification_status !== "approved") {
    warnings.push("Provider not yet verified");
  }
  if (totalActiveProducts === 0 && totalActiveServices === 0) {
    warnings.push("No active products or services listed");
  }

  return {
    suggestedTier,
    suggestedCreditLimit,
    warnings: [...new Set(warnings)],
    scores: {
      accountAge: accountAgeScore,
      orderFulfillment: fulfillmentScore,
      profileCompleteness: profileScore,
      engagement: engagementScore,
      listingsQuality: listingsScore,
      weightedTotal: Math.round(weightedTotal * 100) / 100,
    },
    details: {
      accountAgeDays,
      totalOrders,
      completedOrders,
      fulfilmentRate: fulfillmentRate !== null ? Math.round(fulfillmentRate * 100) / 100 : null,
      hasVerificationBadge: !!company.verification_badge,
      hasDescription: !!company.description,
      hasLogo: !!company.logo_url,
      hasBusinessCategories: !!(company.business_categories?.length > 0),
      hasServiceAreas: !!(company.service_areas?.length > 0),
      hasCertifications: !!(company.certifications?.length > 0),
      hasYearsExperience: !!company.years_experience,
      hasLicenses: !!company.licenses?.length,
      hasWebsite: !!company.website,
      totalQuotes,
      totalActiveProducts,
      totalActiveServices,
      creditEligibleListings,
    },
  };
}
