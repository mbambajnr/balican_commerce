import { Router, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { query, transaction } from "../config/db";
import { config } from "../config";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

/* ── Simple in-memory rate limiter for guest RFQ ── */
const guestRateMap = new Map<string, { count: number; resetAt: number }>();
const GUEST_RATE_WINDOW = 60_000; // 1 minute
const GUEST_RATE_MAX = 3; // max 3 submissions per window per IP

function checkGuestRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = guestRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    guestRateMap.set(ip, { count: 1, resetAt: now + GUEST_RATE_WINDOW });
    return true;
  }
  if (entry.count >= GUEST_RATE_MAX) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes (skip in test env)
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of guestRateMap) {
      if (now > entry.resetAt) guestRateMap.delete(ip);
    }
  }, 300_000);
}

/* ── Guest RFQ (no auth required) ── */

const guestRfqSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(255),
  contactName: z.string().min(1, "Contact name is required").max(255),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(5, "Phone/WhatsApp is required").max(50),
  address: z.string().min(1, "Address is required").max(2000),
  productId: z.string().uuid().optional().nullable(),
  productName: z.string().max(500).optional().nullable(),
  productSku: z.string().max(100).optional().nullable(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  message: z.string().min(1, "Message/specification is required").max(5000, "Message too long"),
  utm_source: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  utm_term: z.string().max(200).optional().nullable(),
  utm_content: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  referrer_url: z.string().max(2000).optional().nullable(),
});

router.post("/guest", validate(guestRfqSchema), async (req: any, res: Response) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    if (!checkGuestRateLimit(ip)) {
      return res.status(429).json({ error: "Too many submissions. Please try again later." });
    }

    const { companyName, contactName, email, phone, address, productId, productName, productSku, quantity, message,
      utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url } = req.body;

    // Look up product for snapshot if productId provided
    let resolvedProductName = productName;
    let resolvedProductSku = productSku;
    if (productId) {
      const prod = await query("SELECT name, sku FROM products WHERE id = $1", [productId]);
      if (prod.rows.length > 0) {
        resolvedProductName = prod.rows[0].name;
        resolvedProductSku = prod.rows[0].sku || productSku;
      }
    }

    const result = await query(
      `INSERT INTO rfqs (source, status, company_name, contact_name, email, phone, address,
        product_id, product_name, product_sku, quantity, message,
        utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url)
       VALUES ('guest', 'pending_review', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [companyName, contactName, email, phone, address, productId || null, resolvedProductName || null, resolvedProductSku || null, quantity, message,
       utm_source || null, utm_campaign || null, utm_medium || null, utm_term || null, utm_content || null, gclid || null, fbclid || null, referrer_url || null]
    );

    res.status(201).json({ rfq: result.rows[0] });
  } catch (err) {
    console.error("Guest RFQ error:", err);
    res.status(500).json({ error: "Failed to submit RFQ" });
  }
});

/* ── Authenticated RFQ ── */

const createRfqSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  deliveryRequirements: z.string().optional(),
  notes: z.string().optional(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  utm_term: z.string().max(200).optional().nullable(),
  utm_content: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  referrer_url: z.string().max(2000).optional().nullable(),
});

router.post("/", authenticate, validate(createRfqSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity, deliveryRequirements, notes,
      utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url } = req.body;

    const result = await query(
      `INSERT INTO rfqs (user_id, product_id, quantity, delivery_requirements, notes, source,
        utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url)
       VALUES ($1, $2, $3, $4, $5, 'registered',
         $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [req.userId, productId, quantity, deliveryRequirements || null, notes || null,
       utm_source || null, utm_campaign || null, utm_medium || null, utm_term || null, utm_content || null, gclid || null, fbclid || null, referrer_url || null]
    );

    res.status(201).json({ rfq: result.rows[0] });
  } catch (err) {
    console.error("Create RFQ error:", err);
    res.status(500).json({ error: "Failed to submit RFQ" });
  }
});

/* ── Bulk RFQ (auth or guest) ── */

const bulkRfqSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1, "At least one product is required").max(50, "Maximum 50 products per request"),
  message: z.string().max(5000).optional().nullable(),
  deliveryRequirements: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  companyName: z.string().max(255).optional().nullable(),
  contactName: z.string().max(255).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  address: z.string().max(2000).optional().nullable(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  utm_term: z.string().max(200).optional().nullable(),
  utm_content: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  referrer_url: z.string().max(2000).optional().nullable(),
});

router.post("/bulk", validate(bulkRfqSchema), async (req: AuthRequest, res: Response) => {
  try {
    // Optional auth: try to decode JWT if present
    const header = req.headers.authorization;
    if (header && header.startsWith("Bearer ")) {
      try {
        const token = header.split(" ")[1];
        const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; role: string };
        req.userId = decoded.userId;
        req.userRole = decoded.role;
      } catch {}
    }

    const isAuthenticated = !!req.userId;
    const { items, message, deliveryRequirements, notes,
      companyName, contactName, email, phone, address,
      utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url } = req.body;

    // Guest rate limiting
    if (!isAuthenticated) {
      const ip = req.ip || req.connection?.remoteAddress || "unknown";
      if (!checkGuestRateLimit(ip)) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }
    }

    // Resolve contact info
    let resolvedCompanyName = isAuthenticated ? null : (companyName || null);
    let resolvedContactName = isAuthenticated ? null : (contactName || null);
    let resolvedEmail = isAuthenticated ? null : (email || null);
    let resolvedPhone = isAuthenticated ? null : (phone || null);
    let resolvedAddress = isAuthenticated ? null : (address || null);

    if (isAuthenticated) {
      const userResult = await query(
        `SELECT u.first_name, u.last_name, u.email, u.phone, u.address,
                u.company_name, c.name as company_legal_name
         FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
        [req.userId]
      );
      if (userResult.rows.length > 0) {
        const u = userResult.rows[0];
        resolvedCompanyName = u.company_legal_name || u.company_name;
        resolvedContactName = `${u.first_name || ""} ${u.last_name || ""}`.trim() || null;
        resolvedEmail = u.email;
        resolvedPhone = u.phone;
        resolvedAddress = u.address;
      }
    }

    const source = isAuthenticated ? "registered" : "guest";
    const rfqs: any[] = [];
    const errors: { index: number; message: string }[] = [];

    await transaction(async (client) => {
      for (let i = 0; i < items.length; i++) {
        const { productId, quantity } = items[i];

        const prodResult = await client.query(
          "SELECT id, name, sku FROM products WHERE id = $1", [productId]
        );
        if (prodResult.rows.length === 0) {
          errors.push({ index: i, message: `Product not found: ${productId}` });
          continue;
        }
        const product = prodResult.rows[0];

        const insertResult = await client.query(
          `INSERT INTO rfqs (user_id, source, company_name, contact_name, email, phone, address,
            product_id, product_name, product_sku, quantity,
            message, delivery_requirements, notes,
            utm_source, utm_campaign, utm_medium, utm_term, utm_content, gclid, fbclid, referrer_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22)
           RETURNING *`,
          [
            isAuthenticated ? req.userId : null,
            source,
            resolvedCompanyName, resolvedContactName, resolvedEmail, resolvedPhone, resolvedAddress,
            product.id, product.name, product.sku, quantity,
            message || null, deliveryRequirements || null, notes || null,
            utm_source || null, utm_campaign || null, utm_medium || null,
            utm_term || null, utm_content || null, gclid || null, fbclid || null, referrer_url || null,
          ]
        );
        rfqs.push(insertResult.rows[0]);
      }
    });

    res.status(201).json({ rfqs, ...(errors.length > 0 ? { errors } : {}) });
  } catch (err) {
    console.error("Bulk RFQ error:", err);
    res.status(500).json({ error: "Failed to submit RFQs" });
  }
});

/* ── List RFQs (admin: all; customer: own) ── */

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin";
    const { source } = req.query;

    let whereClause = "";
    const params: any[] = [];
    let paramIdx = 1;

    if (!isAdmin) {
      whereClause = `WHERE r.user_id = $${paramIdx++}`;
      params.push(req.userId);
    } else {
      const conditions: string[] = [];
      if (source && (source === "guest" || source === "registered")) {
        conditions.push(`r.source = $${paramIdx++}`);
        params.push(source);
      }
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(" AND ")}`;
      }
    }

    const result = await query(
      `SELECT r.*, p.name as product_name, p.slug as product_slug,
              u.first_name, u.last_name, u.email as user_email, u.phone as user_phone
       FROM rfqs r
       LEFT JOIN products p ON r.product_id = p.id
       LEFT JOIN users u ON r.user_id = u.id
       ${whereClause}
       ORDER BY r.created_at DESC`,
      params
    );

    res.json({ rfqs: result.rows });
  } catch (err) {
    console.error("Get RFQs error:", err);
    res.status(500).json({ error: "Failed to fetch RFQs" });
  }
});

/* ── Get single RFQ ── */

router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT r.*, p.name as product_name, p.slug as product_slug,
              u.first_name, u.last_name, u.email as user_email, u.phone as user_phone
       FROM rfqs r
       LEFT JOIN products p ON r.product_id = p.id
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.id = $1 AND (r.user_id = $2 OR $3 = 'admin')`,
      [req.params.id, req.userId, req.userRole]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    res.json({ rfq: result.rows[0] });
  } catch (err) {
    console.error("Get RFQ error:", err);
    res.status(500).json({ error: "Failed to fetch RFQ" });
  }
});

/* ── Update RFQ status (admin) ── */

router.patch("/:id/status", authenticate, requireAdmin, validate(z.object({
  status: z.enum(["quoted", "accepted", "rejected", "pending_review"]),
  adminNotes: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { status, adminNotes } = req.body;

    const result = await query(
      `UPDATE rfqs SET status = $1, admin_notes = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, adminNotes || null, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "RFQ not found" });
    }

    res.json({ rfq: result.rows[0] });
  } catch (err) {
    console.error("Update RFQ status error:", err);
    res.status(500).json({ error: "Failed to update RFQ" });
  }
});

export default router;
