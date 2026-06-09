import { pool } from "./db";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Enums
    await client.query(`DO $$ BEGIN CREATE TYPE account_status AS ENUM ('pending', 'active', 'rejected', 'suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await client.query(`ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'suspended'`);
    await client.query(`DO $$ BEGIN CREATE TYPE company_role AS ENUM ('company_admin', 'buyer', 'finance', 'viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await client.query(`DO $$ BEGIN CREATE TYPE product_type AS ENUM ('simple', 'configurable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    // Customer groups (tiers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        description TEXT,
        minimum_order_amount NUMERIC(12, 2) DEFAULT 0,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Companies
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        business_type VARCHAR(100),
        industry VARCHAR(100),
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'Ghana',
        tax_id VARCHAR(100),
        business_registration_number VARCHAR(100),
        contact_person_name VARCHAR(200),
        contact_person_email VARCHAR(255),
        contact_person_phone VARCHAR(50),
        requested_payment_terms TEXT,
        status account_status DEFAULT 'pending',
        rejection_reason TEXT,
        customer_group_id UUID REFERENCES customer_groups(id),
        assigned_sales_rep_id UUID,
        account_manager_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add FK for assigned_sales_rep_id and account_manager_id to users
    // (users table already exists, so we do ALTER)
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS assigned_sales_rep_id UUID REFERENCES users(id)`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS account_manager_id UUID REFERENCES users(id)`);

    // Add company_id and company_role to users
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS company_role company_role DEFAULT 'company_admin'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status account_status DEFAULT 'active'`);

    // Custom pricing per company/group per product
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_prices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        customer_group_id UUID REFERENCES customer_groups(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        price NUMERIC(12, 2) NOT NULL,
        min_quantity INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT company_or_group CHECK (company_id IS NOT NULL OR customer_group_id IS NOT NULL)
      )
    `);

    // Product attachments (spec sheets, manuals, certificates)
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name VARCHAR(300) NOT NULL,
        url TEXT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'document',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Procurement lists (multiple wishlists per company)
    await client.query(`
      CREATE TABLE IF NOT EXISTS procurement_lists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(300) NOT NULL,
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS procurement_list_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        list_id UUID NOT NULL REFERENCES procurement_lists(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Visibility columns for products and categories
    await client.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS customer_group_id UUID REFERENCES customer_groups(id)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type product_type DEFAULT 'simple'`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS customer_group_id UUID REFERENCES customer_groups(id)`);
    await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS hide_price BOOLEAN DEFAULT false`);

    // Store credit
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS store_credit NUMERIC(12, 2) DEFAULT 0 CHECK (store_credit >= 0)`);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_companies_customer_group ON companies(customer_group_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_company_prices_product ON company_prices(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_attachments_product ON product_attachments(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_procurement_lists_company ON procurement_lists(company_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_procurement_list_items_list ON procurement_list_items(list_id)`);

    // Seed default customer groups
    await client.query(`
      INSERT INTO customer_groups (name, description, minimum_order_amount, is_default) VALUES
        ('Standard', 'Standard pricing tier', 0, true),
        ('Silver', 'Silver tier with volume discounts', 50000, false),
        ('Gold', 'Gold tier with preferred pricing', 200000, false),
        ('Platinum', 'Platinum tier with best pricing', 500000, false)
      ON CONFLICT DO NOTHING
    `);

    // Migrate existing user company data to company records (if columns exist)
    try {
      const existingUsers = await client.query(
        `SELECT id, email, company_name, tax_id, business_registration_number,
                billing_contact_name, billing_contact_email, billing_contact_phone,
                phone, first_name, last_name, role
         FROM users WHERE company_name IS NOT NULL AND company_id IS NULL`
      );

      for (const user of existingUsers.rows) {
        const companyResult = await client.query(
          `INSERT INTO companies (name, email, phone, tax_id, business_registration_number,
            contact_person_name, contact_person_email, contact_person_phone, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [user.company_name, user.email, user.phone,
           user.tax_id, user.business_registration_number,
           `${user.first_name} ${user.last_name}`, user.email, user.phone]
        );

        if (companyResult.rows.length > 0) {
          await client.query(
            `UPDATE users SET company_id = $1 WHERE id = $2`,
            [companyResult.rows[0].id, user.id]
          );
        }
      }
    } catch { /* columns may not exist yet — skip data migration */ }

    console.log("B2B company migration completed successfully");
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
