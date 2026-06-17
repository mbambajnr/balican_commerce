import { pool } from "./db";

async function run() {
  try {
    console.log("Running verification fee migration...");

    await pool.query(`ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'lapsed'`);

    await pool.query(`
      ALTER TABLE companies
        ADD COLUMN IF NOT EXISTS verified_until DATE,
        ADD COLUMN IF NOT EXISTS verification_fee_waived_until DATE,
        ADD COLUMN IF NOT EXISTS verification_fee_waived_by UUID REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS verification_fee_waived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verification_fee_waiver_reason TEXT
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_fee_settings (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 500.00 CHECK (amount >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
        renewal_period_days INTEGER NOT NULL DEFAULT 365 CHECK (renewal_period_days > 0),
        grace_period_days INTEGER NOT NULL DEFAULT 14 CHECK (grace_period_days >= 0),
        updated_by UUID REFERENCES users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      INSERT INTO verification_fee_settings (id, amount, currency, renewal_period_days, grace_period_days)
      VALUES (TRUE, 500.00, 'GHS', 365, 14)
      ON CONFLICT (id) DO NOTHING
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_fee_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
        paystack_reference VARCHAR(120) NOT NULL UNIQUE,
        status VARCHAR(30) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
        authorization_url TEXT,
        paid_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_verification_fee_payments_company ON verification_fee_payments(company_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_verification_fee_payments_status ON verification_fee_payments(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_companies_verified_until ON companies(verified_until)`);

    console.log("Verification fee migration complete.");
  } catch (err) {
    console.error("Verification fee migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
