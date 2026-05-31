import { pool } from "./db";

const migration = `
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- dedup_key ensures no duplicate notification for same user+type+link
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key VARCHAR(600);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup ON notifications(dedup_key) WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread_count ON notifications(user_id, is_read);
`;

async function run() {
  console.log("Running notifications migration...");
  await pool.query(migration);
  console.log("Notifications migration completed");
  await pool.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
