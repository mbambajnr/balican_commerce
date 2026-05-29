import { pool } from "./db";

const migration = `
-- Vetting documents table (private uploads)
CREATE TABLE IF NOT EXISTS vetting_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  submission_id UUID REFERENCES vetting_submissions(id) ON DELETE SET NULL,
  question_key VARCHAR(100) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  storage_key VARCHAR(500) NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vetting_docs_company ON vetting_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_vetting_docs_submission ON vetting_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_vetting_docs_question ON vetting_documents(question_key);
`;

async function run() {
  try {
    console.log("Running vetting documents migration...");
    await pool.query(migration);
    console.log("Vetting documents migration complete.");
  } catch (err) {
    console.error("Vetting documents migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
