import { query, pool } from "./db";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Users: credit & billing fields
    const userCols = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_credit_approved BOOLEAN DEFAULT false`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS business_registration_number VARCHAR(100)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_contact_name VARCHAR(100)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_contact_email VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_contact_phone VARCHAR(50)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_approved_by UUID REFERENCES users(id)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_approved_at TIMESTAMPTZ`,
    ];
    for (const sql of userCols) {
      await client.query(sql);
    }

    // Orders: payment tracking fields
    const orderCols = [
      // Add payment_status alongside existing status
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'unpaid'`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(12,2)`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_approved_by UUID REFERENCES users(id)`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_approved_at TIMESTAMPTZ`,
    ];
    for (const sql of orderCols) {
      await client.query(sql);
    }

    // Update existing orders: set outstanding_amount = total if null
    await client.query(
      `UPDATE orders SET outstanding_amount = total WHERE outstanding_amount IS NULL`
    );

    // Bank transfers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bank_transfers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        amount NUMERIC(12,2) NOT NULL,
        bank_name VARCHAR(100),
        account_name VARCHAR(100),
        account_number VARCHAR(50),
        transfer_reference VARCHAR(200) NOT NULL,
        proof_url TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMPTZ,
        rejection_reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Indexes for bank_transfers
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bank_transfers_order ON bank_transfers(order_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bank_transfers_user ON bank_transfers(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_bank_transfers_status ON bank_transfers(status)`);

    // Order payments table (for recording payments against any order)
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        amount NUMERIC(12,2) NOT NULL,
        method VARCHAR(30) NOT NULL,
        reference VARCHAR(200),
        notes TEXT,
        recorded_by UUID REFERENCES users(id),
        paid_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id)`);

    // Add payment_method ENUM values if using enum, but we'll use varchar for flexibility
    // Since orders.payment_method is already varchar, we just need to use consistent values

    console.log("B2B payment migration completed successfully");
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

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
