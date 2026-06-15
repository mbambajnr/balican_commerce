import { pool } from "./db";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address VARCHAR(100),
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
        ON auth_sessions(user_id, expires_at)
        WHERE revoked_at IS NULL;
    `);
    console.log("Auth sessions migration completed");
  } catch (err) {
    console.error("Auth sessions migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
