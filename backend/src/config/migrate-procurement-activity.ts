import { pool } from "./db";

const migration = `
CREATE TABLE IF NOT EXISTS procurement_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  procurement_request_id UUID REFERENCES procurement_requests(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pal_company_id ON procurement_activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_pal_provider_company_id ON procurement_activity_log(provider_company_id);
CREATE INDEX IF NOT EXISTS idx_pal_procurement_request_id ON procurement_activity_log(procurement_request_id);
CREATE INDEX IF NOT EXISTS idx_pal_event_type ON procurement_activity_log(event_type);
CREATE INDEX IF NOT EXISTS idx_pal_created_at ON procurement_activity_log(created_at DESC);
`;

async function run() {
  console.log("Running procurement activity log migration...");
  await pool.query(migration);
  console.log("Procurement activity log migration completed");
  await pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
