import { query } from "./db";

export async function migrateAgreements() {
  await query(`
    DO $$ BEGIN
      CREATE TYPE agreement_status AS ENUM ('active', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS scout_agreements (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scout_request_id  UUID NOT NULL REFERENCES scout_requests(id) ON DELETE CASCADE,
      buyer_company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      provider_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      accepted_quote_id UUID NOT NULL REFERENCES scout_quotes(id) ON DELETE CASCADE,
      status            agreement_status NOT NULL DEFAULT 'active',
      agreed_price      NUMERIC(12,2) NOT NULL,
      agreed_delivery_date DATE,
      payment_terms     VARCHAR(300),
      notes             TEXT,
      order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
      agreed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_agreements_buyer    ON scout_agreements(buyer_company_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_agreements_provider ON scout_agreements(provider_company_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_agreements_request  ON scout_agreements(scout_request_id);`);
  // Add agreement_id column to orders
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES scout_agreements(id) ON DELETE SET NULL;`);

  await query(`CREATE INDEX IF NOT EXISTS idx_agreements_status   ON scout_agreements(status);`);

  console.log("✓ Agreements migration complete");
}

if (require.main === module) {
  (async () => {
    console.log("Running Agreements migration…");
    await migrateAgreements();
    process.exit(0);
  })().catch((e) => { console.error("Agreements migration failed:", e); process.exit(1); });
}
