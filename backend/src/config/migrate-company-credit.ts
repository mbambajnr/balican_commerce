import { pool } from "./db";

const migration = `
-- 1. Create company_credit_status enum
DO $$ BEGIN
  CREATE TYPE company_credit_status AS ENUM ('not_requested', 'pending_review', 'approved', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add credit approval fields to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_status company_credit_status DEFAULT 'not_requested';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS requested_credit_limit NUMERIC(12, 2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS approved_credit_limit NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_used NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_risk_rating VARCHAR(20) DEFAULT 'low';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_review_notes TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_rejection_reason TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_approved_by UUID REFERENCES users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_approved_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_reviewed_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_review_at DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS finance_contact_name VARCHAR(200);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS finance_contact_email VARCHAR(255);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS finance_contact_phone VARCHAR(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_application_notes TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30;

-- 3. Non-negative credit constraints
DO $$ BEGIN
  ALTER TABLE companies ADD CONSTRAINT companies_credit_used_non_negative CHECK (credit_used >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE companies ADD CONSTRAINT companies_approved_credit_limit_non_negative CHECK (approved_credit_limit >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Company credit transactions audit table
CREATE TABLE IF NOT EXISTS company_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('credit_used', 'credit_restored', 'credit_adjusted', 'credit_approved', 'credit_rejected', 'credit_suspended', 'credit_reactivated')),
  reason TEXT NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  credit_used_before NUMERIC(12, 2) NOT NULL,
  credit_used_after NUMERIC(12, 2) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_credit_tx_company ON company_credit_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_credit_tx_created ON company_credit_transactions(created_at DESC);

-- 5. Add credit_status filter index
CREATE INDEX IF NOT EXISTS idx_companies_credit_status ON companies(credit_status);
`;

async function run() {
  console.log("Running company credit migration...");
  try {
    await pool.query(migration);
    console.log("Company credit migration completed");
  } catch (err) {
    console.error("Company credit migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
