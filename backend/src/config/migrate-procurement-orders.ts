import { pool } from "./db";

const migration = `
-- 1. Add procurement_request_id FK to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS procurement_request_id UUID REFERENCES procurement_requests(id) ON DELETE SET NULL;

-- 2. Add index for lookups
CREATE INDEX IF NOT EXISTS idx_orders_procurement_request_id ON orders(procurement_request_id);
`;

async function run() {
  console.log("Running procurement→order migration...");
  await pool.query(migration);
  console.log("Procurement→order migration completed");
  await pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
