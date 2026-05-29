import { Router, Request, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import jwt from "jsonwebtoken";
import { query } from "../config/db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { config } from "../config";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { slugify } from "../utils/helpers";
import { searchProducts, indexProduct, deleteProductIndex } from "../services/elasticsearch";

export async function resolvePricingContext(req: Request): Promise<{
  companyId: string | null;
  groupId: string | null;
  canSeePrices: boolean;
  isAdmin: boolean;
}> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return { companyId: null, groupId: null, canSeePrices: false, isAdmin: false };
    }
    const decoded = jwt.verify(header.split(" ")[1], config.jwtSecret) as { userId: string; role: string };
    const userResult = await query(
      `SELECT u.company_id, u.account_status, c.customer_group_id, c.status as company_status
       FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
      [decoded.userId]
    );
    if (userResult.rows.length === 0) {
      return { companyId: null, groupId: null, canSeePrices: false, isAdmin: false };
    }
    const row = userResult.rows[0];
    const isAdmin = decoded.role === "admin";
    const canSeePrices = isAdmin || (
      row.account_status === "active"
      && row.company_id
      && row.company_status === "active"
    );
    return { companyId: row.company_id, groupId: row.customer_group_id, canSeePrices, isAdmin };
  } catch {
    return { companyId: null, groupId: null, canSeePrices: false, isAdmin: false };
  }
}

export async function applyCustomPricing(products: any[], companyId: string | null, groupId: string | null) {
  const ids = products.map((p: any) => p.id).filter(Boolean);
  if (ids.length === 0) return products;
  const prices = await query(
    `SELECT DISTINCT ON (product_id) product_id, price, min_quantity
     FROM company_prices
     WHERE product_id = ANY($1)
       AND (company_id = $2 OR (company_id IS NULL AND customer_group_id = $3))
     ORDER BY product_id,
       CASE WHEN company_id = $2 THEN 0 ELSE 1 END,
       min_quantity ASC`,
    [ids, companyId, groupId]
  );
  const priceMap = new Map(prices.rows.map((r: any) => [r.product_id, r]));
  return products.map((p: any) => {
    const cp = priceMap.get(p.id);
    if (cp) return { ...p, price: parseFloat(cp.price), custom_price: true };
    // No explicit customer-facing price → nullify (base price is internal-only)
    return { ...p, price: null, compare_price: null, custom_price: false };
  });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { search, category, subcategory, stockStatus, featured, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const { companyId, groupId, canSeePrices, isAdmin } = await resolvePricingContext(req);

    if (search) {
      const esResult = await searchProducts(search as string, {
        category: category as string | undefined,
        subcategory: subcategory as string | undefined,
        from: (pageNum - 1) * limitNum,
        size: limitNum,
      });

      let products = esResult.products;
      if (isAdmin) {
        // Admin sees internal base price
        products = products.map((p: any) => p.hide_price ? { ...p, price: null, compare_price: null } : p);
      } else if (canSeePrices) {
        // Customer-facing: only resolved custom prices, never base price
        products = await applyCustomPricing(products, companyId, groupId);
        products = products.map((p: any) => p.hide_price ? { ...p, price: null, compare_price: null } : p);
      } else {
        products = products.map((p: any) => ({ ...p, price: null, compare_price: null }));
      }

      const productIds = products.map((p: any) => p.id).filter(Boolean);
      if (productIds.length > 0) {
        const mediaRows = await query(
          `SELECT DISTINCT ON (product_id) product_id, id, url, alt_text, sort_order, media_type, is_primary, 'attachment' as source
           FROM product_attachments
           WHERE product_id = ANY($1) AND media_type = 'image'
           ORDER BY product_id, is_primary DESC, sort_order, created_at`,
          [productIds]
        );
        const imgRows = await query(
          `SELECT DISTINCT ON (product_id) product_id, id, url, alt as alt_text, sort_order, 'image' as source
           FROM product_images
           WHERE product_id = ANY($1)
           ORDER BY product_id, sort_order, created_at`,
          [productIds]
        );
        const videoRows = await query(
          `SELECT DISTINCT product_id FROM product_attachments
           WHERE product_id = ANY($1) AND media_type = 'video'`,
          [productIds]
        );
        const videoSet = new Set(videoRows.rows.map((r: any) => r.product_id));
        const primaryMap = new Map(mediaRows.rows.map((r: any) => [r.product_id, r]));
        const imgMap = new Map(imgRows.rows.map((r: any) => [r.product_id, r]));
        products = products.map((p: any) => {
          const primary = primaryMap.get(p.id);
          const fallback = imgMap.get(p.id);
          const image = primary || fallback;
          return {
            ...p,
            primary_image: image ? { id: image.id, url: image.url, alt_text: image.alt_text } : null,
            has_video: videoSet.has(p.id),
          };
        });
      }

      res.json({
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: esResult.total,
          pages: Math.ceil(esResult.total / limitNum),
        },
      });
    } else {
      const offset = (pageNum - 1) * limitNum;
      const params: any[] = [];
      const conditions: string[] = ["p.is_active = true"];

      if (subcategory) {
        conditions.push(`c.slug = $${params.length + 1}`);
        params.push(subcategory);
      } else if (category) {
        // Parent category filter includes all descendant categories
        conditions.push(`p.category_id IN (
          WITH RECURSIVE cat_tree AS (
            SELECT id FROM categories WHERE slug = $${params.length + 1}
            UNION ALL
            SELECT c2.id FROM categories c2 JOIN cat_tree ct ON c2.parent_category_id = ct.id
          ) SELECT id FROM cat_tree
        )`);
        params.push(category);
      }
      if (stockStatus) {
        conditions.push(`p.stock_status = $${params.length + 1}`);
        params.push(stockStatus);
      }
      if (featured === "true" || featured === "1") {
        conditions.push("p.featured = true");
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const countResult = await query(
        `SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await query(
        `SELECT p.*, c.name as category_name, c.slug as category_slug
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         ${where}
         ORDER BY p.featured DESC, p.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitNum, offset]
      );

      let products = result.rows;
      if (isAdmin) {
        // Admin sees internal base price
        products = products.map((p: any) => p.hide_price ? { ...p, price: null, compare_price: null } : p);
      } else if (canSeePrices) {
        // Customer-facing: only resolved custom prices, never base price
        products = await applyCustomPricing(products, companyId, groupId);
        products = products.map((p: any) => p.hide_price ? { ...p, price: null, compare_price: null } : p);
      } else {
        products = products.map((p: any) => ({ ...p, price: null, compare_price: null }));
      }

      const productIds = products.map((p: any) => p.id).filter(Boolean);
      if (productIds.length > 0) {
        const mediaRows = await query(
          `SELECT DISTINCT ON (product_id) product_id, id, url, alt_text, sort_order, media_type, is_primary
           FROM product_attachments
           WHERE product_id = ANY($1) AND media_type = 'image'
           ORDER BY product_id, is_primary DESC, sort_order, created_at`,
          [productIds]
        );
        const imgRows = await query(
          `SELECT DISTINCT ON (product_id) product_id, id, url, alt as alt_text, sort_order
           FROM product_images
           WHERE product_id = ANY($1)
           ORDER BY product_id, sort_order, created_at`,
          [productIds]
        );
        const videoRows = await query(
          `SELECT DISTINCT product_id FROM product_attachments
           WHERE product_id = ANY($1) AND media_type = 'video'`,
          [productIds]
        );
        const videoSet = new Set(videoRows.rows.map((r: any) => r.product_id));
        const primaryMap = new Map(mediaRows.rows.map((r: any) => [r.product_id, r]));
        const imgMap = new Map(imgRows.rows.map((r: any) => [r.product_id, r]));
        products = products.map((p: any) => {
          const primary = primaryMap.get(p.id);
          const fallback = imgMap.get(p.id);
          const image = primary || fallback;
          return {
            ...p,
            primary_image: image ? { id: image.id, url: image.url, alt_text: image.alt_text } : null,
            has_video: videoSet.has(p.id),
          };
        });
      }

      res.json({
        products,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      });
    }
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug, c.seo_title as category_seo_title, c.seo_description as category_seo_description, c.intro_text as category_intro_text
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.slug = $1 AND p.is_active = true`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    let product = result.rows[0];
    const { companyId, groupId, canSeePrices, isAdmin } = await resolvePricingContext(req);

    const [imgResult, attrResult, attachResult] = await Promise.all([
      query("SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at", [product.id]),
      query("SELECT * FROM product_attributes WHERE product_id = $1 ORDER BY sort_order, name", [product.id]),
      query("SELECT * FROM product_attachments WHERE product_id = $1 AND media_type IN ('image', 'video') ORDER BY sort_order, created_at", [product.id]),
    ]);

    product.images_list = imgResult.rows;
    product.attributes_list = attrResult.rows;
    product.attachments = attachResult.rows;

    const primaryImage = attachResult.rows.find((a: any) => a.media_type === 'image' && a.is_primary)
      || attachResult.rows.find((a: any) => a.media_type === 'image');
    product.primary_image = primaryImage ? { id: primaryImage.id, url: primaryImage.url, alt_text: primaryImage.alt_text } : null;

    const allMedia = [
      ...attachResult.rows.map((a: any) => ({
        id: a.id,
        media_type: a.media_type,
        url: a.url,
        embed_url: a.embed_url,
        provider: a.provider,
        filename: a.filename || a.name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        alt_text: a.alt_text,
        title: a.title,
        thumbnail_url: a.thumbnail_url,
        sort_order: a.sort_order,
        is_primary: a.is_primary,
        created_at: a.created_at,
      })),
      ...imgResult.rows.map((i: any) => ({
        id: i.id,
        media_type: 'image',
        url: i.url,
        embed_url: null,
        provider: null,
        filename: null,
        mime_type: null,
        size_bytes: null,
        alt_text: i.alt || '',
        title: null,
        thumbnail_url: null,
        sort_order: i.sort_order,
        is_primary: false,
        created_at: i.created_at,
      })),
    ].sort((a: any, b: any) => a.sort_order - b.sort_order || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    product.media = allMedia;
    product.images = allMedia.filter((m: any) => m.media_type === 'image');
    product.videos = allMedia.filter((m: any) => m.media_type === 'video');

    if (isAdmin) {
      // Admin sees internal base price
      if (product.hide_price) {
        product.price = null;
        product.compare_price = null;
      }
    } else if (canSeePrices) {
      // Customer-facing: only resolved custom prices, never base price
      const priced = await applyCustomPricing([product], companyId, groupId);
      product = priced[0];
      if (product.hide_price) {
        product.price = null;
        product.compare_price = null;
      }
    } else {
      product.price = null;
      product.compare_price = null;
    }

    res.json({ product });
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

router.post("/", authenticate, requireAdmin, validate(z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  price: z.number().positive(),
  comparePrice: z.number().positive().optional(),
  stockStatus: z.string().optional(),
  images: z.array(z.string()).optional(),
  variants: z.array(z.any()).optional(),
  specs: z.record(z.any()).optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sku, description, categoryId, price, comparePrice, stockStatus, images, variants, specs, seoTitle, seoDescription } = req.body;
    const slug = slugify(name);

    if (sku) {
      const existing = await query("SELECT id FROM products WHERE sku = $1", [sku]);
      if (existing.rows.length > 0) return res.status(409).json({ error: `SKU "${sku}" already exists` });
    }

    const result = await query(
      `INSERT INTO products (name, sku, slug, description, category_id, price, compare_price, stock_status, images, variants, specs, seo_title, seo_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [name, sku || null, slug, description || null, categoryId, price, comparePrice || null, stockStatus || "in_stock", images || [], variants || [], specs || {}, seoTitle || null, seoDescription || null]
    );

    const product = result.rows[0];
    const catResult = await query("SELECT name, slug FROM categories WHERE id = $1", [categoryId]);
    if (catResult.rows.length > 0) {
      product.category_name = catResult.rows[0].name;
      product.category_slug = catResult.rows[0].slug;
    }

    indexProduct(product).catch((err) => console.error("ES index error:", err));

    res.status(201).json({ product });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  price: z.number().positive().optional(),
  comparePrice: z.number().positive().optional(),
  stockStatus: z.string().optional(),
  isActive: z.boolean().optional(),
  shortDescription: z.string().optional(),
  specs: z.record(z.any()).optional(),
  seoTitle: z.string().max(300).optional(),
  seoDescription: z.string().optional(),
});

router.put("/:id", authenticate, requireAdmin, validate(updateProductSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sku, description, categoryId, price, comparePrice, stockStatus, images, variants, specs, isActive } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); fields.push(`slug = $${idx++}`); values.push(slugify(name)); }
    if (sku !== undefined) { fields.push(`sku = $${idx++}`); values.push(sku || null); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (categoryId) { fields.push(`category_id = $${idx++}`); values.push(categoryId); }
    if (price) { fields.push(`price = $${idx++}`); values.push(price); }
    if (comparePrice !== undefined) { fields.push(`compare_price = $${idx++}`); values.push(comparePrice); }
    if (stockStatus) { fields.push(`stock_status = $${idx++}`); values.push(stockStatus); }
    if (images) { fields.push(`images = $${idx++}`); values.push(images); }
    if (variants) { fields.push(`variants = $${idx++}`); values.push(variants); }
    if (specs) { fields.push(`specs = $${idx++}`); values.push(specs); }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = result.rows[0];
    const catResult = await query("SELECT name, slug FROM categories WHERE id = $1", [product.category_id]);
    if (catResult.rows.length > 0) {
      product.category_name = catResult.rows[0].name;
      product.category_slug = catResult.rows[0].slug;
    }

    if (isActive === false) {
      deleteProductIndex(product.id).catch(() => {});
    } else {
      indexProduct(product).catch((err) => console.error("ES index error:", err));
    }

    res.json({ product });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.get("/categories/all", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT c.*, c2.name as parent_name,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
       FROM categories c
       LEFT JOIN categories c2 ON c.parent_category_id = c2.id
       WHERE c.is_active = true
       ORDER BY c.sort_order, c.name`
    );
    // Build tree structure
    const map = new Map<string, any>();
    const roots: any[] = [];
    for (const r of result.rows) {
      map.set(r.id, { ...r, children: [] });
    }
    for (const r of result.rows) {
      const node = map.get(r.id);
      if (r.parent_category_id && map.has(r.parent_category_id)) {
        map.get(r.parent_category_id).children.push(node);
      } else if (!r.parent_category_id) {
        roots.push(node);
      }
    }
    res.json({ categories: roots });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/bulk-import", authenticate, requireAdmin, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

    if (rows.length === 0) return res.status(400).json({ error: "File is empty" });

    const results = { total: rows.length, created: 0, skipped: 0, errors: [] as { row: number; message: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const name = (row["name"] || row["Name"] || row["NAME"] || "").trim();
      if (!name) { results.errors.push({ row: rowNum, message: "Missing name" }); results.skipped++; continue; }

      const sku = (row["sku"] || row["SKU"] || row["Sku"] || "").trim() || null;

      const priceRaw = row["price"] || row["Price"] || row["PRICE"] || "";
      const price = parseFloat(priceRaw);
      if (isNaN(price) || price <= 0) { results.errors.push({ row: rowNum, message: `Invalid price: ${priceRaw}` }); results.skipped++; continue; }

      const categoryName = (row["category"] || row["Category"] || row["CATEGORY"] || row["category_name"] || "Uncategorized").trim();

      const description = (row["description"] || row["Description"] || row["DESCRIPTION"] || "").trim() || null;
      const comparePriceRaw = row["compare_price"] || row["comparePrice"] || row["Compare Price"] || "";
      const comparePrice = comparePriceRaw ? parseFloat(comparePriceRaw) || null : null;
      const stockStatus = (row["stock_status"] || row["stockStatus"] || row["Stock"] || "in_stock").trim().toLowerCase();
      const slug = slugify(name);

      if (sku) {
        const skuCheck = await query("SELECT id FROM products WHERE sku = $1", [sku]);
        if (skuCheck.rows.length > 0) { results.errors.push({ row: rowNum, message: `Duplicate SKU: ${sku}` }); results.skipped++; continue; }
      }

      const imagesRaw = row["images"] || row["Images"] || row["Image URLs"] || "";
      const images = imagesRaw ? imagesRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      const variantsRaw = row["variants"] || row["Variants"] || "";
      let variants: any[] = [];
      if (variantsRaw) { try { variants = JSON.parse(variantsRaw); } catch { variants = []; } }
      const specsRaw = row["specs"] || row["Specs"] || "";
      let specs: Record<string, any> = {};
      if (specsRaw) { try { specs = JSON.parse(specsRaw); } catch { specs = {}; } }

      const seoTitle = (row["seo_title"] || row["seoTitle"] || row["SEO Title"] || "").trim() || null;
      const seoDescription = (row["seo_description"] || row["seoDescription"] || row["SEO Description"] || "").trim() || null;

      const existing = await query("SELECT id FROM products WHERE slug = $1", [slug]);
      if (existing.rows.length > 0) { results.errors.push({ row: rowNum, message: `Duplicate product: ${name}` }); results.skipped++; continue; }

      let catResult = await query("SELECT id FROM categories WHERE slug = $1", [slugify(categoryName)]);
      if (catResult.rows.length === 0) {
        catResult = await query(
          `INSERT INTO categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [categoryName, slugify(categoryName)]
        );
        if (catResult.rows.length === 0) {
          catResult = await query("SELECT id FROM categories WHERE slug = $1", [slugify(categoryName)]);
        }
      }
      const categoryId = catResult.rows[0].id;

      try {
        const result = await query(
          `INSERT INTO products (name, sku, slug, description, category_id, price, compare_price, stock_status, images, variants, specs, seo_title, seo_description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
          [name, sku, slug, description, categoryId, price, comparePrice, stockStatus, images, variants, specs, seoTitle, seoDescription]
        );
        const product = result.rows[0];
        product.category_name = categoryName;
        indexProduct(product).catch((err) => console.error("ES index error:", err));
        results.created++;
      } catch (err: any) {
        results.errors.push({ row: rowNum, message: err.message || "Insert failed" });
        results.skipped++;
      }
    }

    res.json(results);
  } catch (err) {
    console.error("Bulk import error:", err);
    res.status(500).json({ error: "Bulk import failed" });
  }
});

export default router;
