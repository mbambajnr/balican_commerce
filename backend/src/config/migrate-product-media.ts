import { pool } from "./db";

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'product_attachments' AND column_name = 'media_type'`
    );
    if (existing.rows.length > 0) {
      console.log("product_attachments already has media_type — skipping migration");
      await client.query("COMMIT");
      return;
    }

    await client.query(`ALTER TABLE product_attachments ADD COLUMN media_type VARCHAR(20) NOT NULL DEFAULT 'document'`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN storage_key TEXT`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN filename VARCHAR(500)`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN mime_type VARCHAR(100)`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN size_bytes BIGINT`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN alt_text TEXT DEFAULT ''`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN title VARCHAR(300)`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN provider VARCHAR(50)`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN external_url TEXT`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN embed_url TEXT`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN thumbnail_url TEXT`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN sort_order INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN is_primary BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE product_attachments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW()`);
    await client.query(`ALTER TABLE product_attachments ALTER COLUMN name DROP NOT NULL`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_product_attachments_sort ON product_attachments(product_id, sort_order, created_at)`);

    await client.query("COMMIT");
    console.log("product_attachments migration complete");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("product_attachments migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
