import { query } from "./db";

export async function migrateScout() {
  // Enums
  await query(`
    DO $$ BEGIN
      CREATE TYPE scout_request_status AS ENUM ('open', 'awarded', 'cancelled', 'expired');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await query(`
    DO $$ BEGIN
      CREATE TYPE scout_quote_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // Scout Requests
  await query(`
    CREATE TABLE IF NOT EXISTS scout_requests (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_by       UUID NOT NULL REFERENCES users(id),
      title            VARCHAR(300) NOT NULL,
      description      TEXT,
      quantity         NUMERIC(12,3) NOT NULL DEFAULT 1,
      unit             VARCHAR(50),
      delivery_location TEXT,
      desired_delivery_date DATE,
      budget_min       NUMERIC(12,2),
      budget_max       NUMERIC(12,2),
      notes            TEXT,
      status           scout_request_status NOT NULL DEFAULT 'open',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Scout Quotes
  await query(`
    CREATE TABLE IF NOT EXISTS scout_quotes (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id          UUID NOT NULL REFERENCES scout_requests(id) ON DELETE CASCADE,
      provider_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      submitted_by        UUID NOT NULL REFERENCES users(id),
      quoted_price        NUMERIC(12,2) NOT NULL,
      delivery_date       DATE,
      payment_terms       VARCHAR(300),
      notes               TEXT,
      status              scout_quote_status NOT NULL DEFAULT 'pending',
      order_id            UUID REFERENCES orders(id),
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (request_id, provider_company_id)
    );
  `);

  // Link orders back to Scout
  await query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS scout_request_id UUID REFERENCES scout_requests(id) ON DELETE SET NULL;
  `);

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_scout_requests_company    ON scout_requests(company_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_scout_requests_status     ON scout_requests(status);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_scout_quotes_request      ON scout_quotes(request_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_scout_quotes_provider     ON scout_quotes(provider_company_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_scout_request      ON orders(scout_request_id);`);

  console.log("✓ Scout migration complete");
}

if (require.main === module) {
  (async () => {
    console.log("Running Scout migration…");
    await migrateScout();
    process.exit(0);
  })().catch((e) => { console.error("Scout migration failed:", e); process.exit(1); });
}
