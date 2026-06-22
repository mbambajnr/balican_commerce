import { query } from "../config/db";

export const REQUIRED_BUSINESS_PROFILE_FIELDS = [
  { key: "taxId", column: "tax_id", label: "TIN (GRA)" },
  { key: "businessRegistrationNumber", column: "business_registration_number", label: "business registration number" },
  { key: "requestedPaymentTerms", column: "requested_payment_terms", label: "payment terms" },
] as const;

export function businessProfileCompletion(company: Record<string, any>) {
  const missingFields = REQUIRED_BUSINESS_PROFILE_FIELDS
    .filter(({ column }) => !String(company[column] || "").trim())
    .map(({ key, label }) => ({ key, label }));
  return { complete: missingFields.length === 0, missingFields };
}

export async function getBusinessProfile(companyId: string) {
  const result = await query(
    `SELECT id, name, business_type, industry, email, phone, address, city, state,
            tax_id, business_registration_number, contact_person_name,
            contact_person_email, contact_person_phone, requested_payment_terms
     FROM companies WHERE id = $1`,
    [companyId]
  );
  return result.rows[0] || null;
}

export function businessProfileError(action: string, company: Record<string, any>) {
  const completion = businessProfileCompletion(company);
  return {
    error: `Complete your business profile before ${action}. Required: ${completion.missingFields.map((field) => field.label).join(", ")}.`,
    code: "BUSINESS_PROFILE_INCOMPLETE",
    missingFields: completion.missingFields,
  };
}
