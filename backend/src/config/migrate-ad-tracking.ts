import { pool } from "./db";

const migration = `
-- 1. Add UTM tracking columns to rfqs
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(200);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS utm_term VARCHAR(200);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS utm_content VARCHAR(200);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS gclid VARCHAR(200);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS fbclid VARCHAR(200);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS referrer_url TEXT;

-- 2. Add UTM tracking columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_url TEXT;

-- 3. Add UTM tracking columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(200);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(50);
`;

async function run() {
  try {
    console.log("Running ad-tracking migration...");
    await pool.query(migration);
    console.log("Ad-tracking migration completed successfully.");
  } catch (err) {
    console.error("Ad-tracking migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
