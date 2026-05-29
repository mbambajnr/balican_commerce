import { query, pool } from "./db";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Orders: add quotation_id and rfq_id links
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id)`);
    await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS rfq_id UUID REFERENCES rfqs(id)`);

    // Invoices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
        outstanding_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'GHS',
        due_date DATE,
        payment_terms VARCHAR(50),
        notes TEXT,
        issued_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`);

    console.log("Invoice migration completed successfully");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error(err); process.exit(1); });
