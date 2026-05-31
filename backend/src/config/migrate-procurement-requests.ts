import { query } from "./db";

export async function migrateProcurementRequests() {
  console.log("→ Running procurement requests migration...");

  // Request type enum
  await query(`
    DO $$ BEGIN
      CREATE TYPE procurement_request_type AS ENUM ('product_supply', 'service');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Request status enum
  await query(`
    DO $$ BEGIN
      CREATE TYPE procurement_request_status AS ENUM ('draft', 'submitted', 'in_review', 'accepted', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Provider response status enum
  await query(`
    DO $$ BEGIN
      CREATE TYPE procurement_provider_status AS ENUM ('invited', 'viewed', 'interested', 'declined', 'quoted', 'selected');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Main procurement request table
  await query(`
    CREATE TABLE IF NOT EXISTS procurement_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_by UUID NOT NULL REFERENCES users(id),
      title VARCHAR(300) NOT NULL,
      description TEXT,
      request_type procurement_request_type NOT NULL DEFAULT 'product_supply',
      status procurement_request_status NOT NULL DEFAULT 'draft',
      delivery_location TEXT,
      preferred_timeline TEXT,
      estimated_budget NUMERIC(12,2),
      notes TEXT,
      is_urgent BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Request items (what products/services are needed)
  await query(`
    CREATE TABLE IF NOT EXISTS request_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(300),
      product_sku VARCHAR(100),
      service_description TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit VARCHAR(50),
      notes TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Provider assignments/invitations per request
  await query(`
    CREATE TABLE IF NOT EXISTS procurement_request_providers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
      provider_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      status procurement_provider_status NOT NULL DEFAULT 'invited',
      response_notes TEXT,
      quote_amount NUMERIC(12,2),
      quote_details JSONB,
      responded_at TIMESTAMPTZ,
      viewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(request_id, provider_company_id)
    );
  `);

  // Attachments (URL references or document references)
  await query(`
    CREATE TABLE IF NOT EXISTS request_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      request_id UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      name VARCHAR(300),
      type VARCHAR(50),
      size_bytes INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_proc_req_company ON procurement_requests(company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_proc_req_created_by ON procurement_requests(created_by)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_proc_req_status ON procurement_requests(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_req_items_request ON request_items(request_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_req_providers_request ON procurement_request_providers(request_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_req_providers_provider ON procurement_request_providers(provider_company_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_req_providers_status ON procurement_request_providers(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_req_attachments_request ON request_attachments(request_id)`);

  console.log("✓ Procurement requests migration complete");
}

if (require.main === module) {
  (async () => {
    console.log("Running procurement requests migration...");
    await migrateProcurementRequests();
    console.log("Done.");
    process.exit(0);
  })().catch(e => { console.error("Migration failed:", e); process.exit(1); });
}
