import { pool } from "./db";

async function run() {
  console.log("Running booking migration...");
  try {
    // Must add enum values one at a time outside a transaction block
    await pool.query("ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'requested'");
    await pool.query("ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'rescheduled'");

    // Now table alterations can happen in the same implicit transaction
    await pool.query(`
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS service_type VARCHAR(100) DEFAULT 'installation';
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS admin_notes TEXT;
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS confirmed_date DATE;
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS confirmed_time_slot VARCHAR(50);
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id);
      ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS rfq_id UUID REFERENCES rfqs(id);
    `);

    // Reset default status to 'requested' (the previous type was 'pending')
    await pool.query("ALTER TABLE service_bookings ALTER COLUMN status SET DEFAULT 'requested'");
    await pool.query(`UPDATE service_bookings SET status = 'requested' WHERE status = 'pending'`);

    // Add ready_for_service column to orders
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_for_service BOOLEAN DEFAULT false`);

    console.log("Booking migration completed successfully");
  } catch (err) {
    console.error("Booking migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
