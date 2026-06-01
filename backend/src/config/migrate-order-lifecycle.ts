import { query } from "./db";

export async function migrateOrderLifecycle() {
  // Add new enum values to order_status
  // PostgreSQL requires individual ALTER TYPE ... ADD VALUE statements
  const newValues = ["confirmed", "ready_or_shipped", "delivered"];
  for (const val of newValues) {
    await query(`
      DO $$ BEGIN
        ALTER TYPE order_status ADD VALUE IF NOT EXISTS '${val}';
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
  }

  // Order status history / audit table
  await query(`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status     VARCHAR(50),
      to_status       VARCHAR(50) NOT NULL,
      changed_by_user_id   UUID REFERENCES users(id),
      changed_by_company_id UUID REFERENCES companies(id),
      role            VARCHAR(20),
      note            TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_order_status_history_created ON order_status_history(order_id, created_at);`);

  console.log("✓ Order lifecycle migration complete");
}

if (require.main === module) {
  (async () => {
    console.log("Running order lifecycle migration…");
    await migrateOrderLifecycle();
    process.exit(0);
  })().catch((e) => { console.error("Order lifecycle migration failed:", e); process.exit(1); });
}
