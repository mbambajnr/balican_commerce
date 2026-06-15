import { Router, Request, Response } from "express";
import multer from "multer";
import argon2 from "argon2";
import { query, transaction, TransactionClient } from "../config/db";
import { authenticate, requireAdmin, requireCompanyActive, requireCompanyAdmin, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { applyCustomPricing } from "./products";
import { notifyAndLog } from "../services/notifications";
import { revokeUserSessions } from "../services/auth-session";
import {
  parseSpreadsheet,
  SpreadsheetParseError,
  SPREADSHEET_MAX_FILE_SIZE,
} from "../services/spreadsheet";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SPREADSHEET_MAX_FILE_SIZE } });
const router = Router();

const ALLOWED_CREDIT_ROLES = ["company_admin", "finance", "buyer"];

async function resolveCompanyPricing(userId: string): Promise<{ companyId: string | null; groupId: string | null }> {
  try {
    const result = await query(
      `SELECT u.company_id, c.customer_group_id
       FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
      [userId]
    );
    if (result.rows.length === 0) return { companyId: null, groupId: null };
    return { companyId: result.rows[0].company_id, groupId: result.rows[0].customer_group_id };
  } catch {
    return { companyId: null, groupId: null };
  }
}

async function resolveUserCompany(userId: string): Promise<string | null> {
  try {
    const r = await query("SELECT company_id FROM users WHERE id = $1", [userId]);
    return r.rows.length > 0 ? r.rows[0].company_id : null;
  } catch {
    return null;
  }
}

async function enforceCompanyCredit(client: TransactionClient, companyId: string, orderTotal: number): Promise<void> {
  const companyResult = await client.query(
    `SELECT credit_status, approved_credit_limit, credit_used, next_review_at
     FROM companies WHERE id = $1 FOR UPDATE`,
    [companyId]
  );
  if (companyResult.rows.length === 0) {
    throw new Error("Company not found");
  }
  const c = companyResult.rows[0];

  if (c.credit_status !== "approved") {
    throw new Error("COMPANY_CREDIT_NOT_APPROVED");
  }

  const limit = parseFloat(c.approved_credit_limit || "0");
  const used = parseFloat(c.credit_used || "0");
  const available = limit - used;

  if (limit <= 0) {
    throw new Error("COMPANY_CREDIT_LIMIT_ZERO");
  }

  if (orderTotal > available) {
    const exc: any = new Error("COMPANY_CREDIT_INSUFFICIENT");
    exc.limit = limit;
    exc.used = used;
    exc.available = available;
    exc.orderTotal = orderTotal;
    throw exc;
  }

  if (c.next_review_at) {
    const nextReview = new Date(c.next_review_at);
    if (nextReview < new Date()) {
      throw new Error("COMPANY_CREDIT_EXPIRED");
    }
  }
}

/* ═══════════════════════════════════════════════
   Cart
   ═══════════════════════════════════════════════ */

router.get("/cart", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    let cart = await query(
      `SELECT id FROM carts WHERE user_id = $1`, [req.userId]
    );
    if (cart.rows.length === 0) {
      cart = await query(
        `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`, [req.userId]
      );
    }
    const cartId = cart.rows[0].id;
    const items = await query(
      `SELECT ci.*, p.id, p.name as product_name, p.sku, p.price, p.images, p.stock_status,
              pv.name as variant_name, pv.price as variant_price, pv.sku as variant_sku
       FROM cart_items ci
       LEFT JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at`,
      [cartId]
    );

    // Apply company pricing to cart items
    const { companyId, groupId } = await resolveCompanyPricing(req.userId!);
    // Map cart items to shape applyCustomPricing expects (needs .id)
    const itemsForPricing = items.rows.map((i: any) => ({ ...i, id: i.product_id }));
    const pricedItems = await applyCustomPricing(itemsForPricing, companyId, groupId);
    // Merge resolved prices back — use resolved price or null, never base price
    const priceById = new Map(pricedItems.map((pi: any) => [pi.product_id, pi]));
    const mergedItems = items.rows.map((item: any) => {
      const resolved = priceById.get(item.product_id);
      return {
        ...item,
        price: resolved?.price ?? null,
        custom_price: resolved?.custom_price ?? false,
      };
    });

    res.json({ cart: { id: cartId, items: mergedItems } });
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).default(1),
});

router.post("/cart/items", authenticate, requireCompanyActive, validate(addCartItemSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { productId, variantId, quantity } = req.body;
    let cart = await query(`SELECT id FROM carts WHERE user_id = $1`, [req.userId]);
    if (cart.rows.length === 0) {
      cart = await query(`INSERT INTO carts (user_id) VALUES ($1) RETURNING id`, [req.userId]);
    }
    const cartId = cart.rows[0].id;

    const existing = await query(
      `SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND (variant_id = $3 OR (variant_id IS NULL AND $3 IS NULL))`,
      [cartId, productId, variantId || null]
    );
    if (existing.rows.length > 0) {
      await query(
        `UPDATE cart_items SET quantity = quantity + $1, updated_at = NOW() WHERE id = $2`,
        [quantity, existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO cart_items (cart_id, product_id, variant_id, quantity) VALUES ($1, $2, $3, $4)`,
        [cartId, productId, variantId || null, quantity]
      );
    }
    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cartId]);

    const items = await query(
      `SELECT ci.*, p.name as product_name, p.sku, p.price, p.images
       FROM cart_items ci LEFT JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = $1`,
      [cartId]
    );
    res.json({ cart: { id: cartId, items: items.rows } });
  } catch (err) {
    console.error("Add cart item error:", err);
    res.status(500).json({ error: "Failed to add item to cart" });
  }
});

router.patch("/cart/items/:id", authenticate, requireCompanyActive, validate(z.object({ quantity: z.number().int().min(1) })), async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2 AND cart_id = (SELECT id FROM carts WHERE user_id = $3)`,
      [req.body.quantity, req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Update cart item error:", err);
    res.status(500).json({ error: "Failed to update cart item" });
  }
});

router.delete("/cart/items/:id", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    await query(
      `DELETE FROM cart_items WHERE id = $1 AND cart_id = (SELECT id FROM carts WHERE user_id = $2)`,
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Delete cart item error:", err);
    res.status(500).json({ error: "Failed to remove cart item" });
  }
});

router.post("/cart/checkout", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const { paymentMethod, poNumber, shippingMethodId, notes } = req.body;
    const validMethods = ["paystack", "bank_transfer", "credit"];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    const cart = await query(
      `SELECT ci.*, p.name as product_name, p.id, p.id as product_id, p.price, p.stock_status
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = (SELECT id FROM carts WHERE user_id = $1)`,
      [req.userId]
    );
    if (cart.rows.length === 0) return res.status(400).json({ error: "Cart is empty" });

    // Resolve company pricing for each cart item
    const { companyId, groupId } = await resolveCompanyPricing(req.userId!);
    const pricedCartItems = await applyCustomPricing(cart.rows, companyId, groupId);

    // Reject checkout if any item has no resolved customer-facing price
    const noPriceItem = pricedCartItems.find((i: any) => i.price == null);
    if (noPriceItem) {
      return res.status(400).json({
        error: `"${noPriceItem.product_name}" has no assigned price. Request a quote instead.`,
      });
    }

    const items = pricedCartItems.map((i: any) => ({
      productId: i.product_id,
      variantId: i.variant_id,
      name: i.product_name,
      price: parseFloat(i.price),
      quantity: i.quantity,
    }));
    const subtotal = items.reduce((s: number, i: any) => s + i.price * i.quantity, 0);

    const creditCompanyId = paymentMethod === "credit" ? await resolveUserCompany(req.userId!) : null;
    if (paymentMethod === "credit" && !creditCompanyId) {
      return res.status(400).json({ error: "No company associated with your account." });
    }

    await transaction(async (client) => {
      // Enforce company credit for credit payment method
      if (paymentMethod === "credit" && creditCompanyId) {
        await enforceCompanyCredit(client, creditCompanyId, subtotal);
      }

      const { utm_source, utm_campaign, utm_medium } = req.body;
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const result = await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, po_number, notes,
          utm_source, utm_campaign, utm_medium, order_source)
         VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6, $7, $8,
           $9, $10, $11, 'cart')
         RETURNING *`,
        [req.userId, orderNumber, JSON.stringify(items), subtotal, subtotal, paymentMethod, poNumber || null, notes || null,
         utm_source || null, utm_campaign || null, utm_medium || null]
      );
      const order = result.rows[0];

      // If credit order, update company credit used
      if (paymentMethod === "credit" && creditCompanyId) {
        await client.query(
          `UPDATE companies SET credit_used = credit_used + $1 WHERE id = $2`,
          [subtotal, creditCompanyId]
        );
        await client.query(
          `INSERT INTO company_credit_transactions (company_id, amount, type, reason, reference_id, reference_type,
            credit_used_before, credit_used_after, created_by)
           VALUES ($1, $2, 'credit_used', $3, $4, 'order',
             (SELECT COALESCE(credit_used, 0) - $2 FROM companies WHERE id = $1),
             (SELECT COALESCE(credit_used, 0) FROM companies WHERE id = $1), $5)`,
          [creditCompanyId, subtotal, `Order ${orderNumber} placed on credit`, order.id, req.userId]
        );
      }

      // Clear cart
      await client.query(`DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`, [req.userId]);

      res.status(201).json({ order });
    });
  } catch (err: any) {
    if (err.message === "COMPANY_CREDIT_NOT_APPROVED") {
      return res.status(400).json({ error: "Your company is not approved for credit sales." });
    }
    if (err.message === "COMPANY_CREDIT_INSUFFICIENT") {
      return res.status(400).json({
        error: "Insufficient available credit.",
        creditLimit: err.limit,
        creditUsed: err.used,
        availableCredit: err.available,
        orderTotal: err.orderTotal,
      });
    }
    if (err.message === "COMPANY_CREDIT_LIMIT_ZERO") {
      return res.status(400).json({ error: "Your company credit limit has not been set." });
    }
    if (err.message === "COMPANY_CREDIT_EXPIRED") {
      return res.status(400).json({ error: "Your company credit facility has expired. Please contact our sales team." });
    }
    console.error("Cart checkout error:", err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

/* ═══════════════════════════════════════════════
   Quick Order — by SKU
   ═══════════════════════════════════════════════ */

router.post("/quick-order", authenticate, requireCompanyActive, validate(z.object({
  items: z.array(z.object({
    sku: z.string().min(1),
    quantity: z.number().int().min(1),
  })).min(1),
  paymentMethod: z.enum(["paystack", "bank_transfer", "credit"]),
  poNumber: z.string().optional(),
  notes: z.string().optional(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { items: skuItems, paymentMethod, poNumber, notes, utm_source, utm_campaign, utm_medium } = req.body;

    const skus = skuItems.map((i: any) => i.sku);
    const products = await query(
      `SELECT id, name, sku, price, stock_status FROM products WHERE sku = ANY($1) AND is_active = true`,
      [skus]
    );
    const productMap = new Map(products.rows.map((p: any) => [p.sku, p]));

    const matchedProducts: any[] = [];
    const errors: { sku: string; message: string }[] = [];

    for (const item of skuItems) {
      const product = productMap.get(item.sku);
      if (!product) {
        errors.push({ sku: item.sku, message: "Product not found or inactive" });
        continue;
      }
      if (product.stock_status === "out_of_stock") {
        errors.push({ sku: item.sku, message: "Out of stock" });
        continue;
      }
      matchedProducts.push({ ...product, quantity: item.quantity });
    }

    if (matchedProducts.length === 0) {
      return res.status(400).json({ error: "No valid items found", errors });
    }

    // Resolve company pricing
    const { companyId, groupId } = await resolveCompanyPricing(req.userId!);
    const pricedProducts = await applyCustomPricing(matchedProducts, companyId, groupId);

    const noPriceItem = pricedProducts.find((p: any) => p.price == null);
    if (noPriceItem) {
      return res.status(400).json({
        error: `"${noPriceItem.name}" has no assigned price. Request a quote instead.`,
        errors,
      });
    }

    const orderItems = pricedProducts.map((p: any) => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      quantity: p.quantity,
    }));

    const subtotal = orderItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const orderNumber = `QO-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (paymentMethod === "credit") {
      // Credit orders need transactional enforcement
      const creditCompanyId = await resolveUserCompany(req.userId!);
      if (!creditCompanyId) {
        return res.status(400).json({ error: "No company associated with your account.", errors });
      }
      await transaction(async (client) => {
        await enforceCompanyCredit(client, creditCompanyId, subtotal);
        const ordResult = await client.query(
          `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, po_number, notes,
            utm_source, utm_campaign, utm_medium, order_source)
           VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6, $7, $8,
             $9, $10, $11, 'quick_order')
           RETURNING *`,
          [req.userId, orderNumber, JSON.stringify(orderItems), subtotal, subtotal, paymentMethod, poNumber || null, notes || null,
           utm_source || null, utm_campaign || null, utm_medium || null]
        );
        await client.query(
          `UPDATE companies SET credit_used = credit_used + $1 WHERE id = $2`,
          [subtotal, creditCompanyId]
        );
        await client.query(
          `INSERT INTO company_credit_transactions (company_id, amount, type, reason, reference_id, reference_type,
            credit_used_before, credit_used_after, created_by)
           VALUES ($1, $2, 'credit_used', $3, $4, 'order',
             (SELECT COALESCE(credit_used, 0) - $2 FROM companies WHERE id = $1),
             (SELECT COALESCE(credit_used, 0) FROM companies WHERE id = $1), $5)`,
          [creditCompanyId, subtotal, `Quick order ${orderNumber} placed on credit`, ordResult.rows[0].id, req.userId]
        );
        await client.query(
          `INSERT INTO quick_orders (user_id, source, items, status) VALUES ($1, 'manual', $2, 'completed')`,
          [req.userId, JSON.stringify(skuItems)]
        );
        res.status(201).json({ order: ordResult.rows[0], errors: errors.length > 0 ? errors : undefined });
      });
      return;
    }

    const order = await query(
      `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, po_number, notes,
        utm_source, utm_campaign, utm_medium, order_source)
       VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6, $7, $8,
         $9, $10, $11, 'quick_order')
       RETURNING *`,
      [req.userId, orderNumber, JSON.stringify(orderItems), subtotal, subtotal, paymentMethod, poNumber || null, notes || null,
       utm_source || null, utm_campaign || null, utm_medium || null]
    );

    await query(
      `INSERT INTO quick_orders (user_id, source, items, status) VALUES ($1, 'manual', $2, 'completed')`,
      [req.userId, JSON.stringify(skuItems)]
    );

    res.status(201).json({ order: order.rows[0], errors: errors.length > 0 ? errors : undefined });
  } catch (err: any) {
    if (err.message === "COMPANY_CREDIT_NOT_APPROVED") {
      return res.status(400).json({ error: "Your company is not approved for credit sales." });
    }
    if (err.message === "COMPANY_CREDIT_INSUFFICIENT") {
      return res.status(400).json({
        error: "Insufficient available credit.",
        creditLimit: err.limit, creditUsed: err.used, availableCredit: err.available, orderTotal: err.orderTotal,
      });
    }
    if (err.message === "COMPANY_CREDIT_LIMIT_ZERO") {
      return res.status(400).json({ error: "Your company credit limit has not been set." });
    }
    if (err.message === "COMPANY_CREDIT_EXPIRED") {
      return res.status(400).json({ error: "Your company credit facility has expired. Please contact our sales team." });
    }
    console.error("Quick order error:", err);
    res.status(500).json({ error: "Failed to create quick order" });
  }
});

/* ═══════════════════════════════════════════════
   Quick Order — CSV Upload
   ═══════════════════════════════════════════════ */

router.post("/quick-order/csv", authenticate, requireCompanyActive, upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const rows = await parseSpreadsheet(file);

    if (rows.length === 0) return res.status(400).json({ error: "File is empty" });

    const matchedProducts: any[] = [];
    const errors: { row: number; sku: string; message: string }[] = [];
    const paymentMethod = (req.body.paymentMethod as string) || "bank_transfer";
    const utm_source = req.body.utm_source || null;
    const utm_campaign = req.body.utm_campaign || null;
    const utm_medium = req.body.utm_medium || null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const sku = (row["sku"] || row["SKU"] || "").toString().trim();
      if (!sku) { errors.push({ row: rowNum, sku: "", message: "Missing SKU" }); continue; }

      const qtyRaw = row["quantity"] || row["Quantity"] || row["qty"] || "1";
      const quantity = parseInt(qtyRaw);
      if (isNaN(quantity) || quantity < 1) { errors.push({ row: rowNum, sku, message: `Invalid quantity: ${qtyRaw}` }); continue; }

      const product = await query(
        `SELECT id, name, sku, price, stock_status FROM products WHERE sku = $1 AND is_active = true`,
        [sku]
      );
      if (product.rows.length === 0) { errors.push({ row: rowNum, sku, message: "Product not found" }); continue; }
      if (product.rows[0].stock_status === "out_of_stock") { errors.push({ row: rowNum, sku, message: "Out of stock" }); continue; }

      matchedProducts.push({ ...product.rows[0], quantity });
    }

    if (matchedProducts.length === 0) {
      return res.status(400).json({ error: "No valid items found", errors });
    }

    // Resolve company pricing
    const { companyId, groupId } = await resolveCompanyPricing(req.userId!);
    const pricedProducts = await applyCustomPricing(matchedProducts, companyId, groupId);

    const noPriceItem = pricedProducts.find((p: any) => p.price == null);
    if (noPriceItem) {
      return res.status(400).json({
        error: `"${noPriceItem.name}" has no assigned price. Request a quote instead.`,
        errors,
      });
    }

    const orderItems = pricedProducts.map((p: any) => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      quantity: p.quantity,
    }));

    const subtotal = orderItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const orderNumber = `QO-CSV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    if (paymentMethod === "credit") {
      const creditCompanyId = await resolveUserCompany(req.userId!);
      if (!creditCompanyId) {
        return res.status(400).json({ error: "No company associated with your account.", errors });
      }
      await transaction(async (client) => {
        await enforceCompanyCredit(client, creditCompanyId, subtotal);
        const ordResult = await client.query(
          `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method,
            utm_source, utm_campaign, utm_medium, order_source)
           VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6,
             $7, $8, $9, 'quick_order')
           RETURNING *`,
          [req.userId, orderNumber, JSON.stringify(orderItems), subtotal, subtotal, paymentMethod,
           utm_source, utm_campaign, utm_medium]
        );
        await client.query(
          `UPDATE companies SET credit_used = credit_used + $1 WHERE id = $2`,
          [subtotal, creditCompanyId]
        );
        await client.query(
          `INSERT INTO company_credit_transactions (company_id, amount, type, reason, reference_id, reference_type,
            credit_used_before, credit_used_after, created_by)
           VALUES ($1, $2, 'credit_used', $3, $4, 'order',
             (SELECT COALESCE(credit_used, 0) - $2 FROM companies WHERE id = $1),
             (SELECT COALESCE(credit_used, 0) FROM companies WHERE id = $1), $5)`,
          [creditCompanyId, subtotal, `CSV quick order ${orderNumber} placed on credit`, ordResult.rows[0].id, req.userId]
        );
        await client.query(
          `INSERT INTO quick_orders (user_id, source, items, status) VALUES ($1, 'csv', $2, 'completed')`,
          [req.userId, JSON.stringify(orderItems)]
        );
        res.status(201).json({ order: ordResult.rows[0], errors: errors.length > 0 ? errors : undefined });
      });
      return;
    }

    const order = await query(
      `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method,
        utm_source, utm_campaign, utm_medium, order_source)
       VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6,
         $7, $8, $9, 'quick_order')
       RETURNING *`,
      [req.userId, orderNumber, JSON.stringify(orderItems), subtotal, subtotal, paymentMethod,
       utm_source, utm_campaign, utm_medium]
    );

    await query(
      `INSERT INTO quick_orders (user_id, source, items, status) VALUES ($1, 'csv', $2, 'completed')`,
      [req.userId, JSON.stringify(orderItems)]
    );

    res.status(201).json({ order: order.rows[0], errors: errors.length > 0 ? errors : undefined });
  } catch (err: any) {
    if (err instanceof SpreadsheetParseError || err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message === "COMPANY_CREDIT_NOT_APPROVED") {
      return res.status(400).json({ error: "Your company is not approved for credit sales." });
    }
    if (err.message === "COMPANY_CREDIT_INSUFFICIENT") {
      return res.status(400).json({
        error: "Insufficient available credit.",
        creditLimit: err.limit, creditUsed: err.used, availableCredit: err.available, orderTotal: err.orderTotal,
      });
    }
    if (err.message === "COMPANY_CREDIT_LIMIT_ZERO") {
      return res.status(400).json({ error: "Your company credit limit has not been set." });
    }
    if (err.message === "COMPANY_CREDIT_EXPIRED") {
      return res.status(400).json({ error: "Your company credit facility has expired. Please contact our sales team." });
    }
    console.error("CSV quick order error:", err);
    res.status(500).json({ error: "CSV quick order failed" });
  }
});

/* ═══════════════════════════════════════════════
   Reorder — from previous order
   ═══════════════════════════════════════════════ */

router.post("/reorder/:orderId", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const order = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.orderId, req.userId]
    );
    if (order.rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const originalItems = typeof order.rows[0].items === "string"
      ? JSON.parse(order.rows[0].items) : order.rows[0].items;

    const productIds = originalItems.map((i: any) => i.productId).filter(Boolean);
    const products = productIds.length > 0
      ? await query(`SELECT id, price, stock_status FROM products WHERE id = ANY($1)`, [productIds])
      : { rows: [] };

    // Resolve company pricing
    const { companyId, groupId } = await resolveCompanyPricing(req.userId!);
    const pricedProducts = await applyCustomPricing(products.rows, companyId, groupId);
    const priceMap = new Map(pricedProducts.map((p: any) => [p.id, p]));

    const items = originalItems.map((i: any) => {
      const current = priceMap.get(i.productId);
      const currentPrice = current?.price != null ? parseFloat(current.price) : null;
      // Reject if no current price found (product may have been discontinued or has no custom pricing)
      if (currentPrice == null) {
        throw new Error(`"${i.name}" has no assigned price. Request a quote instead.`);
      }
      return {
        productId: i.productId,
        name: i.name,
        price: currentPrice,
        quantity: i.quantity,
      };
    });

    const subtotal = items.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const orderNumber = `RE-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const result = await query(
      `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, order_source)
       VALUES ($1, $2, $3, $4, 0, $5, 'pending', $6, 'reorder') RETURNING *`,
      [req.userId, orderNumber, JSON.stringify(items), subtotal, subtotal, "bank_transfer"]
    );

    res.status(201).json({ order: result.rows[0] });
  } catch (err) {
    console.error("Reorder error:", err);
    res.status(500).json({ error: "Reorder failed" });
  }
});

/* ═══════════════════════════════════════════════
   Store Credit — Admin
   ═══════════════════════════════════════════════ */

router.get("/admin/store-credit/:userId", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT id, email, first_name, last_name, store_credit FROM users WHERE id = $1`,
      [req.params.userId]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const transactions = await query(
      `SELECT * FROM store_credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.userId]
    );

    res.json({ user: user.rows[0], transactions: transactions.rows });
  } catch (err) {
    console.error("Get store credit error:", err);
    res.status(500).json({ error: "Failed to fetch store credit" });
  }
});

const adjustStoreCreditSchema = z.object({
  amount: z.number(),
  reason: z.string().min(1),
});

router.post("/admin/store-credit/:userId/adjust", authenticate, requireAdmin, validate(adjustStoreCreditSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, reason } = req.body;

    await transaction(async (client) => {
      const user = await client.query(
        `SELECT id, store_credit FROM users WHERE id = $1 FOR UPDATE`,
        [req.params.userId]
      );
      if (user.rows.length === 0) throw { status: 404, message: "User not found" };

      const currentBalance = parseFloat(user.rows[0].store_credit);
      const newBalance = currentBalance + amount;
      if (newBalance < 0) throw { status: 400, message: "Insufficient store credit" };

      await client.query(
        `UPDATE users SET store_credit = $1 WHERE id = $2`,
        [newBalance, req.params.userId]
      );
      await client.query(
        `INSERT INTO store_credit_transactions (user_id, amount, type, reason, balance_before, balance_after, created_by)
         VALUES ($1, $2, 'adjustment', $3, $4, $5, $6)`,
        [req.params.userId, amount, reason, currentBalance, newBalance, req.userId]
      );
    });

    const updated = await query(`SELECT id, store_credit FROM users WHERE id = $1`, [req.params.userId]);
    res.json({ user: updated.rows[0] });
  } catch (err: any) {
    console.error("Adjust store credit error:", err);
    res.status(err.status || 500).json({ error: err.message || "Failed to adjust store credit" });
  }
});

/* ═══════════════════════════════════════════════
   Store Credit — Customer
   ═══════════════════════════════════════════════ */

router.get("/store-credit", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT id, store_credit FROM users WHERE id = $1`,
      [req.userId]
    );
    const transactions = await query(
      `SELECT * FROM store_credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );
    res.json({ balance: parseFloat(user.rows[0].store_credit), transactions: transactions.rows });
  } catch (err) {
    console.error("Get store credit error:", err);
    res.status(500).json({ error: "Failed to fetch store credit" });
  }
});

/* ═══════════════════════════════════════════════
   Payment Methods per Company — Admin
   ═══════════════════════════════════════════════ */

router.get("/admin/company-payment-methods", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;
    const params: any[] = [];
    const conds: string[] = [];
    if (companyId) { conds.push(`(cpm.company_id = $${params.length + 1} OR cpm.company_id IS NULL)`); params.push(companyId); }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const result = await query(
      `SELECT cpm.*, c.name as company_name FROM company_payment_methods cpm LEFT JOIN companies c ON cpm.company_id = c.id ${where} ORDER BY cpm.company_id, cpm.method`,
      params
    );
    res.json({ paymentMethods: result.rows });
  } catch (err) {
    console.error("Get company payment methods error:", err);
    res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});

router.post("/admin/company-payment-methods", authenticate, requireAdmin, validate(z.object({
  companyId: z.string().uuid().optional(),
  customerGroupId: z.string().uuid().optional(),
  method: z.string().min(1),
  enabled: z.boolean().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, customerGroupId, method, enabled } = req.body;
    if (!companyId && !customerGroupId) return res.status(400).json({ error: "companyId or customerGroupId required" });
    const result = await query(
      `INSERT INTO company_payment_methods (company_id, customer_group_id, method, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (company_id, method) DO UPDATE SET enabled = $4
       RETURNING *`,
      [companyId || null, customerGroupId || null, method, enabled !== false]
    );
    res.status(201).json({ paymentMethod: result.rows[0] });
  } catch (err) {
    console.error("Set payment method error:", err);
    res.status(500).json({ error: "Failed to set payment method" });
  }
});

/* ═══════════════════════════════════════════════
   Payment Methods — Customer (get available)
   ═══════════════════════════════════════════════ */

router.get("/payment-methods", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT u.company_id, c.customer_group_id
       FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
      [req.userId]
    );
    const companyId = user.rows[0]?.company_id;
    const groupId = user.rows[0]?.customer_group_id;

    const defaults = ["paystack", "bank_transfer", "credit"];

    if (!companyId && !groupId) {
      return res.json({ methods: defaults });
    }

    // Check if company/group has any explicit method configurations
    const explicitConfigs = await query(
      `SELECT method, enabled FROM company_payment_methods
       WHERE (company_id = $1 OR (company_id IS NULL AND customer_group_id = $2))`,
      [companyId, groupId]
    );

    if (explicitConfigs.rows.length > 0) {
      const configMap = new Map(explicitConfigs.rows.map((r: any) => [r.method, r.enabled]));
      // Return only defaults that are explicitly enabled, plus any that are not configured (still allowed)
      const configuredMethods = new Set(explicitConfigs.rows.map((r: any) => r.method));
      const methods = defaults.filter((m) => !configuredMethods.has(m) || configMap.get(m) === true);
      return res.json({ methods });
    }

    res.json({ methods: defaults });
  } catch (err) {
    console.error("Get payment methods error:", err);
    res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});

/* ═══════════════════════════════════════════════
   Shipping Methods — Admin CRUD
   ═══════════════════════════════════════════════ */

router.get("/admin/shipping-methods", authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await query("SELECT * FROM shipping_methods ORDER BY name");
    res.json({ shippingMethods: result.rows });
  } catch (err) {
    console.error("Get shipping methods error:", err);
    res.status(500).json({ error: "Failed to fetch shipping methods" });
  }
});

router.post("/admin/shipping-methods", authenticate, requireAdmin, validate(z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  baseRate: z.number().min(0),
  ratePerKg: z.number().min(0).optional(),
  estimatedDaysMin: z.number().int().min(0).optional(),
  estimatedDaysMax: z.number().int().min(0).optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, description, baseRate, ratePerKg, estimatedDaysMin, estimatedDaysMax } = req.body;
    const result = await query(
      `INSERT INTO shipping_methods (name, code, description, base_rate, rate_per_kg, estimated_days_min, estimated_days_max)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, code, description || null, baseRate, ratePerKg || 0, estimatedDaysMin || 1, estimatedDaysMax || 10]
    );
    res.status(201).json({ shippingMethod: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "Shipping method code already exists" });
    console.error("Create shipping method error:", err);
    res.status(500).json({ error: "Failed to create shipping method" });
  }
});

router.patch("/admin/shipping-methods/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of ["name", "code", "description", "base_rate", "rate_per_kg", "estimated_days_min", "estimated_days_max", "is_active"]) {
      if (req.body[key] !== undefined) { fields.push(`${key} = $${idx++}`); values.push(req.body[key]); }
    }
    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(req.params.id);
    const result = await query(
      `UPDATE shipping_methods SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Shipping method not found" });
    res.json({ shippingMethod: result.rows[0] });
  } catch (err) {
    console.error("Update shipping method error:", err);
    res.status(500).json({ error: "Failed to update shipping method" });
  }
});

/* ═══════════════════════════════════════════════
   Company Shipping Assignment
   ═══════════════════════════════════════════════ */

router.post("/admin/company-shipping-methods", authenticate, requireAdmin, validate(z.object({
  companyId: z.string().uuid().optional(),
  customerGroupId: z.string().uuid().optional(),
  shippingMethodId: z.string().uuid(),
  customRate: z.number().min(0).optional(),
  isEnabled: z.boolean().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, customerGroupId, shippingMethodId, customRate, isEnabled } = req.body;
    const result = await query(
      `INSERT INTO company_shipping_methods (company_id, customer_group_id, shipping_method_id, custom_rate, is_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, shipping_method_id) DO UPDATE SET custom_rate = $4, is_enabled = $5
       RETURNING *`,
      [companyId || null, customerGroupId || null, shippingMethodId, customRate || null, isEnabled !== false]
    );
    res.status(201).json({ companyShipping: result.rows[0] });
  } catch (err) {
    console.error("Assign shipping method error:", err);
    res.status(500).json({ error: "Failed to assign shipping method" });
  }
});

/* ═══════════════════════════════════════════════
   Shipping Methods — Customer (get available)
   ═══════════════════════════════════════════════ */

router.get("/shipping-methods", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT u.company_id, c.customer_group_id
       FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
      [req.userId]
    );
    const companyId = user.rows[0]?.company_id;
    const groupId = user.rows[0]?.customer_group_id;

    const result = await query(
      `SELECT sm.*, csm.custom_rate
       FROM shipping_methods sm
       LEFT JOIN company_shipping_methods csm ON sm.id = csm.shipping_method_id
         AND (csm.company_id = $1 OR (csm.company_id IS NULL AND csm.customer_group_id = $2))
       WHERE sm.is_active = true
         AND (csm.is_enabled IS NULL OR csm.is_enabled = true)
       ORDER BY sm.name`,
      [companyId, groupId]
    );

    res.json({ shippingMethods: result.rows });
  } catch (err) {
    console.error("Get shipping methods error:", err);
    res.status(500).json({ error: "Failed to fetch shipping methods" });
  }
});

/* ═══════════════════════════════════════════════
   Product Variants — Admin
   ═══════════════════════════════════════════════ */

router.get("/admin/variants/:productId", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sort_order, name`,
      [req.params.productId]
    );
    res.json({ variants: result.rows });
  } catch (err) {
    console.error("Get variants error:", err);
    res.status(500).json({ error: "Failed to fetch variants" });
  }
});

const variantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive().optional(),
  stockStatus: z.string().optional(),
  optionValues: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  sortOrder: z.number().int().optional(),
});

router.post("/admin/variants/:productId", authenticate, requireAdmin, validate(variantSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { sku, name, price, stockStatus, optionValues, sortOrder } = req.body;
    const result = await query(
      `INSERT INTO product_variants (product_id, sku, name, price, stock_status, option_values, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.productId, sku, name, price || null, stockStatus || "in_stock", JSON.stringify(optionValues || []), sortOrder || 0]
    );
    res.status(201).json({ variant: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "SKU already exists" });
    console.error("Create variant error:", err);
    res.status(500).json({ error: "Failed to create variant" });
  }
});

router.patch("/admin/variants/:productId/:variantId", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries({ sku: "sku", name: "name", price: "price", stockStatus: "stock_status", sortOrder: "sort_order", isActive: "is_active" })) {
      if ((req.body as any)[key] !== undefined) { fields.push(`${col} = $${idx++}`); values.push((req.body as any)[key]); }
    }
    if (req.body.optionValues) { fields.push(`option_values = $${idx++}`); values.push(JSON.stringify(req.body.optionValues)); }
    if (fields.length === 0) return res.status(400).json({ error: "No fields" });
    values.push(req.params.variantId);
    const result = await query(
      `UPDATE product_variants SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Variant not found" });
    res.json({ variant: result.rows[0] });
  } catch (err) {
    console.error("Update variant error:", err);
    res.status(500).json({ error: "Failed to update variant" });
  }
});

router.delete("/admin/variants/:productId/:variantId", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await query("DELETE FROM product_variants WHERE id = $1", [req.params.variantId]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete variant error:", err);
    res.status(500).json({ error: "Failed to delete variant" });
  }
});

/* ═══════════════════════════════════════════════
   Option Types — Admin
   ═══════════════════════════════════════════════ */

router.get("/admin/option-types", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const types = await query("SELECT * FROM option_types ORDER BY sort_order, name");
    const values = await query("SELECT * FROM option_values ORDER BY option_type_id, sort_order, name");
    const valuesByType = new Map<string, any[]>();
    values.rows.forEach((v: any) => {
      if (!valuesByType.has(v.option_type_id)) valuesByType.set(v.option_type_id, []);
      valuesByType.get(v.option_type_id)!.push(v);
    });
    const result = types.rows.map((t: any) => ({ ...t, values: valuesByType.get(t.id) || [] }));
    res.json({ optionTypes: result });
  } catch (err) {
    console.error("Get option types error:", err);
    res.status(500).json({ error: "Failed to fetch option types" });
  }
});

router.post("/admin/option-types", authenticate, requireAdmin, validate(z.object({ name: z.string().min(1), presentation: z.string().optional(), sortOrder: z.number().int().optional() })), async (req: AuthRequest, res: Response) => {
  try {
    const { name, presentation, sortOrder } = req.body;
    const result = await query(
      `INSERT INTO option_types (name, presentation, sort_order) VALUES ($1, $2, $3) RETURNING *`,
      [name, presentation || name, sortOrder || 0]
    );
    res.status(201).json({ optionType: result.rows[0] });
  } catch (err) {
    console.error("Create option type error:", err);
    res.status(500).json({ error: "Failed to create option type" });
  }
});

router.post("/admin/option-values", authenticate, requireAdmin, validate(z.object({ optionTypeId: z.string().uuid(), name: z.string().min(1), presentation: z.string().optional(), sortOrder: z.number().int().optional() })), async (req: AuthRequest, res: Response) => {
  try {
    const { optionTypeId, name, presentation, sortOrder } = req.body;
    const result = await query(
      `INSERT INTO option_values (option_type_id, name, presentation, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [optionTypeId, name, presentation || name, sortOrder || 0]
    );
    res.status(201).json({ optionValue: result.rows[0] });
  } catch (err) {
    console.error("Create option value error:", err);
    res.status(500).json({ error: "Failed to create option value" });
  }
});

/* ═══════════════════════════════════════════════
   Company Dashboard
   ═══════════════════════════════════════════════ */

router.get("/company/dashboard", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.company_id, u.company_role,
              u.account_status, u.company_name, u.store_credit, u.credit_limit, u.outstanding_balance,
              c.name, c.status as company_status, c.email as company_email, c.phone as company_phone,
              c.address, c.city, c.state, c.country, c.tax_id, c.business_registration_number,
              c.contact_person_name, c.contact_person_email, c.contact_person_phone,
              c.customer_group_id, c.assigned_sales_rep_id, c.rejection_reason,
              c.credit_status, c.requested_credit_limit, c.approved_credit_limit, c.credit_used,
              c.credit_risk_rating, c.credit_rejection_reason as credit_rejection_reason,
              c.credit_review_notes, c.credit_approved_at, c.next_review_at,
              c.finance_contact_name, c.finance_contact_email, c.finance_contact_phone,
              sr.first_name as rep_first_name, sr.last_name as rep_last_name, sr.email as rep_email, sr.phone as rep_phone
       FROM users u
       LEFT JOIN companies c ON u.company_id = c.id
       LEFT JOIN users sr ON c.assigned_sales_rep_id = sr.id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const row = result.rows[0];
    const companyId = row.company_id;

    let stats = { ordersCount: 0, rfqsCount: 0, procurementListsCount: 0, teamMembersCount: 0 };

    if (companyId) {
      const [ordersRes, rfqsRes, procurementRes, teamRes] = await Promise.all([
        query("SELECT COUNT(*) as count FROM orders WHERE user_id = $1", [req.userId]),
        query("SELECT COUNT(*) as count FROM rfqs WHERE user_id = $1", [req.userId]),
        query("SELECT COUNT(*) as count FROM procurement_lists WHERE company_id = $1", [companyId]),
        query("SELECT COUNT(*) as count FROM users WHERE company_id = $1", [companyId]),
      ]);
      stats = {
        ordersCount: parseInt(ordersRes.rows[0].count) || 0,
        rfqsCount: parseInt(rfqsRes.rows[0].count) || 0,
        procurementListsCount: parseInt(procurementRes.rows[0].count) || 0,
        teamMembersCount: parseInt(teamRes.rows[0].count) || 0,
      };
    }

    let paymentMethods: string[] = [];
    let shippingMethods: any[] = [];
    let procurementLists: any[] = [];

    if (companyId) {
      const groupId = row.customer_group_id;
      const [pmRes, smRes, plRes] = await Promise.all([
        query(
          `SELECT method FROM company_payment_methods WHERE (company_id = $1 OR customer_group_id = $2) AND enabled = true`,
          [companyId, groupId]
        ),
        query(
          `SELECT sm.name, sm.code, sm.base_rate, sm.rate_per_kg, sm.estimated_days_min, sm.estimated_days_max, csm.custom_rate
           FROM shipping_methods sm
           INNER JOIN company_shipping_methods csm ON sm.id = csm.shipping_method_id
           WHERE (csm.company_id = $1 OR csm.customer_group_id = $2) AND csm.is_enabled = true`,
          [companyId, groupId]
        ),
        companyId ? query("SELECT id, name, created_at FROM procurement_lists WHERE company_id = $1 ORDER BY created_at DESC LIMIT 5", [companyId]) : Promise.resolve({ rows: [] }),
      ]);
      paymentMethods = pmRes.rows.map((r: any) => r.method);
      shippingMethods = smRes.rows;
      procurementLists = plRes.rows;
    }

    const company = companyId ? {
      id: companyId,
      name: row.name,
      status: row.company_status,
      email: row.company_email,
      phone: row.company_phone,
      address: row.address ? `${row.address}${row.city ? `, ${row.city}` : ""}${row.state ? `, ${row.state}` : ""}` : null,
      taxId: row.tax_id,
      regNumber: row.business_registration_number,
      contactPerson: row.contact_person_name ? {
        name: row.contact_person_name,
        email: row.contact_person_email,
        phone: row.contact_person_phone,
      } : null,
      rejectionReason: row.rejection_reason,
    } : null;

    const salesRep = row.assigned_sales_rep_id ? {
      name: `${row.rep_first_name || ""} ${row.rep_last_name || ""}`.trim() || null,
      email: row.rep_email,
      phone: row.rep_phone,
    } : null;

    const companyCredit = companyId ? {
      creditStatus: row.credit_status || "not_requested",
      requestedCreditLimit: row.requested_credit_limit ? parseFloat(row.requested_credit_limit) : null,
      approvedCreditLimit: row.approved_credit_limit ? parseFloat(row.approved_credit_limit) : 0,
      creditUsed: row.credit_used ? parseFloat(row.credit_used) : 0,
      availableCredit: row.approved_credit_limit ? parseFloat(row.approved_credit_limit) - parseFloat(row.credit_used || "0") : 0,
      creditRiskRating: row.credit_risk_rating,
      creditRejectionReason: row.credit_rejection_reason,
      creditApprovedAt: row.credit_approved_at,
      nextReviewAt: row.next_review_at,
      financeContactName: row.finance_contact_name,
      financeContactEmail: row.finance_contact_email,
      financeContactPhone: row.finance_contact_phone,
    } : null;

    res.json({
      user: {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        companyRole: row.company_role,
        accountStatus: row.account_status,
        companyName: row.company_name,
      },
      company,
      salesRep,
      storeCredit: { balance: row.store_credit || 0 },
      creditLimit: { limit: row.credit_limit || 0, outstanding: row.outstanding_balance || 0 },
      companyCredit,
      paymentMethods,
      shippingMethods,
      procurementLists,
      stats,
      onboarding: { needsOnboarding: stats.rfqsCount === 0 && stats.ordersCount === 0 },
    });
  } catch (err) {
    console.error("Company dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

/* ═══════════════════════════════════════════════
   Team Members / Sub-Users
   ═══════════════════════════════════════════════ */

// List team members within the user's company
router.get("/company/team", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id, company_role FROM users WHERE id = $1", [req.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const { company_id, company_role } = userResult.rows[0];
    if (!company_id) return res.json({ team: [] });

    const team = await query(
      `SELECT id, email, first_name, last_name, phone, role, company_role, account_status, created_at
       FROM users WHERE company_id = $1 ORDER BY created_at DESC`,
      [company_id]
    );

    res.json({ team: team.rows, canManage: company_role === "company_admin" });
  } catch (err) {
    console.error("List team error:", err);
    res.status(500).json({ error: "Failed to list team members" });
  }
});

// Create sub-user (company_admin only)
const createTeamMemberSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  companyRole: z.enum(["company_admin", "buyer", "finance", "viewer"]),
});

router.post("/company/team", authenticate, requireCompanyActive, requireCompanyAdmin, validate(createTeamMemberSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id, company_name FROM users WHERE id = $1", [req.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const { company_id, company_name } = userResult.rows[0];
    if (!company_id) return res.status(400).json({ error: "No company associated with your account" });

    const { email, password, firstName, lastName, phone, companyRole } = req.body;

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role,
        company_id, company_role, account_status, company_name)
       VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7, 'active', $8)
       RETURNING id, email, first_name, last_name, phone, role, company_role, account_status`,
      [email, passwordHash, firstName, lastName, phone || null,
       company_id, companyRole, company_name]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error("Create team member error:", err);
    res.status(500).json({ error: "Failed to create team member" });
  }
});

// Update sub-user role or status (company_admin only)
const updateTeamMemberSchema = z.object({
  companyRole: z.enum(["company_admin", "buyer", "finance", "viewer"]).optional(),
  accountStatus: z.enum(["active", "suspended"]).optional(),
});

router.patch("/company/team/:userId", authenticate, requireCompanyActive, requireCompanyAdmin, validate(updateTeamMemberSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const adminCompanyId = userResult.rows[0].company_id;
    if (!adminCompanyId) return res.status(400).json({ error: "No company associated with your account" });

    const { userId } = req.params;
    const targetUser = await query("SELECT id, company_id FROM users WHERE id = $1", [userId]);
    if (targetUser.rows.length === 0) return res.status(404).json({ error: "Team member not found" });
    if (targetUser.rows[0].company_id !== adminCompanyId) {
      return res.status(403).json({ error: "Cannot manage users outside your company" });
    }

    const { companyRole, accountStatus } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (companyRole) {
      updates.push("company_role = $" + (values.length + 1));
      values.push(companyRole);
    }
    if (accountStatus) {
      updates.push("account_status = $" + (values.length + 1));
      values.push(accountStatus);
    }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING id, email, first_name, last_name, phone, role, company_role, account_status`,
      values
    );
    await revokeUserSessions(userId);

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error("Update team member error:", err);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

/* ═══════════════════════════════════════════════
   Company Credit Application & Status
   ═══════════════════════════════════════════════ */

const applyCreditSchema = z.object({
  requestedCreditLimit: z.number().min(1),
  preferredPaymentTerms: z.string().max(100).optional(),
  financeContactName: z.string().max(200).optional(),
  financeContactEmail: z.string().email().optional().or(z.literal("")),
  financeContactPhone: z.string().max(50).optional(),
  supportingNotes: z.string().max(2000).optional(),
});

// GET /company/credit — View company credit status
router.get("/company/credit", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req.userId!);
    if (!companyId) return res.status(400).json({ error: "No company associated with your account." });

    const result = await query(
      `SELECT credit_status, requested_credit_limit, approved_credit_limit, credit_used,
              credit_risk_rating, credit_rejection_reason, credit_review_notes,
              credit_approved_at, credit_reviewed_at, next_review_at,
              finance_contact_name, finance_contact_email, finance_contact_phone,
              credit_application_notes
       FROM companies WHERE id = $1`,
      [companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const c = result.rows[0];
    res.json({
      creditStatus: c.credit_status,
      requestedCreditLimit: c.requested_credit_limit ? parseFloat(c.requested_credit_limit) : null,
      approvedCreditLimit: c.approved_credit_limit ? parseFloat(c.approved_credit_limit) : 0,
      creditUsed: c.credit_used ? parseFloat(c.credit_used) : 0,
      availableCredit: c.approved_credit_limit ? Math.max(0, parseFloat(c.approved_credit_limit) - parseFloat(c.credit_used || "0")) : 0,
      creditRiskRating: c.credit_risk_rating,
      creditRejectionReason: c.credit_rejection_reason,
      creditReviewNotes: null, // Never expose internal notes to company users
      creditApprovedAt: c.credit_approved_at,
      nextReviewAt: c.next_review_at,
      financeContactName: c.finance_contact_name,
      financeContactEmail: c.finance_contact_email,
      financeContactPhone: c.finance_contact_phone,
    });
  } catch (err) {
    console.error("Get credit status error:", err);
    res.status(500).json({ error: "Failed to load credit status" });
  }
});

// POST /company/credit/apply — Submit credit application
router.post("/company/credit/apply", authenticate, requireCompanyActive, validate(applyCreditSchema), async (req: AuthRequest, res: Response) => {
  try {
    const companyId = await resolveUserCompany(req.userId!);
    if (!companyId) return res.status(400).json({ error: "No company associated with your account." });

    // Check allowed roles
    const userResult = await query("SELECT company_role FROM users WHERE id = $1", [req.userId]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
    if (!ALLOWED_CREDIT_ROLES.includes(userResult.rows[0].company_role)) {
      return res.status(403).json({ error: "Only company admins, finance, and buyers can apply for credit." });
    }

    // Check company is active
    const companyResult = await query("SELECT status, credit_status FROM companies WHERE id = $1", [companyId]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });
    if (companyResult.rows[0].status !== "active") {
      return res.status(400).json({ error: "Company must be active to apply for credit." });
    }

    const currentStatus = companyResult.rows[0].credit_status;
    const allowedStatuses = ["not_requested", "rejected"];
    if (!allowedStatuses.includes(currentStatus)) {
      return res.status(400).json({ error: `Credit application already ${currentStatus === "pending_review" ? "under review" : currentStatus}.` });
    }

    const { requestedCreditLimit, preferredPaymentTerms, financeContactName, financeContactEmail, financeContactPhone, supportingNotes } = req.body;

    await query(
      `UPDATE companies SET
        credit_status = 'pending_review',
        requested_credit_limit = $1,
        credit_reviewed_at = NOW(),
        credit_application_notes = $2,
        finance_contact_name = COALESCE($3, finance_contact_name),
        finance_contact_email = COALESCE($4, finance_contact_email),
        finance_contact_phone = COALESCE($5, finance_contact_phone)
       WHERE id = $6`,
      [
        requestedCreditLimit,
        supportingNotes || null,
        financeContactName || null,
        financeContactEmail || null,
        financeContactPhone || null,
        companyId,
      ]
    );

    // Log the transaction
    await query(
      `INSERT INTO company_credit_transactions (company_id, amount, type, reason, credit_used_before, credit_used_after, created_by)
       VALUES ($1, 0, 'credit_adjusted', $2, 0, 0, $3)`,
      [companyId, `Credit application submitted: GH₵${Number(requestedCreditLimit).toLocaleString()} requested${preferredPaymentTerms ? ` (terms: ${preferredPaymentTerms})` : ""}`, req.userId]
    );

    res.json({ message: "Credit application submitted for review." });
  } catch (err) {
    console.error("Credit application error:", err);
    res.status(500).json({ error: "Failed to submit credit application" });
  }
});

export default router;
