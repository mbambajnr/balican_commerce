import { pool } from "./db";

const migration = `
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accountant';

ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  amount NUMERIC(12, 2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  reference VARCHAR(200),
  notes TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`;

async function run() {
  console.log("Running credit migration...");
  try {
    await pool.query(migration);
    console.log("Credit migration completed");
  } catch (err) {
    console.error("Credit migration failed:", err);
  } finally {
    await pool.end();
  }
}

run();
