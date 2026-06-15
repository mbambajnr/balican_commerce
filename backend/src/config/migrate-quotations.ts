import { pool } from "./db";
import { generateOrderNumber } from "../utils/helpers";

async function run() {
  console.log("Running quotations migration...");

  try {
    // Add new RFQ statuses
    await pool.query(`
      ALTER TYPE rfq_status ADD VALUE IF NOT EXISTS 'under_review';
      ALTER TYPE rfq_status ADD VALUE IF NOT EXISTS 'quote_sent';
    `);

    // Quotation status type
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted_to_order', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Quotations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        rfq_id UUID REFERENCES rfqs(id) ON DELETE CASCADE,
        customer_id UUID REFERENCES users(id),
        quotation_number VARCHAR(50) UNIQUE NOT NULL,
        status quotation_status DEFAULT 'draft',
        revision_number INTEGER DEFAULT 1,
        parent_quotation_id UUID REFERENCES quotations(id),
        subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(12, 2) DEFAULT 0,
        tax_amount NUMERIC(12, 2) DEFAULT 0,
        service_fee NUMERIC(12, 2) DEFAULT 0,
        delivery_fee NUMERIC(12, 2) DEFAULT 0,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'GHS',
        valid_until DATE,
        terms TEXT,
        notes_to_customer TEXT,
        internal_notes TEXT,
        pdf_url TEXT,
        rejection_reason TEXT,
        sent_at TIMESTAMPTZ,
        viewed_at TIMESTAMPTZ,
        accepted_at TIMESTAMPTZ,
        rejected_at TIMESTAMPTZ,
        expired_at TIMESTAMPTZ,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Quotation items
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotation_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
        unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        line_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Quotation events
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quotation_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_quotations_rfq ON quotations(rfq_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
      CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
      CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON quotation_items(quotation_id);
      CREATE INDEX IF NOT EXISTS idx_quotation_events_quotation ON quotation_events(quotation_id);
    `);

    console.log("Quotations migration complete");
  } catch (err) {
    console.error("Quotations migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
