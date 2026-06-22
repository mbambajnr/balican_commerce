import { query } from "../config/db";

interface VettingInput {
  companyId: string;
}

export interface VettingResult {
  suggestedRiskLevel: "low" | "medium" | "high";
  suggestedCreditLimit: number | null;
  warnings: string[];
  scores: {
    accountAge: number;
    profileCompleteness: number;
    orderHistory: number;
    paymentHistory: number;
    engagementLevel: number;
    salesRepAssignment: number;
    weightedTotal: number;
  };
  details: {
    accountAgeDays: number;
    profileFieldsPresent: number;
    profileFieldsTotal: number;
    totalOrders: number;
    totalSpent: number;
    avgOrderValue: number | null;
    overdueOutstanding: number;
    cancelledOrderCount: number;
    totalPayments: number;
    totalRfqs: number;
    totalQuotations: number;
    acceptedQuotations: number;
    requestedCreditLimit: number | null;
    hasAssignedSalesRep: boolean;
    hasTaxId: boolean;
    hasRegNumber: boolean;
    hasFinanceContact: boolean;
  };
}

export async function assessCreditVetting(companyId: string): Promise<VettingResult> {
  const company = (await query(
    `SELECT created_at, tax_id, business_registration_number, contact_person_name,
            contact_person_email, contact_person_phone, address,
            finance_contact_name, finance_contact_email, finance_contact_phone,
            assigned_sales_rep_id, requested_credit_limit
     FROM companies WHERE id = $1`,
    [companyId]
  )).rows[0];

  if (!company) {
    throw new Error("Company not found");
  }

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(company.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const [ordersData, invoicesData, cancelledData, paymentsData, rfqsData, quotationsData, acceptedQuotationsData] =
    await Promise.all([
      query(
        `SELECT COUNT(*)::int as count, COALESCE(SUM(total), 0) as total_spent
         FROM orders WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
        [companyId]
      ),
      query(
        `SELECT COALESCE(SUM(CASE WHEN i.status = 'overdue' THEN i.outstanding_amount ELSE 0 END), 0) as overdue_amount
         FROM invoices i JOIN orders o ON i.order_id = o.id
         WHERE o.user_id IN (SELECT id FROM users WHERE company_id = $1)`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM orders
         WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)
         AND status = 'cancelled'`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM order_payments op
         JOIN orders o ON op.order_id = o.id
         WHERE o.user_id IN (SELECT id FROM users WHERE company_id = $1)`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM rfqs
         WHERE user_id IN (SELECT id FROM users WHERE company_id = $1)`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM quotations
         WHERE customer_id IN (SELECT id FROM users WHERE company_id = $1)`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*)::int as count FROM quotations
         WHERE customer_id IN (SELECT id FROM users WHERE company_id = $1)
         AND status = 'accepted'`,
        [companyId]
      ),
    ]);

  const totalOrders = ordersData.rows[0].count;
  const totalSpent = parseFloat(ordersData.rows[0].total_spent);
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : null;
  const overdueOutstanding = parseFloat(invoicesData.rows[0].overdue_amount);
  const cancelledOrderCount = cancelledData.rows[0].count;
  const totalPayments = paymentsData.rows[0].count;
  const totalRfqs = rfqsData.rows[0].count;
  const totalQuotations = quotationsData.rows[0].count;
  const acceptedQuotations = acceptedQuotationsData.rows[0].count;

  const warnings: string[] = [];

  // 1. Account Age (10%)
  let accountAgeScore = 0;
  if (accountAgeDays >= 365) accountAgeScore = 100;
  else if (accountAgeDays >= 180) accountAgeScore = 75;
  else if (accountAgeDays >= 90) accountAgeScore = 55;
  else if (accountAgeDays >= 30) accountAgeScore = 30;
  if (accountAgeDays < 30) warnings.push("New company (less than 30 days old)");

  // 2. Profile Completeness (15%)
  const profileFields = [
    company.tax_id,
    company.business_registration_number,
    company.contact_person_name,
    company.contact_person_email,
    company.contact_person_phone,
    company.address,
    company.finance_contact_name,
    company.finance_contact_email,
    company.finance_contact_phone,
  ];
  const profilePresent = profileFields.filter(Boolean).length;
  const profileTotal = profileFields.length;
  let profileScore = 0;
  if (profilePresent === profileTotal) profileScore = 100;
  else if (profilePresent >= 6) profileScore = 75;
  else if (profilePresent >= 3) profileScore = 40;
  if (profilePresent < 3) warnings.push("Incomplete company profile");

  // 3. Order History (30%)
  let orderScore = 0;
  if (totalOrders > 10) orderScore = 100;
  else if (totalOrders >= 6) orderScore = 80;
  else if (totalOrders >= 3) orderScore = 55;
  else if (totalOrders >= 1) orderScore = 30;
  if (totalOrders === 0) warnings.push("No previous order history");

  // 4. Payment History (25%)
  let paymentScore = 0;
  const hasOverdue = overdueOutstanding > 0;
  const hasCancelled = cancelledOrderCount > 0;
  if (hasOverdue) {
    paymentScore = 0;
    warnings.push("Previous overdue balance");
  } else if (hasCancelled) {
    paymentScore = 15;
    warnings.push("Previous cancelled orders");
  } else if (totalPayments === 0) {
    paymentScore = 20;
    warnings.push("No payment history");
  } else if (totalPayments >= 5) {
    paymentScore = 100;
  } else if (totalPayments >= 3) {
    paymentScore = 80;
  } else {
    paymentScore = 50;
  }

  // 5. Engagement Level (10%)
  let engagementScore = 0;
  if (totalOrders >= 3 && acceptedQuotations > 0) engagementScore = 100;
  else if (acceptedQuotations > 0) engagementScore = 65;
  else if (totalQuotations > 0) engagementScore = 45;
  else if (totalRfqs > 0) engagementScore = 25;

  // 6. Sales Rep Assignment (10%)
  const hasSalesRep = !!company.assigned_sales_rep_id;
  let salesRepScore = hasSalesRep ? 100 : 0;
  if (!hasSalesRep) warnings.push("No assigned sales representative");

  // Weighted total
  const weightedTotal =
    accountAgeScore * 0.10 +
    profileScore * 0.15 +
    orderScore * 0.30 +
    paymentScore * 0.25 +
    engagementScore * 0.10 +
    salesRepScore * 0.10;

  // Suggested risk level
  let suggestedRiskLevel: "low" | "medium" | "high";
  if (weightedTotal >= 70) suggestedRiskLevel = "low";
  else if (weightedTotal >= 40) suggestedRiskLevel = "medium";
  else suggestedRiskLevel = "high";

  // Additional warnings
  const requestedLimit = company.requested_credit_limit
    ? parseFloat(company.requested_credit_limit)
    : null;
  if (requestedLimit && totalSpent > 0 && requestedLimit > totalSpent) {
    warnings.push("Requested limit exceeds total historical spend");
  }
  if (requestedLimit && avgOrderValue && requestedLimit > avgOrderValue * 6) {
    warnings.push("Requested limit significantly exceeds average order value");
  }
  if (
    !company.finance_contact_name ||
    !company.finance_contact_email ||
    !company.finance_contact_phone
  ) {
    warnings.push("Incomplete finance contact information");
  }
  if (!company.tax_id) warnings.push("No TIN (GRA) provided");
  if (!company.business_registration_number) warnings.push("No business registration number provided");

  // Suggested credit limit
  let suggestedCreditLimit: number | null = null;
  if (totalOrders > 0 && !hasOverdue && !hasCancelled) {
    if (avgOrderValue) {
      suggestedCreditLimit = requestedLimit
        ? Math.min(requestedLimit * 0.5, avgOrderValue * 3)
        : avgOrderValue * 3;
      suggestedCreditLimit = Math.round(suggestedCreditLimit);
    }
  }

  return {
    suggestedRiskLevel,
    suggestedCreditLimit,
    warnings: [...new Set(warnings)],
    scores: {
      accountAge: accountAgeScore,
      profileCompleteness: profileScore,
      orderHistory: orderScore,
      paymentHistory: paymentScore,
      engagementLevel: engagementScore,
      salesRepAssignment: salesRepScore,
      weightedTotal: Math.round(weightedTotal * 100) / 100,
    },
    details: {
      accountAgeDays,
      profileFieldsPresent: profilePresent,
      profileFieldsTotal: profileTotal,
      totalOrders,
      totalSpent,
      avgOrderValue: avgOrderValue ? Math.round(avgOrderValue * 100) / 100 : null,
      overdueOutstanding,
      cancelledOrderCount,
      totalPayments,
      totalRfqs,
      totalQuotations,
      acceptedQuotations,
      requestedCreditLimit: requestedLimit,
      hasAssignedSalesRep: hasSalesRep,
      hasTaxId: !!company.tax_id,
      hasRegNumber: !!company.business_registration_number,
      hasFinanceContact: !!(company.finance_contact_name && company.finance_contact_email && company.finance_contact_phone),
    },
  };
}
