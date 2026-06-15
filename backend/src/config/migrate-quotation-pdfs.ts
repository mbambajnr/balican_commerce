import { pool } from "./db";

const migration = `
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS product_slug VARCHAR(255);
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS product_url TEXT;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS pdf_url TEXT;

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS rfq_id UUID REFERENCES rfqs(id);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS sent_by VARCHAR(100);
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS provider_response TEXT;
CREATE INDEX IF NOT EXISTS idx_email_logs_quotation ON email_logs(quotation_id) WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_invoice ON email_logs(invoice_id) WHERE invoice_id IS NOT NULL;
`;

async function run() {
  try {
    await pool.query(migration);
    console.log("✓ Quotation PDF migration applied");
  } catch (err) {
    console.error("Migration error:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  run();
}
