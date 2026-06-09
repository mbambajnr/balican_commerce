import { pool } from "./db";

async function run() {
  console.log("Running services enhancement migration...");
  await pool.query(`
    ALTER TABLE services ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50);
    ALTER TABLE services ADD COLUMN IF NOT EXISTS team_size_or_capacity VARCHAR(200);
    ALTER TABLE services ADD COLUMN IF NOT EXISTS industries_served TEXT[];
    ALTER TABLE services ADD COLUMN IF NOT EXISTS certifications_or_licenses TEXT[];
    ALTER TABLE services ADD COLUMN IF NOT EXISTS equipment_or_tools_available TEXT[];
    ALTER TABLE services ADD COLUMN IF NOT EXISTS experience_summary TEXT;
    ALTER TABLE services ADD COLUMN IF NOT EXISTS coverage_area TEXT[];
    ALTER TABLE services ADD COLUMN IF NOT EXISTS visibility_status VARCHAR(50) DEFAULT 'public';
    ALTER TABLE services ADD COLUMN IF NOT EXISTS quote_only BOOLEAN DEFAULT false;
  `);
  console.log("Services enhancement migration complete");
}

run().catch(console.error);
