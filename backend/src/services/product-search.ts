import { query } from "../config/db";

interface ProductSearchOptions {
  category?: string;
  subcategory?: string;
  from?: number;
  size?: number;
}

export async function searchProducts(search: string, options: ProductSearchOptions = {}) {
  const params: unknown[] = [search];
  const conditions = [
    "p.is_active = true",
    `(to_tsvector(
       'english',
       COALESCE(p.name, '') || ' ' ||
       COALESCE(p.short_description, '') || ' ' ||
       COALESCE(p.description, '') || ' ' ||
       COALESCE(p.sku, '')
     ) @@ websearch_to_tsquery('english', $1)
     OR p.name % $1
     OR p.name ILIKE '%' || $1 || '%'
     OR COALESCE(p.description, '') ILIKE '%' || $1 || '%')`,
  ];

  if (options.subcategory) {
    params.push(options.subcategory);
    conditions.push(`c.slug = $${params.length}`);
  } else if (options.category) {
    params.push(options.category);
    conditions.push(`p.category_id IN (
      WITH RECURSIVE cat_tree AS (
        SELECT id FROM categories WHERE slug = $${params.length}
        UNION ALL
        SELECT child.id
        FROM categories child
        JOIN cat_tree parent ON child.parent_category_id = parent.id
      )
      SELECT id FROM cat_tree
    )`);
  }

  const where = conditions.join(" AND ");
  const countResult = await query(
    `SELECT COUNT(*)
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}`,
    params
  );

  params.push(options.size ?? 20, options.from ?? 0);
  const result = await query(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
       ts_rank_cd(
         to_tsvector(
           'english',
           COALESCE(p.name, '') || ' ' ||
           COALESCE(p.short_description, '') || ' ' ||
           COALESCE(p.description, '') || ' ' ||
           COALESCE(p.sku, '')
         ),
         websearch_to_tsquery('english', $1)
       ) + (similarity(p.name, $1) * 2) AS search_rank
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where}
     ORDER BY search_rank DESC, p.featured DESC, p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    products: result.rows.map(({ search_rank: _searchRank, ...product }) => product),
    total: Number(countResult.rows[0].count),
  };
}
