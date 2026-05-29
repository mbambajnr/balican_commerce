import { query } from "../config/db";

export async function migrateCategoryHierarchy(): Promise<void> {
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_category_id UUID REFERENCES categories(id)`);
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT`);

  await query(`CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_category_id)`);

  console.log("  ✓ categories — added parent_category_id, sort_order, is_active, image_url");
}

if (require.main === module) {
  migrateCategoryHierarchy().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
