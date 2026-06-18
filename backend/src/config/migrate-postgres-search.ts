import { pool } from "./db";

async function migrate() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE INDEX IF NOT EXISTS idx_products_search_vector
      ON products USING GIN (
        to_tsvector(
          'english',
          COALESCE(name, '') || ' ' ||
          COALESCE(short_description, '') || ' ' ||
          COALESCE(description, '') || ' ' ||
          COALESCE(sku, '')
        )
      );

    CREATE INDEX IF NOT EXISTS idx_products_name_trgm
      ON products USING GIN (name gin_trgm_ops);

    CREATE TABLE IF NOT EXISTS product_analytics_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(50) NOT NULL,
      search_query TEXT,
      product_id UUID,
      product_name TEXT,
      user_id UUID,
      result_count INTEGER,
      ip INET,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_product_analytics_type_time
      ON product_analytics_events (event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_product_analytics_search_query
      ON product_analytics_events (search_query)
      WHERE event_type = 'search';
    CREATE INDEX IF NOT EXISTS idx_product_analytics_product
      ON product_analytics_events (product_id)
      WHERE event_type = 'product_view';
  `);
  console.log("PostgreSQL product search and analytics migration complete.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("PostgreSQL search migration failed:", err);
  process.exit(1);
});
