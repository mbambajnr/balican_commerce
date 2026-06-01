import { pool } from "./db";

const migration = `
-- Add scout/category-sourcing fields to rfqs
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) DEFAULT 'product_sourcing';
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS delivery_location VARCHAR(255);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ;

-- Add useful indexes
CREATE INDEX IF NOT EXISTS idx_rfqs_category ON rfqs(category_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_request_type ON rfqs(request_type);
CREATE INDEX IF NOT EXISTS idx_rfqs_deadline ON rfqs(deadline_at);
CREATE INDEX IF NOT EXISTS idx_rfqs_status_category ON rfqs(status, category_id);
`;

async function run() {
  console.log("Running RFQ scout migration...");
  try {
    await pool.query(migration);
    console.log("RFQ scout migration completed");
  } catch (err) {
    console.error("RFQ scout migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
