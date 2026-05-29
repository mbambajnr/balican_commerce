import { pool } from "./db";

const migration = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('customer', 'sales', 'ops', 'admin', 'super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ops';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
DO $$ BEGIN CREATE TYPE rfq_status AS ENUM ('pending', 'quoted', 'accepted', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('pending', 'paid', 'processing', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  role user_role DEFAULT 'customer',
  credit_limit NUMERIC(12, 2) DEFAULT 0,
  outstanding_balance NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(50),
  street TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  country VARCHAR(100) DEFAULT 'Ghana',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(300) NOT NULL,
  slug VARCHAR(300) UNIQUE NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  price NUMERIC(12, 2) NOT NULL,
  compare_price NUMERIC(12, 2),
  stock_status VARCHAR(50) DEFAULT 'in_stock',
  images TEXT[] DEFAULT '{}',
  variants JSONB DEFAULT '[]',
  specs JSONB DEFAULT '{}',
  seo_title VARCHAR(300),
  seo_description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variable_price BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_attributes_product ON product_attributes(product_id);

ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_id UUID;

CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  delivery_requirements TEXT,
  file_url TEXT,
  notes TEXT,
  status rfq_status DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  items JSONB NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL,
  tax NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL,
  status order_status DEFAULT 'pending',
  payment_method VARCHAR(50),
  paystack_reference VARCHAR(200),
  invoice_url TEXT,
  payment_terms VARCHAR(50),
  payment_due_date DATE,
  po_number VARCHAR(100),
  invoice_number VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  user_id UUID REFERENCES users(id),
  preferred_date DATE NOT NULL,
  preferred_time_slot VARCHAR(50),
  location TEXT NOT NULL,
  contact_phone VARCHAR(50),
  contact_name VARCHAR(200),
  notes TEXT,
  status booking_status DEFAULT 'pending',
  assigned_to VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_rfqs_user ON rfqs(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_order ON service_bookings(order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON service_bookings(user_id);

-- Guest RFQ columns
ALTER TYPE rfq_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'registered';
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS product_name VARCHAR(500);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS product_sku VARCHAR(100);
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS file_urls JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_rfqs_source ON rfqs(source);

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

CREATE TABLE IF NOT EXISTS lead_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color VARCHAR(50) DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES lead_stages(id),
  company VARCHAR(200),
  contact_name VARCHAR(200) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  source VARCHAR(100),
  value NUMERIC(12, 2),
  notes TEXT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
`;

const seed = `
INSERT INTO lead_stages (name, position, color) VALUES
  ('New', 0, '#3b82f6'),
  ('Contacted', 1, '#8b5cf6'),
  ('Qualified', 2, '#f59e0b'),
  ('Proposal', 3, '#ec4899'),
  ('Negotiation', 4, '#ef4444'),
  ('Won', 5, '#22c55e'),
  ('Lost', 6, '#6b7280')
ON CONFLICT DO NOTHING;
`;

async function runMigrations() {
  console.log("Running migrations...");
  try {
    await pool.query(migration);
    console.log("Migrations completed successfully");

    console.log("Seeding data...");
    await pool.query(seed);
    console.log("Seed completed");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}

runMigrations();
