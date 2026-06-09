import { query, pool } from "./db";

const ENUMS = [
  `DO $$ BEGIN
    CREATE TYPE offering_doc_type AS ENUM (
      'DATASHEET', 'SAFETY_DATASHEET', 'INSTALLATION_MANUAL', 'WARRANTY_CERTIFICATE',
      'COMPLIANCE_CERTIFICATE', 'ENERGY_RATING', 'PRODUCT_BROCHURE', 'TEST_REPORT',
      'COMPANY_PROFILE', 'INSURANCE_CERTIFICATE', 'SAFETY_POLICY', 'STAFF_TRAINING_CERTIFICATE',
      'FOOD_HANDLING_CERTIFICATE', 'SECURITY_LICENSE', 'METHOD_STATEMENT', 'SLA_DOCUMENT',
      'PORTFOLIO', 'OTHER_PRODUCT', 'OTHER_SERVICE'
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,
  `DO $$ BEGIN
    CREATE TYPE contract_type AS ENUM ('ONE_TIME', 'RECURRING', 'EMERGENCY', 'RETAINER');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,
];

const TABLES = [
  `CREATE TABLE IF NOT EXISTS offering_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    offering_type VARCHAR(20) NOT NULL CHECK (offering_type IN ('PRODUCT', 'SERVICE')),
    offering_id UUID NOT NULL,
    document_type offering_doc_type NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INT NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE offering_documents ADD COLUMN IF NOT EXISTS description VARCHAR(500)`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_offering_docs_offering ON offering_documents(offering_type, offering_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offering_docs_company ON offering_documents(company_id)`,
  `CREATE INDEX IF NOT EXISTS idx_offering_docs_type ON offering_documents(document_type)`,
];

const EXISTING_TABLE_ALTERS = [
  // Add missing columns to services table
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS brand VARCHAR(300)`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS model VARCHAR(300)`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS warranty_information TEXT`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS credit_terms VARCHAR(500)`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS delivery_coverage TEXT[]`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS quote_only BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS contract_type contract_type DEFAULT 'ONE_TIME'`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS team_size_or_capacity VARCHAR(200)`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS industries_served TEXT[]`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS certifications_or_licenses TEXT[]`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS equipment_or_tools_available TEXT[]`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS experience_summary TEXT`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS coverage_area TEXT[]`,
  `ALTER TABLE services ADD COLUMN IF NOT EXISTS response_time VARCHAR(100)`,

  // Add missing columns to products table
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(300)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS model VARCHAR(300)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_information TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS credit_terms VARCHAR(500)`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_coverage TEXT[]`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS quote_only BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS visibility_status VARCHAR(50) DEFAULT 'public'`,

  // Coverage area already exists as service_areas on services, add alias
];

async function migrate() {
  console.log("Running offering_documents migration...");
  for (const sql of ENUMS) {
    await query(sql);
  }
  for (const sql of TABLES) {
    await query(sql);
  }
  for (const sql of INDEXES) {
    await query(sql);
  }
  for (const sql of EXISTING_TABLE_ALTERS) {
    await query(sql);
  }
  console.log("Offering documents migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
