import { Router, Request, Response } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { query } from "../config/db";

const router = Router();

router.post("/track-search", async (req: Request, res: Response) => {
  try {
    const { query: searchQuery, resultCount } = req.body;
    if (!searchQuery) return res.status(400).json({ error: "Missing query" });

    await query(
      `INSERT INTO product_analytics_events
         (event_type, search_query, result_count, ip, user_id)
       VALUES ('search', $1, $2, $3, $4)`,
      [searchQuery, resultCount || 0, req.ip || null, (req as any).userId || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Track search error:", err);
    res.status(500).json({ error: "Failed to track" });
  }
});

router.post("/track-view", async (req: Request, res: Response) => {
  try {
    const { productId, productName } = req.body;
    if (!productId) return res.status(400).json({ error: "Missing productId" });

    await query(
      `INSERT INTO product_analytics_events
         (event_type, product_id, product_name, ip, user_id)
       VALUES ('product_view', $1, $2, $3, $4)`,
      [productId, productName || "", req.ip || null, (req as any).userId || null]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Track view error:", err);
    res.status(500).json({ error: "Failed to track" });
  }
});

router.get("/popular-searches", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      searches: (await query(
        `SELECT search_query AS query, COUNT(*)::int AS count, MAX(created_at) AS "lastSearched"
         FROM product_analytics_events
         WHERE event_type = 'search' AND search_query IS NOT NULL
         GROUP BY search_query
         ORDER BY count DESC, "lastSearched" DESC
         LIMIT 20`
      )).rows,
    });
  } catch (err) {
    console.error("Popular searches error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

router.get("/popular-products", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      products: (await query(
        `SELECT product_id AS "productId",
           COALESCE((ARRAY_AGG(product_name ORDER BY created_at DESC))[1], 'Unknown') AS "productName",
           COUNT(*)::int AS views
         FROM product_analytics_events
         WHERE event_type = 'product_view' AND product_id IS NOT NULL
         GROUP BY product_id
         ORDER BY views DESC
         LIMIT 20`
      )).rows,
    });
  } catch (err) {
    console.error("Popular products error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

router.get("/search-volume", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      volume: (await query(
        `SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
           COUNT(*)::int AS count
         FROM product_analytics_events
         WHERE event_type = 'search'
         GROUP BY date
         ORDER BY date ASC`
      )).rows,
    });
  } catch (err) {
    console.error("Search volume error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

export default router;
