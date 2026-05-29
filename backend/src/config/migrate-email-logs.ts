import { pool } from "./db";

const migration = `
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(200),
  subject VARCHAR(500) NOT NULL,
  body TEXT,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_event ON email_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_entity ON email_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at);
`;

async function run() {
  console.log("Running email_logs migration...");
  try {
    await pool.query(migration);
    console.log("Email logs migration completed successfully");
  } catch (err) {
    console.error("Email logs migration failed:", err);
  } finally {
    await pool.end();
  }
}

run();
