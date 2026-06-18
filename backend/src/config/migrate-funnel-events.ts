import { pool } from "./db";

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS funnel_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_name VARCHAR(100) NOT NULL,
      event_key VARCHAR(300) NOT NULL UNIQUE,
      company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id UUID,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_funnel_events_name_time
      ON funnel_events (event_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_funnel_events_company_time
      ON funnel_events (company_id, created_at DESC);
  `);
  console.log("funnel_events migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("funnel_events migration failed:", err);
  process.exit(1);
});
