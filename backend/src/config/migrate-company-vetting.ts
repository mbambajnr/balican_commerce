import { pool } from "./db";

const migration = `
-- 1. Vetting questions configuration table
CREATE TABLE IF NOT EXISTS vetting_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key VARCHAR(100) NOT NULL UNIQUE,
  label TEXT NOT NULL,
  helper_text TEXT,
  input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('select', 'slider', 'yes_no', 'text', 'number', 'currency', 'upload')),
  options JSONB,
  required BOOLEAN NOT NULL DEFAULT false,
  score_weight INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  applies_to VARCHAR(20) DEFAULT 'all' CHECK (applies_to IN ('all', 'guest', 'registered')),
  conditional_logic JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vetting submissions (one per company per version)
CREATE TABLE IF NOT EXISTS vetting_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'needs_info', 'rejected')),
  score INTEGER,
  score_band VARCHAR(20),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vetting_submissions_company ON vetting_submissions(company_id);
CREATE INDEX IF NOT EXISTS idx_vetting_submissions_status ON vetting_submissions(status);

-- 3. Vetting responses (individual answers)
CREATE TABLE IF NOT EXISTS vetting_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES vetting_submissions(id) ON DELETE CASCADE,
  question_key VARCHAR(100) NOT NULL,
  question_label TEXT NOT NULL,
  question_input_type VARCHAR(20) NOT NULL,
  question_options JSONB,
  question_score_weight INTEGER NOT NULL DEFAULT 0,
  raw_value TEXT,
  display_label TEXT,
  score_contribution INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vetting_responses_submission ON vetting_responses(submission_id);

-- 4. Vetting audit log
CREATE TABLE IF NOT EXISTS vetting_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES vetting_submissions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES users(id),
  action VARCHAR(30) NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'needs_info', 'note_added', 'status_changed')),
  previous_status VARCHAR(30),
  new_status VARCHAR(30),
  note TEXT,
  score_at_action INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vetting_audit_company ON vetting_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_vetting_audit_submission ON vetting_audit_log(submission_id);
`;

async function run() {
  try {
    console.log("Running company vetting migration...");
    await pool.query(migration);
    console.log("Vetting tables created successfully.");

    // Upsert seed questions
    console.log("Seeding vetting questions...");
    const questions = [
      {
        question_key: "business_age",
        label: "How long has your company been operating?",
        helper_text: "This helps us understand your business experience",
        input_type: "select",
        options: JSON.stringify([
          { value: "less_than_6mo", label: "Less than 6 months" },
          { value: "6mo_1yr", label: "6 months – 1 year" },
          { value: "1_3yr", label: "1–3 years" },
          { value: "3_5yr", label: "3–5 years" },
          { value: "more_than_5yr", label: "More than 5 years" },
        ]),
        required: true,
        score_weight: 15,
        display_order: 1,
      },
      {
        question_key: "business_type",
        label: "What type of business do you run?",
        input_type: "select",
        options: JSON.stringify([
          { value: "retailer", label: "Retailer" },
          { value: "wholesaler", label: "Wholesaler" },
          { value: "distributor", label: "Distributor" },
          { value: "contractor", label: "Contractor" },
          { value: "manufacturer", label: "Manufacturer" },
          { value: "institution", label: "School / Institution" },
          { value: "government", label: "Government / NGO" },
          { value: "other", label: "Other" },
        ]),
        required: true,
        score_weight: 5,
        display_order: 2,
      },
      {
        question_key: "monthly_purchase_volume",
        label: "How much does your company usually spend on supplies per month?",
        helper_text: "This helps us recommend the right purchasing options for you",
        input_type: "select",
        options: JSON.stringify([
          { value: "under_1000", label: "Under GHS 1,000" },
          { value: "1000_5000", label: "GHS 1,000 – 5,000" },
          { value: "5000_20000", label: "GHS 5,000 – 20,000" },
          { value: "20000_50000", label: "GHS 20,000 – 50,000" },
          { value: "above_50000", label: "Above GHS 50,000" },
        ]),
        required: true,
        score_weight: 20,
        display_order: 3,
      },
      {
        question_key: "expected_order_frequency",
        label: "How often do you expect to order from Bali-Can?",
        input_type: "select",
        options: JSON.stringify([
          { value: "weekly", label: "Weekly" },
          { value: "biweekly", label: "Every 2 weeks" },
          { value: "monthly", label: "Monthly" },
          { value: "occasionally", label: "Occasionally" },
          { value: "onetime", label: "One-time project" },
        ]),
        required: true,
        score_weight: 10,
        display_order: 4,
      },
      {
        question_key: "wants_credit_sales",
        label: "Would your company like to apply for credit sales?",
        helper_text: "Credit sales let you buy now and pay later on agreed terms",
        input_type: "yes_no",
        required: true,
        score_weight: 0,
        display_order: 5,
      },
      {
        question_key: "requested_credit_limit",
        label: "What credit limit would you like to request?",
        helper_text: "This is the maximum amount you'd like to purchase on credit",
        input_type: "currency",
        required: false,
        score_weight: 10,
        display_order: 6,
        conditional_logic: JSON.stringify({
          depends_on: "wants_credit_sales",
          value: "yes",
        }),
      },
      {
        question_key: "preferred_repayment_period",
        label: "What repayment period would work best for your company?",
        input_type: "select",
        required: false,
        options: JSON.stringify([
          { value: "7_days", label: "7 days" },
          { value: "14_days", label: "14 days" },
          { value: "30_days", label: "30 days" },
          { value: "45_days", label: "45 days" },
        ]),
        score_weight: 5,
        display_order: 7,
        conditional_logic: JSON.stringify({
          depends_on: "wants_credit_sales",
          value: "yes",
        }),
      },
      {
        question_key: "is_registered_business",
        label: "Is your company officially registered?",
        helper_text: "Registered businesses may qualify for better terms",
        input_type: "yes_no",
        required: true,
        score_weight: 10,
        display_order: 8,
      },
      {
        question_key: "registration_number",
        label: "Business registration number",
        input_type: "text",
        required: false,
        score_weight: 0,
        display_order: 9,
        conditional_logic: JSON.stringify({
          depends_on: "is_registered_business",
          value: "yes",
        }),
      },
      {
        question_key: "registration_document",
        label: "Upload registration document",
        helper_text: "Optional — helps speed up approval",
        input_type: "upload",
        required: false,
        score_weight: 5,
        display_order: 10,
        conditional_logic: JSON.stringify({
          depends_on: "is_registered_business",
          value: "yes",
        }),
      },
      {
        question_key: "has_trade_reference",
        label: "Can you provide a supplier or trade reference?",
        helper_text: "Trade references help us verify your business relationships",
        input_type: "yes_no",
        required: false,
        score_weight: 5,
        display_order: 11,
      },
      {
        question_key: "reference_company_name",
        label: "Reference company name",
        input_type: "text",
        required: false,
        score_weight: 0,
        display_order: 12,
        conditional_logic: JSON.stringify({
          depends_on: "has_trade_reference",
          value: "yes",
        }),
      },
      {
        question_key: "reference_contact_person",
        label: "Reference contact person",
        input_type: "text",
        required: false,
        score_weight: 0,
        display_order: 13,
        conditional_logic: JSON.stringify({
          depends_on: "has_trade_reference",
          value: "yes",
        }),
      },
      {
        question_key: "reference_phone",
        label: "Reference phone number",
        input_type: "text",
        required: false,
        score_weight: 0,
        display_order: 14,
        conditional_logic: JSON.stringify({
          depends_on: "has_trade_reference",
          value: "yes",
        }),
      },
      {
        question_key: "main_delivery_location",
        label: "Where is your main delivery location?",
        helper_text: "Region, city/town, digital address, or landmark",
        input_type: "text",
        required: true,
        score_weight: 5,
        display_order: 15,
      },
      {
        question_key: "business_stage",
        label: "What best describes your company right now?",
        input_type: "select",
        required: false,
        options: JSON.stringify([
          { value: "new_building", label: "New business building supplier relationships" },
          { value: "growing", label: "Growing business with regular purchasing needs" },
          { value: "established", label: "Established company looking for better supplier terms" },
          { value: "project_based", label: "Project-based buyer" },
          { value: "other", label: "Other" },
        ]),
        score_weight: 5,
        display_order: 16,
      },
    ];

    for (const q of questions) {
      const existing = await pool.query("SELECT id FROM vetting_questions WHERE question_key = $1", [q.question_key]);
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO vetting_questions (question_key, label, helper_text, input_type, options, required, score_weight, display_order, conditional_logic)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb)`,
          [q.question_key, q.label, q.helper_text || null, q.input_type, q.options, q.required, q.score_weight, q.display_order, q.conditional_logic || null]
        );
        console.log(`  ✓ ${q.question_key}`);
      }
    }

    console.log("Company vetting migration complete.");
  } catch (err) {
    console.error("Vetting migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
