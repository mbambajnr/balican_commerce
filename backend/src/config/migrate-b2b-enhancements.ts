import { pool } from "./db";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Store Credit Audit Trail ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        amount NUMERIC(12, 2) NOT NULL,
        type VARCHAR(30) NOT NULL CHECK (type IN ('credit', 'debit', 'adjustment', 'order_apply', 'order_refund')),
        reason TEXT NOT NULL,
        reference_id UUID,
        reference_type VARCHAR(50),
        balance_before NUMERIC(12, 2) NOT NULL,
        balance_after NUMERIC(12, 2) NOT NULL,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_store_credit_user ON store_credit_transactions(user_id)`);

    // ── Payment Methods per Company/Group ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS company_payment_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        customer_group_id UUID REFERENCES customer_groups(id) ON DELETE CASCADE,
        method VARCHAR(50) NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (company_id, method),
        UNIQUE (customer_group_id, method)
      )
    `);

    // ── Shipping Methods ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        base_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
        rate_per_kg NUMERIC(12, 2) DEFAULT 0,
        estimated_days_min INTEGER DEFAULT 1,
        estimated_days_max INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_shipping_methods (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        customer_group_id UUID REFERENCES customer_groups(id) ON DELETE CASCADE,
        shipping_method_id UUID NOT NULL REFERENCES shipping_methods(id) ON DELETE CASCADE,
        custom_rate NUMERIC(12, 2),
        is_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (company_id, shipping_method_id),
        UNIQUE (customer_group_id, shipping_method_id)
      )
    `);

    // ── Product Variants (structured, replacing opaque JSONB) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        sku VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(300) NOT NULL,
        price NUMERIC(12, 2),
        stock_status VARCHAR(50) DEFAULT 'in_stock',
        option_values JSONB NOT NULL DEFAULT '[]',
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku)`);

    // ── Option Types (for configurable products) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS option_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        presentation VARCHAR(100),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS option_values (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        option_type_id UUID NOT NULL REFERENCES option_types(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        presentation VARCHAR(100),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_option_types (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        option_type_id UUID NOT NULL REFERENCES option_types(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        UNIQUE (product_id, option_type_id)
      )
    `);

    // ── Cart (server-side) ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (cart_id, product_id, variant_id)
      )
    `);

    // ── Quick Orders ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS quick_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        source VARCHAR(30) NOT NULL DEFAULT 'manual',
        items JSONB NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed default shipping methods
    await client.query(`INSERT INTO shipping_methods (name, code, base_rate, rate_per_kg, estimated_days_min, estimated_days_max)
      VALUES
        ('Standard Delivery', 'standard', 0, 0, 3, 7),
        ('Express Delivery', 'express', 50.00, 2.50, 1, 2),
        ('Same-Day Delivery', 'same_day', 100.00, 5.00, 0, 1)
      ON CONFLICT (code) DO NOTHING
    `);

    // Seed default option types
    await client.query(`INSERT INTO option_types (name, presentation, sort_order)
      VALUES
        ('Color', 'Color', 0),
        ('Size', 'Size', 1),
        ('Wattage', 'Wattage', 2),
        ('Voltage', 'Voltage', 3)
      ON CONFLICT DO NOTHING
    `);

    console.log("B2B enhancements migration completed successfully");
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
