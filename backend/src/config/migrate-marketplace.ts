const migration = `
-- Phase 1: Marketplace Foundation

-- 1. Company type enum
DO $$ BEGIN CREATE TYPE company_type AS ENUM ('buyer', 'supplier', 'service_provider', 'both_supplier_and_service_provider', 'platform_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Verification status enum
DO $$ BEGIN CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected', 'suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Category type enum
DO $$ BEGIN CREATE TYPE category_type AS ENUM ('product', 'service', 'both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Provider type enum
DO $$ BEGIN CREATE TYPE provider_type AS ENUM ('supplier', 'service_provider', 'both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Price visibility enum
DO $$ BEGIN CREATE TYPE price_visibility AS ENUM ('public', 'approved_buyers_only', 'quote_only'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Extend companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_type company_type DEFAULT 'buyer';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_provider BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_buyer BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_status verification_status DEFAULT 'pending';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_categories TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS service_areas TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS years_in_business INT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website VARCHAR(500);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 7. Provider profiles table
CREATE TABLE IF NOT EXISTS provider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE NOT NULL,
  display_name VARCHAR(300) NOT NULL,
  provider_type provider_type NOT NULL DEFAULT 'supplier',
  description TEXT,
  industries_served TEXT[],
  service_areas TEXT[],
  operating_regions TEXT[],
  years_experience INT,
  certifications TEXT[],
  licenses TEXT[],
  portfolio_images TEXT[],
  verification_badge BOOLEAN DEFAULT false,
  rating_average NUMERIC(3,2) DEFAULT 0,
  completed_jobs_count INT DEFAULT 0,
  completed_orders_count INT DEFAULT 0,
  credit_available BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_company_id ON provider_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_rating ON provider_profiles(rating_average DESC);
CREATE INDEX IF NOT EXISTS idx_provider_profiles_type ON provider_profiles(provider_type);

-- 8. Extend products with provider ownership
ALTER TABLE products ADD COLUMN IF NOT EXISTS provider_company_id UUID REFERENCES companies(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_visibility price_visibility DEFAULT 'public';
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_order_quantity INT DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS credit_eligible BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_provider_company ON products(provider_company_id);
CREATE INDEX IF NOT EXISTS idx_products_price_visibility ON products(price_visibility);
CREATE INDEX IF NOT EXISTS idx_products_credit_eligible ON products(credit_eligible);

-- 9. Services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_company_id UUID REFERENCES companies(id) NOT NULL,
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(300) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  service_type VARCHAR(100),
  service_areas TEXT[],
  pricing_model VARCHAR(50) NOT NULL DEFAULT 'quote_only',
  starting_price NUMERIC(12,2),
  price_visibility price_visibility DEFAULT 'public',
  minimum_job_value NUMERIC(12,2),
  availability_status VARCHAR(50) DEFAULT 'active',
  estimated_response_time VARCHAR(100),
  credit_eligible BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  images TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_provider_company ON services(provider_company_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_slug ON services(slug);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);

-- 10. Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_companies_company_type ON companies(company_type);
CREATE INDEX IF NOT EXISTS idx_companies_verification_status ON companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_companies_is_provider ON companies(is_provider);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

-- 11. Add type to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS type category_type DEFAULT 'both';
`;

import { pool } from "./db";

async function run() {
  console.log("Running marketplace migration (Phase 1)...");
  try {
    await pool.query(migration);
    console.log("Marketplace migration completed");
  } catch (err) {
    console.error("Marketplace migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
