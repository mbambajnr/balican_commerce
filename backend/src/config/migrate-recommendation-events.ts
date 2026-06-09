import { query, pool } from "./db";

async function migrate() {
  console.log("Running recommendation_events migration...");

  await query(`
    DO $$ BEGIN
      CREATE TYPE recommendation_event_type AS ENUM (
        'RECOMMENDATION_VIEWED',
        'PROVIDER_INVITED',
        'PROPOSAL_VIEWED',
        'PROPOSAL_SUBMITTED',
        'QUOTE_ACCEPTED',
        'AGREEMENT_CREATED',
        'ORDER_COMPLETED',
        'ORDER_CANCELLED',
        'PROVIDER_RATING_SUBMITTED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recommendation_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      provider_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      offering_id UUID,
      request_id UUID,
      event_type recommendation_event_type NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_rec_events_buyer ON recommendation_events(buyer_company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rec_events_provider ON recommendation_events(provider_company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rec_events_type ON recommendation_events(event_type)`);

  console.log("recommendation_events migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
