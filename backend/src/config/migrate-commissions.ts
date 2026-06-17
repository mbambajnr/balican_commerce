import { pool } from "./db";

async function run() {
  try {
    console.log("Running commission migration...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_rates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
        rate_percent NUMERIC(5, 2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rates_global
      ON commission_rates ((category_id IS NULL))
      WHERE category_id IS NULL
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rates_category
      ON commission_rates (category_id)
      WHERE category_id IS NOT NULL
    `);

    await pool.query(`
      INSERT INTO commission_rates (category_id, rate_percent, is_active)
      VALUES (NULL, 5.00, TRUE)
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        buyer_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        provider_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        base_amount NUMERIC(12, 2) NOT NULL CHECK (base_amount >= 0),
        rate_percent NUMERIC(5, 2) NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
        commission_amount NUMERIC(12, 2) NOT NULL CHECK (commission_amount >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
        status VARCHAR(30) NOT NULL DEFAULT 'accrued'
          CHECK (status IN ('accrued', 'invoiced', 'settled')),
        accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        invoiced_at TIMESTAMPTZ,
        settled_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_commission_ledger_provider ON commission_ledger(provider_company_id, accrued_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_commission_ledger_buyer ON commission_ledger(buyer_company_id, accrued_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON commission_ledger(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_commission_ledger_category ON commission_ledger(category_id)`);

    console.log("Commission migration complete.");
  } catch (err) {
    console.error("Commission migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
