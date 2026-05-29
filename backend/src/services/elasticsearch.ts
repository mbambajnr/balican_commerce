import { Client } from "@elastic/elasticsearch";
import { config } from "../config";
import { query } from "../config/db";

export const esClient = new Client({
  node: config.elasticsearch.url,
});

export const PRODUCTS_INDEX = "sslplan_products";
export const ANALYTICS_INDEX = "sslplan_analytics";

export async function ensureIndices(): Promise<void> {
  const exists = await esClient.indices.exists({ index: PRODUCTS_INDEX });
  if (!exists) {
    await esClient.indices.create({
      index: PRODUCTS_INDEX,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        properties: {
          id: { type: "keyword" },
          name: { type: "text", analyzer: "standard" },
          description: { type: "text", analyzer: "standard" },
          slug: { type: "keyword" },
          category_id: { type: "keyword" },
          category_name: { type: "text" },
          category_slug: { type: "keyword" },
          parent_category_slug: { type: "keyword" },
          price: { type: "double" },
          compare_price: { type: "double" },
          stock_status: { type: "keyword" },
          image: { type: "keyword" },
          is_active: { type: "boolean" },
          hide_price: { type: "boolean" },
          created_at: { type: "date" },
          updated_at: { type: "date" },
        },
      },
    });
  }

  const analyticsExists = await esClient.indices.exists({ index: ANALYTICS_INDEX });
  if (!analyticsExists) {
    await esClient.indices.create({
      index: ANALYTICS_INDEX,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        properties: {
          type: { type: "keyword" },
          query: { type: "text" },
          product_id: { type: "keyword" },
          product_name: { type: "text" },
          user_id: { type: "keyword" },
          result_count: { type: "integer" },
          ip: { type: "ip" },
          timestamp: { type: "date" },
          metadata: { type: "object" },
        },
      },
    });
  }
}

export async function indexProduct(product: any): Promise<void> {
  // Resolve parent_category_slug
  let parentSlug = "";
  if (product.category_id) {
    const parent = await query("SELECT c2.slug FROM categories c1 JOIN categories c2 ON c1.parent_category_id = c2.id WHERE c1.id = $1", [product.category_id]);
    if (parent.rows.length > 0) parentSlug = parent.rows[0].slug;
  }

  await esClient.index({
    index: PRODUCTS_INDEX,
    id: product.id,
    document: {
      id: product.id,
      name: product.name,
      description: product.description || "",
      slug: product.slug,
      category_id: product.category_id,
      category_name: product.category_name || "",
      category_slug: product.category_slug || "",
      parent_category_slug: parentSlug,
      price: parseFloat(product.price),
      compare_price: product.compare_price ? parseFloat(product.compare_price) : null,
      stock_status: product.stock_status || "in_stock",
      image: (product.images && product.images[0]) || "",
      is_active: product.is_active !== false,
      hide_price: product.hide_price === true,
      created_at: product.created_at,
      updated_at: product.updated_at || product.created_at,
    },
    refresh: "wait_for",
  });
}

export async function deleteProductIndex(id: string): Promise<void> {
  try {
    await esClient.delete({ index: PRODUCTS_INDEX, id });
  } catch (err: any) {
    if (err.meta?.statusCode !== 404) throw err;
  }
}

export async function searchProducts(query: string, options?: {
  category?: string;
  subcategory?: string;
  from?: number;
  size?: number;
}) {
  const must: any[] = [
    { match: { name: { query, operator: "or", fuzziness: "AUTO" } } },
  ];

  const should: any[] = [
    { match: { description: { query, operator: "or", fuzziness: "AUTO" } } },
  ];

  const filter: any[] = [{ term: { is_active: true } }];
  if (options?.subcategory) {
    filter.push({ term: { category_slug: options.subcategory } });
  } else if (options?.category) {
    // Parent category filter includes direct + children via stored parent_category_slug
    filter.push({
      bool: {
        should: [
          { term: { category_slug: options.category } },
          { term: { parent_category_slug: options.category } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  const result = await esClient.search({
    index: PRODUCTS_INDEX,
    query: {
      bool: {
        must,
        should,
        minimum_should_match: 1,
        filter,
      },
    },
    from: options?.from || 0,
    size: options?.size || 20,
    sort: [
      { _score: { order: "desc" } },
      { created_at: { order: "desc" } },
    ],
  });

  const hits = result.hits.hits;
  return {
    products: hits.map((h: any) => h._source),
    total: typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value || 0,
  };
}

export async function trackAnalytics(event: {
  type: string;
  query?: string;
  productId?: string;
  productName?: string;
  userId?: string;
  resultCount?: number;
  ip?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  await esClient.index({
    index: ANALYTICS_INDEX,
    document: {
      type: event.type,
      query: event.query,
      product_id: event.productId,
      product_name: event.productName,
      user_id: event.userId,
      result_count: event.resultCount,
      ip: event.ip,
      metadata: event.metadata || {},
      timestamp: new Date().toISOString(),
    },
  });
}
