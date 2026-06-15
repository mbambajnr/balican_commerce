import { query } from "./db";

export async function migrateCategorySeo() {
  const checks = [
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_title VARCHAR(300)`,
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_description TEXT`,
    `ALTER TABLE categories ADD COLUMN IF NOT EXISTS intro_text TEXT`,
  ];
  for (const sql of checks) {
    await query(sql);
  }
  console.log("  ✓ category SEO fields (seo_title, seo_description, intro_text)");
}

if (require.main === module) {
  (async () => {
    console.log("Running category SEO migration...");
    await migrateCategorySeo();
    console.log("Done.");
    process.exit(0);
  })().catch((err) => {
    console.error("Category SEO migration failed:", err);
    process.exit(1);
  });
}
