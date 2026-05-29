import { pool } from "./db";

const migration = `
DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('sales', 'service', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE service_order_status AS ENUM ('requested', 'scheduled', 'assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type order_type NOT NULL DEFAULT 'sales';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_description TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS site_location TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_status service_order_status;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_sales_order_id UUID REFERENCES orders(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES service_bookings(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS technician_assignment_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_service_status ON orders(service_status);
CREATE INDEX IF NOT EXISTS idx_orders_linked_sales_order ON orders(linked_sales_order_id);
`;

async function run() {
  console.log("Running order types migration...");
  try {
    await pool.query(migration);
    console.log("Order types migration completed successfully");
  } catch (err) {
    console.error("Order types migration failed:", err);
  } finally {
    await pool.end();
  }
}

run();
