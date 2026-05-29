import { Router, Request, Response } from "express";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { esClient, ANALYTICS_INDEX, trackAnalytics } from "../services/elasticsearch";

const router = Router();

router.post("/track-search", async (req: Request, res: Response) => {
  try {
    const { query: searchQuery, resultCount } = req.body;
    if (!searchQuery) return res.status(400).json({ error: "Missing query" });

    await trackAnalytics({
      type: "search",
      query: searchQuery,
      resultCount: resultCount || 0,
      ip: req.ip,
      userId: (req as any).userId || undefined,
    });

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

    await trackAnalytics({
      type: "product_view",
      productId,
      productName: productName || "",
      ip: req.ip,
      userId: (req as any).userId || undefined,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Track view error:", err);
    res.status(500).json({ error: "Failed to track" });
  }
});

router.get("/popular-searches", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await esClient.search({
      index: ANALYTICS_INDEX,
      size: 0,
      query: { term: { type: "search" } },
      aggs: {
        popular: {
          terms: { field: "query", size: 20, min_doc_count: 1 },
          aggs: {
            hits: { top_hits: { size: 1, _source: ["timestamp"] } },
          },
        },
      },
    });

    const buckets: any[] = (result.aggregations as any)?.popular?.buckets || [];
    res.json({
      searches: buckets.map((b: any) => ({
        query: b.key,
        count: b.doc_count,
        lastSearched: b.hits?.hits?.hits?.[0]?._source?.timestamp || null,
      })),
    });
  } catch (err) {
    console.error("Popular searches error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

router.get("/popular-products", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await esClient.search({
      index: ANALYTICS_INDEX,
      size: 0,
      query: { term: { type: "product_view" } },
      aggs: {
        popular: {
          terms: { field: "product_id", size: 20, min_doc_count: 1 },
          aggs: {
            product_name: { top_hits: { size: 1, _source: ["product_name"] } },
          },
        },
      },
    });

    const buckets: any[] = (result.aggregations as any)?.popular?.buckets || [];
    res.json({
      products: buckets.map((b: any) => ({
        productId: b.key,
        productName: b.product_name?.hits?.hits?.[0]?._source?.product_name || "Unknown",
        views: b.doc_count,
      })),
    });
  } catch (err) {
    console.error("Popular products error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

router.get("/search-volume", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await esClient.search({
      index: ANALYTICS_INDEX,
      size: 0,
      query: { term: { type: "search" } },
      aggs: {
        daily: {
          date_histogram: { field: "timestamp", calendar_interval: "day", format: "yyyy-MM-dd" },
        },
      },
    });

    const buckets: any[] = (result.aggregations as any)?.daily?.buckets || [];
    res.json({
      volume: buckets.map((b: any) => ({
        date: b.key_as_string,
        count: b.doc_count,
      })),
    });
  } catch (err) {
    console.error("Search volume error:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

export default router;
