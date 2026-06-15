import { pool } from "./db";

const migration = `
-- 1. Create supplier_credit_vetting_status enum
DO $$ BEGIN
  CREATE TYPE supplier_credit_vetting_status AS ENUM ('unrated', 'pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create supplier_credit_profiles table (1:1 with companies)
CREATE TABLE IF NOT EXISTS supplier_credit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  vetting_status supplier_credit_vetting_status NOT NULL DEFAULT 'unrated',
  credit_tier VARCHAR(20) DEFAULT 'basic',
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  review_notes TEXT,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  next_review_at DATE,
  completed_orders_count INTEGER DEFAULT 0,
  fulfillment_rate NUMERIC(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_credit_vetting_status ON supplier_credit_profiles(vetting_status);
CREATE INDEX IF NOT EXISTS idx_supplier_credit_tier ON supplier_credit_profiles(credit_tier);

-- 4. Constraint: credit_limit >= 0
DO $$ BEGIN
  ALTER TABLE supplier_credit_profiles ADD CONSTRAINT supplier_credit_limit_non_negative CHECK (credit_limit >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Auto-create profile on company insert when is_provider = true
CREATE OR REPLACE FUNCTION auto_create_supplier_credit_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_provider = true THEN
    INSERT INTO supplier_credit_profiles (company_id)
    VALUES (NEW.id)
    ON CONFLICT (company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trigger_auto_create_supplier_credit
  AFTER INSERT ON companies
  FOR EACH ROW
  WHEN (NEW.is_provider = true)
  EXECUTE FUNCTION auto_create_supplier_credit_profile();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function run() {
  console.log("Running supplier credit migration...");
  try {
    await pool.query(migration);
    console.log("Supplier credit migration completed");
  } catch (err) {
    console.error("Supplier credit migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
