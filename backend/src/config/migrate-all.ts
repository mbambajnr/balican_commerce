import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { Pool, PoolClient } from "pg";
import { config } from "./index";

export const MIGRATIONS = [
  "migrate.js",
  "migrate-credits.js",
  "migrate-b2b-payments.js",
  "migrate-b2b-companies.js",
  "migrate-b2b-enhancements.js",
  "migrate-quotations.js",
  "migrate-invoices.js",
  "migrate-bookings.js",
  "migrate-email-logs.js",
  "migrate-quotation-pdfs.js",
  "migrate-order-types.js",
  "migrate-concurrency.js",
  "migrate-product-media.js",
  "migrate-catalog.js",
  "migrate-category-hierarchy.js",
  "migrate-category-seo.js",
  "migrate-marketplace.js",
  "migrate-services-enhance.js",
  "migrate-company-vetting.js",
  "migrate-vetting-docs.js",
  "migrate-super-admin-control.js",
  "migrate-scout.js",
  "migrate-rfq-scout.js",
  "migrate-agreements.js",
  "migrate-procurement-requests.js",
  "migrate-procurement-orders.js",
  "migrate-procurement-activity.js",
  "migrate-order-lifecycle.js",
  "migrate-supplier-credit.js",
  "migrate-company-credit.js",
  "migrate-notifications.js",
  "migrate-offering-documents.js",
  "migrate-recommendation-events.js",
  "migrate-ad-tracking.js",
  "migrate-auth-sessions.js",
] as const;

function checksum(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function ensureMigrationTable(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function run() {
  const pool = new Pool({ connectionString: config.database.connectionString });
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext('sslplan_schema_migrations'))");
    await ensureMigrationTable(client);

    for (const migration of MIGRATIONS) {
      const filePath = path.join(__dirname, migration);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Compiled migration not found: ${filePath}`);
      }

      const currentChecksum = checksum(filePath);
      const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [migration]
      );

      if (applied.rows.length > 0) {
        if (applied.rows[0].checksum !== currentChecksum) {
          throw new Error(
            `Applied migration ${migration} has changed. Add a new migration instead of editing migration history.`
          );
        }
        console.log(`SKIP ${migration}`);
        continue;
      }

      console.log(`RUN  ${migration}`);
      const result = spawnSync(process.execPath, [filePath], {
        cwd: path.resolve(__dirname, "../../.."),
        env: process.env,
        stdio: "inherit",
      });

      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`Migration ${migration} failed with exit code ${result.status}`);
      }

      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration, currentChecksum]
      );
    }

    console.log(`All ${MIGRATIONS.length} database migrations are applied.`);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('sslplan_schema_migrations'))").catch(() => {});
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Database migration run failed:", err);
    process.exitCode = 1;
  });
}
