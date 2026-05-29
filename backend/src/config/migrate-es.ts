import { query } from "./db";
import { ensureIndices, esClient, PRODUCTS_INDEX } from "../services/elasticsearch";

async function migrate() {
  console.log("Setting up Elasticsearch indices...");
  await ensureIndices();
  console.log("Indices ready.");

  const result = await query(
    `SELECT p.*, c.name as category_name, c.slug as category_slug
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id`
  );
  const products = result.rows;
  console.log(`Indexing ${products.length} products...`);

  const operations = products.flatMap((p: any) => [
    { index: { _index: PRODUCTS_INDEX, _id: p.id } },
    {
      id: p.id,
      name: p.name,
      description: p.description || "",
      slug: p.slug,
      category_id: p.category_id,
      category_name: p.category_name || "",
      category_slug: p.category_slug || "",
      price: parseFloat(p.price),
      compare_price: p.compare_price ? parseFloat(p.compare_price) : null,
      stock_status: p.stock_status || "in_stock",
      image: (p.images && p.images[0]) || "",
      is_active: p.is_active !== false,
      created_at: p.created_at,
      updated_at: p.updated_at || p.created_at,
    },
  ]);

  if (operations.length > 0) {
    const bulkResp = await esClient.bulk({ refresh: "wait_for", operations });
    if (bulkResp.errors) {
      console.error("Bulk index had errors:", bulkResp.items.filter((i: any) => i.index?.error));
    }
  }

  console.log("Done.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
