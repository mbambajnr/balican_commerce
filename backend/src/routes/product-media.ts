import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { query } from "../config/db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { getStorageDriver, validateImageFile, parseVideoUrl } from "../services/storage";
import { z } from "zod";
import { validate } from "../middleware/validate";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const err = validateImageFile(file.mimetype, file.originalname);
    if (err) {
      cb(new Error(err));
    } else {
      cb(null, true);
    }
  },
});

const router = Router();

function mediaResponse(row: any) {
  return {
    id: row.id,
    product_id: row.product_id,
    media_type: row.media_type,
    url: row.url,
    storage_key: row.storage_key,
    filename: row.filename || row.name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    alt_text: row.alt_text,
    title: row.title,
    provider: row.provider,
    external_url: row.external_url,
    embed_url: row.embed_url,
    thumbnail_url: row.thumbnail_url,
    sort_order: row.sort_order,
    is_primary: row.is_primary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function checkProductExists(productId: string): Promise<boolean> {
  const result = await query("SELECT id FROM products WHERE id = $1", [productId]);
  return result.rows.length > 0;
}

router.get("/admin/products/:id/media", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!(await checkProductExists(id))) {
      return res.status(404).json({ error: "Product not found" });
    }
    const result = await query(
      `SELECT * FROM product_attachments WHERE product_id = $1 AND media_type IN ('image', 'video') ORDER BY sort_order, created_at`,
      [id]
    );
    res.json({ media: result.rows.map(mediaResponse) });
  } catch (err) {
    console.error("Get product media error:", err);
    res.status(500).json({ error: "Failed to fetch product media" });
  }
});

router.post(
  "/admin/products/:id/media/images",
  authenticate,
  requireAdmin,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.array("images", 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum size is 5MB per image" });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!(await checkProductExists(id))) {
        return res.status(404).json({ error: "Product not found" });
      }
      const files = (req as any).files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No image files uploaded" });
      }

      const existingImages = await query(
        `SELECT id FROM product_attachments WHERE product_id = $1 AND media_type = 'image' AND is_primary = true`,
        [id]
      );
      const hasPrimary = existingImages.rows.length > 0;

      const driver = getStorageDriver();
      const records: any[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const stored = await driver.store(file.buffer, file.originalname, file.mimetype);
        const isFirst = !hasPrimary && records.length === 0 && i === 0;
        const result = await query(
          `INSERT INTO product_attachments (product_id, media_type, url, storage_key, filename, mime_type, size_bytes, sort_order, is_primary)
           VALUES ($1, 'image', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [id, stored.url, stored.storageKey, stored.filename, stored.mimeType, stored.sizeBytes, i, isFirst]
        );
        records.push(mediaResponse(result.rows[0]));
      }

      res.status(201).json({ media: records });
    } catch (err) {
      console.error("Upload images error:", err);
      res.status(500).json({ error: "Failed to upload images" });
    }
  }
);

router.post(
  "/admin/products/:id/media/videos",
  authenticate,
  requireAdmin,
  validate(z.object({
    url: z.string().min(1, "Video URL is required"),
    title: z.string().optional(),
    alt_text: z.string().optional(),
  })),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!(await checkProductExists(id))) {
        return res.status(404).json({ error: "Product not found" });
      }

      const { url, title, alt_text } = req.body;
      const parsed = parseVideoUrl(url);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid video URL. Supported: YouTube, Vimeo, or direct video URL" });
      }

      const sortResult = await query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM product_attachments WHERE product_id = $1`,
        [id]
      );
      const nextSort = sortResult.rows[0].next_sort;

      const result = await query(
        `INSERT INTO product_attachments (product_id, media_type, url, external_url, embed_url, provider, title, alt_text, thumbnail_url, sort_order, is_primary)
         VALUES ($1, 'video', $2, $2, $3, $4, $5, $6, $7, $8, false) RETURNING *`,
        [id, url, parsed.embedUrl, parsed.provider, title || null, alt_text || null, parsed.thumbnailUrl, nextSort]
      );

      res.status(201).json({ media: mediaResponse(result.rows[0]) });
    } catch (err) {
      console.error("Add video error:", err);
      res.status(500).json({ error: "Failed to add video" });
    }
  }
);

router.patch(
  "/admin/products/:id/media/:mediaId/primary",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id, mediaId } = req.params;
      const media = await query(
        `SELECT * FROM product_attachments WHERE id = $1 AND product_id = $2`,
        [mediaId, id]
      );
      if (media.rows.length === 0) {
        return res.status(404).json({ error: "Media not found" });
      }
      if (media.rows[0].media_type !== "image") {
        return res.status(400).json({ error: "Only images can be set as primary" });
      }

      await query(
        `UPDATE product_attachments SET is_primary = false WHERE product_id = $1 AND media_type = 'image'`,
        [id]
      );
      const result = await query(
        `UPDATE product_attachments SET is_primary = true, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [mediaId]
      );

      res.json({ media: mediaResponse(result.rows[0]) });
    } catch (err) {
      console.error("Set primary media error:", err);
      res.status(500).json({ error: "Failed to set primary media" });
    }
  }
);

router.patch(
  "/admin/products/:id/media/:mediaId",
  authenticate,
  requireAdmin,
  validate(z.object({
    alt_text: z.string().optional(),
    title: z.string().optional(),
    sort_order: z.number().int().optional(),
    thumbnail_url: z.string().url().optional().or(z.literal("")),
  })),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id, mediaId } = req.params;
      const existing = await query(
        `SELECT * FROM product_attachments WHERE id = $1 AND product_id = $2`,
        [mediaId, id]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Media not found" });
      }

      const { alt_text, title, sort_order, thumbnail_url } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      if (alt_text !== undefined) { sets.push(`alt_text = $${idx++}`); vals.push(alt_text); }
      if (title !== undefined) { sets.push(`title = $${idx++}`); vals.push(title); }
      if (sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); vals.push(sort_order); }
      if (thumbnail_url !== undefined) { sets.push(`thumbnail_url = $${idx++}`); vals.push(thumbnail_url || null); }

      if (sets.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      sets.push(`updated_at = NOW()`);
      vals.push(mediaId);

      const result = await query(
        `UPDATE product_attachments SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
        vals
      );

      res.json({ media: mediaResponse(result.rows[0]) });
    } catch (err) {
      console.error("Update media error:", err);
      res.status(500).json({ error: "Failed to update media" });
    }
  }
);

router.put(
  "/admin/products/:id/media/reorder",
  authenticate,
  requireAdmin,
  validate(z.object({
    mediaIds: z.array(z.string().uuid()),
  })),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { mediaIds } = req.body;

      for (let i = 0; i < mediaIds.length; i++) {
        await query(
          `UPDATE product_attachments SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND product_id = $3`,
          [i, mediaIds[i], id]
        );
      }

      const result = await query(
        `SELECT * FROM product_attachments WHERE product_id = $1 AND media_type IN ('image', 'video') ORDER BY sort_order, created_at`,
        [id]
      );

      res.json({ media: result.rows.map(mediaResponse) });
    } catch (err) {
      console.error("Reorder media error:", err);
      res.status(500).json({ error: "Failed to reorder media" });
    }
  }
);

router.delete(
  "/admin/products/:id/media/:mediaId",
  authenticate,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id, mediaId } = req.params;
      const media = await query(
        `SELECT * FROM product_attachments WHERE id = $1 AND product_id = $2`,
        [mediaId, id]
      );
      if (media.rows.length === 0) {
        return res.status(404).json({ error: "Media not found" });
      }

      const record = media.rows[0];
      if (record.media_type === "image" && record.storage_key) {
        try {
          const driver = getStorageDriver();
          await driver.delete(record.storage_key);
        } catch {
          // non-fatal: file may already be missing
        }
      }

      await query("DELETE FROM product_attachments WHERE id = $1", [mediaId]);

      if (record.is_primary) {
        const nextImage = await query(
          `SELECT * FROM product_attachments WHERE product_id = $1 AND media_type = 'image' ORDER BY sort_order, created_at LIMIT 1`,
          [id]
        );
        if (nextImage.rows.length > 0) {
          await query(`UPDATE product_attachments SET is_primary = true WHERE id = $1`, [nextImage.rows[0].id]);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Delete media error:", err);
      res.status(500).json({ error: "Failed to delete media" });
    }
  }
);

export default router;
