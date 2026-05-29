import { Router, Request, Response } from "express";
import { query } from "../config/db";

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "https://sslplan.com";

router.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT p.id, p.name, p.slug, p.price, p.compare_price, p.description,
              p.sku, p.images, p.stock_status, p.is_active, p.hide_price,
              c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_active = true
         AND (p.hide_price IS NULL OR p.hide_price = false)
         AND p.price IS NOT NULL
         AND p.price > 0
       ORDER BY p.name`
    );

    const items = result.rows.map((p: any) => {
      const images = Array.isArray(p.images) ? p.images : [];
      const link = `${FRONTEND_URL}/products/${p.slug}`;
      const imageLink = images.length > 0 ? images[0] : "";
      const price = Number(p.price).toFixed(2);

      return `
  <item>
    <g:id>${escapeXml(p.sku || p.id)}</g:id>
    <g:title>${escapeXml(p.name)}</g:title>
    <g:description>${escapeXml((p.description || "").substring(0, 5000))}</g:description>
    <g:link>${escapeXml(link)}</g:link>
    ${imageLink ? `<g:image_link>${escapeXml(imageLink)}</g:image_link>` : ""}
    <g:availability>${p.stock_status === "out_of_stock" ? "out_of_stock" : "in_stock"}</g:availability>
    <g:price>${price} GHS</g:price>
    ${p.compare_price ? `<g:sale_price>${price} GHS</g:sale_price>` : ""}
    ${p.category_name ? `<g:product_type>${escapeXml(p.category_name)}</g:product_type>` : ""}
    <g:brand>Bali-Can Limited</g:brand>
    <g:condition>new</g:condition>
    <g:identifier_exists>${p.sku ? "true" : "false"}</g:identifier_exists>
  </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Bali-Can Limited — Product Feed</title>
    <link>${escapeXml(FRONTEND_URL)}</link>
    <description>Bali-Can Limited product catalog for Google Merchant Center. Products with public pricing only.</description>
    ${items.join("\n")}
  </channel>
</rss>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    console.error("Merchant feed error:", err);
    res.status(500).json({ error: "Failed to generate feed" });
  }
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default router;
