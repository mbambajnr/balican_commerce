import { pool } from "./db";

const migration = `
-- 1. Unique quotation_number on quotations
DO $$ BEGIN
  ALTER TABLE quotations ADD CONSTRAINT quotations_quotation_number_key UNIQUE (quotation_number);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 2. Unique invoice_number on invoices
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 3. Unique order_per_quotation (only one order per quotation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_quotation_id_unique ON orders (quotation_id) WHERE quotation_id IS NOT NULL;

-- 4. Unique payment reference (for Paystack dedup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_reference ON order_payments (reference);

-- 5. Unique active booking per order (prevent duplicate active bookings for same order)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_booking_per_order ON service_bookings (order_id) WHERE status NOT IN ('cancelled');

-- 6. Unique bank transfer reference per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transfers_order_ref ON bank_transfers (order_id, transfer_reference);

-- 7. Non-negative amount constraints
DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_amount_paid_non_negative CHECK (amount_paid >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_outstanding_amount_non_negative CHECK (outstanding_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_outstanding_balance_non_negative CHECK (outstanding_balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Unique quotation revision (parent_quotation_id + revision_number)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotation_revision ON quotations (parent_quotation_id, revision_number) WHERE parent_quotation_id IS NOT NULL;
`;

async function run() {
  console.log("Running concurrency hardening migration...");
  try {
    await pool.query(migration);
    console.log("Concurrency migration completed successfully");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

run();
