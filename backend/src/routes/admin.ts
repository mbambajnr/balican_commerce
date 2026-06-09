import { Router, Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import multer from "multer";
import { query, transaction } from "../config/db";
import { authenticate, requireAdmin, requireSuperAdmin, requireRole, AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { slugify } from "../utils/helpers";
import { indexProduct, deleteProductIndex, searchProducts } from "../services/elasticsearch";
import { notifyAndLog } from "../services/notifications";
import { getStorageDriver, validateImageFile } from "../services/storage";
import { assessCreditVetting } from "../services/credit-vetting";
import { assessSupplierCreditVetting } from "../services/supplier-credit-vetting";
import {
  getActiveQuestions,
  getFullVettingProfile,
  adminUpdateVettingStatus,
  addVettingNote,
  getScoreBandInfo,
} from "../services/company-vetting";

const router = Router();

const creditSettingsSchema = z.object({
  creditLimit: z.number().min(0),
  isCreditApproved: z.boolean().optional(),
  paymentTermsDays: z.number().min(0).max(365).optional(),
});

const adminUpdateProductSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  price: z.number().positive().optional(),
  comparePrice: z.number().positive().optional(),
  stockStatus: z.string().optional(),
  isActive: z.boolean().optional(),
  shortDescription: z.string().optional(),
});

/* ── Dashboard ── */

router.get("/dashboard", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [orders, rfqs, bookings, users, companies, pendingCompanies,
      providers, buyers, recentOrders, pendingRfqs, creditStats, orderTypeStats] = await Promise.all([
      query("SELECT COUNT(*) FROM orders"),
      query("SELECT COUNT(*) FROM rfqs"),
      query("SELECT COUNT(*) FROM service_bookings"),
      query("SELECT COUNT(*) FROM users WHERE role = 'customer'"),
      query("SELECT COUNT(*) FROM companies"),
      query("SELECT COUNT(*) FROM companies WHERE status = 'pending'"),
      query("SELECT COUNT(*) FROM companies WHERE is_provider = true"),
      query("SELECT COUNT(*) FROM companies WHERE is_buyer = true"),
      query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 5"),
      query("SELECT r.*, p.name as product_name, u.first_name, u.last_name FROM rfqs r LEFT JOIN products p ON r.product_id = p.id LEFT JOIN users u ON r.user_id = u.id WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT 10"),
      query(`SELECT
        COUNT(*) FILTER (WHERE payment_method = 'credit') as credit_orders,
        COALESCE(SUM(total) FILTER (WHERE payment_method = 'credit'), 0) as credit_total,
        COALESCE(SUM(outstanding_balance), 0) as total_outstanding
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id AND o.payment_method = 'credit'
      WHERE u.role = 'customer'`),
      query(`SELECT
        COUNT(*) FILTER (WHERE order_type = 'sales') as sales_orders,
        COUNT(*) FILTER (WHERE order_type = 'service') as service_orders,
        COUNT(*) FILTER (WHERE order_type = 'mixed') as mixed_orders
      FROM orders`),
    ]);

    res.json({
      stats: {
        totalOrders: parseInt(orders.rows[0].count),
        totalRfqs: parseInt(rfqs.rows[0].count),
        totalBookings: parseInt(bookings.rows[0].count),
        totalCustomers: parseInt(users.rows[0].count),
        totalCompanies: parseInt(companies.rows[0].count),
        pendingCompanies: parseInt(pendingCompanies.rows[0].count),
        totalProviders: parseInt(providers.rows[0].count),
        totalBuyers: parseInt(buyers.rows[0].count),
        creditOrders: parseInt(creditStats.rows[0].credit_orders),
        creditTotal: parseFloat(creditStats.rows[0].credit_total),
        totalOutstanding: parseFloat(creditStats.rows[0].total_outstanding),
      },
      recentOrders: recentOrders.rows,
      pendingRfqs: pendingRfqs.rows,
      orderTypes: {
        salesOrders: parseInt(orderTypeStats.rows[0].sales_orders),
        serviceOrders: parseInt(orderTypeStats.rows[0].service_orders),
        mixedOrders: parseInt(orderTypeStats.rows[0].mixed_orders),
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

/* ── Customers ── */

router.get("/customers", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      search, creditApproved, hasOutstanding, overdueBalance, company,
      page = "1", limit = "20", sortBy = "created_at", sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conditions: string[] = ["u.role = 'customer'"];

    if (search) {
      conditions.push(`(u.email ILIKE $${params.length + 1} OR u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1} OR u.phone ILIKE $${params.length + 1} OR u.company_name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (creditApproved !== undefined && creditApproved !== "") {
      conditions.push(`u.is_credit_approved = $${params.length + 1}`);
      params.push(creditApproved === "true" || creditApproved === "1");
    }

    if (hasOutstanding !== undefined && hasOutstanding !== "") {
      if (hasOutstanding === "true") {
        conditions.push(`u.outstanding_balance > 0`);
      } else {
        conditions.push(`u.outstanding_balance = 0`);
      }
    }

    if (overdueBalance !== undefined && overdueBalance !== "") {
      if (overdueBalance === "true") {
        conditions.push(`EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'overdue')`);
      } else {
        conditions.push(`NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'overdue')`);
      }
    }

    if (company) {
      conditions.push(`u.company_name ILIKE $${params.length + 1}`);
      params.push(`%${company}%`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const countResult = await query(`SELECT COUNT(*) FROM users u ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const allowedSorts = ["created_at", "first_name", "email", "company_name", "credit_limit", "outstanding_balance"];
    const sortCol = allowedSorts.includes(sortBy as string) ? (sortBy as string) : "created_at";
    const sortDir = sortOrder === "asc" ? "ASC" : "DESC";

    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.company_name,
              u.credit_limit, u.is_credit_approved, u.outstanding_balance,
              u.payment_terms_days,
              COUNT(o.id)::int as total_orders,
              MAX(o.created_at) as last_activity_date,
              u.created_at
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.${sortCol} ${sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      customers: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Get customers error:", err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

const createCustomerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  creditLimit: z.number().min(0).optional(),
  isCreditApproved: z.boolean().optional(),
  paymentTermsDays: z.number().min(0).optional(),
});

router.post("/customers", authenticate, requireAdmin, validate(createCustomerSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone, companyName, creditLimit, isCreditApproved, paymentTermsDays } = req.body;

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, company_name,
        credit_limit, is_credit_approved, payment_terms_days)
       VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7, $8, $9)
       RETURNING id, email, first_name, last_name, phone, role, company_name, credit_limit, is_credit_approved, payment_terms_days, created_at`,
      [email, passwordHash, firstName, lastName, phone || null, companyName || null, creditLimit ?? 0, isCreditApproved ?? false, paymentTermsDays ?? 30]
    );

    const customer = result.rows[0];
    await query(
      `INSERT INTO activities (user_id, type, entity_type, entity_id, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.userId, "customer.created", "user", customer.id, `Admin created customer: ${email}`, JSON.stringify({ customerId: customer.id, email })]
    );

    res.status(201).json({ customer });
  } catch (err) {
    console.error("Create customer error:", err);
    res.status(500).json({ error: "Failed to create customer" });
  }
});

/* ── Customer Detail ── */

router.get("/customers/:id", authenticate, requireRole("admin", "super_admin", "sales", "ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [userResult, ordersResult, rfqsResult, quotationsResult, ordersListResult, bookingsResult] = await Promise.all([
      query(`SELECT id, email, first_name, last_name, phone, company_name, credit_limit, is_credit_approved, outstanding_balance, payment_terms_days, created_at FROM users WHERE id = $1 AND role = 'customer'`, [id]),
      query(`SELECT COUNT(*)::int as count, COALESCE(SUM(total), 0) as total_spent, COALESCE(SUM(amount_paid), 0) as total_paid, MAX(created_at) as last_order_date FROM orders WHERE user_id = $1`, [id]),
      query(`SELECT * FROM rfqs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [id]),
      query(`SELECT q.* FROM quotations q WHERE q.customer_id = $1 ORDER BY q.created_at DESC LIMIT 5`, [id]),
      query(`SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
      query(`SELECT * FROM service_bookings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [id]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = userResult.rows[0];
    const ordersAgg = ordersResult.rows[0];

    let addresses: any[] = [];
    try {
      const addrResult = await query("SELECT * FROM customer_addresses WHERE user_id = $1", [id]);
      addresses = addrResult.rows;
    } catch {
      try {
        const addrResult = await query("SELECT * FROM addresses WHERE user_id = $1", [id]);
        addresses = addrResult.rows;
      } catch {
        // no addresses table
      }
    }

    res.json({
      customer: {
        ...customer,
        addresses,
        stats: {
          totalOrders: ordersAgg.count,
          totalSpent: parseFloat(ordersAgg.total_spent),
          totalOutstanding: parseFloat(customer.outstanding_balance),
          creditLimit: parseFloat(customer.credit_limit),
          isCreditApproved: customer.is_credit_approved,
          paymentTermsDays: customer.payment_terms_days,
          lastOrderDate: ordersAgg.last_order_date,
        },
        recentRfqs: rfqsResult.rows,
        recentQuotations: quotationsResult.rows,
        recentOrders: ordersListResult.rows,
        recentBookings: bookingsResult.rows,
      },
    });
  } catch (err) {
    console.error("Get customer detail error:", err);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

/* ── Update Customer Profile ── */

const updateCustomerSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  companyName: z.string().optional(),
  email: z.string().email().optional(),
});

router.patch("/customers/:id", authenticate, requireAdmin, validate(updateCustomerSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, companyName, email } = req.body;

    if (email) {
      const existing = await query("SELECT id FROM users WHERE email = $1 AND id != $2", [email, id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (firstName !== undefined) { fields.push(`first_name = $${idx++}`); values.push(firstName); }
    if (lastName !== undefined) { fields.push(`last_name = $${idx++}`); values.push(lastName); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (companyName !== undefined) { fields.push(`company_name = $${idx++}`); values.push(companyName); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} AND role = 'customer' RETURNING id, email, first_name, last_name, phone, company_name, credit_limit, is_credit_approved, outstanding_balance, payment_terms_days, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({ customer: result.rows[0] });
  } catch (err) {
    console.error("Update customer error:", err);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

/* ── Credit Settings ── */

router.patch("/customers/:id/credit-settings", authenticate, requireAdmin, validate(creditSettingsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { creditLimit, isCreditApproved, paymentTermsDays } = req.body;

    const fields: string[] = [`credit_limit = $1`];
    const values: any[] = [creditLimit];
    let idx = 2;

    if (isCreditApproved !== undefined) { fields.push(`is_credit_approved = $${idx++}`); values.push(isCreditApproved); }
    if (paymentTermsDays !== undefined) { fields.push(`payment_terms_days = $${idx++}`); values.push(paymentTermsDays); }

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} AND role = 'customer' RETURNING id, email, first_name, last_name, credit_limit, is_credit_approved, payment_terms_days, outstanding_balance`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Customer not found" });

    const creditCustomer = result.rows[0];
    notifyAndLog({
      recipientEmail: creditCustomer.email,
      recipientName: `${creditCustomer.first_name} ${creditCustomer.last_name}`,
      subject: "Credit Settings Updated",
      body: `Your credit limit has been updated to GH₵${Number(creditLimit).toLocaleString()}.`,
      eventType: "customer.credit_updated",
      entityType: "user",
      entityId: creditCustomer.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.json({ customer: creditCustomer });
  } catch (err) {
    console.error("Update credit settings error:", err);
    res.status(500).json({ error: "Failed to update credit settings" });
  }
});

/* ── Backward compatible credit limit route ── */

const updateCreditLimitSchema = z.object({
  creditLimit: z.number().min(0),
});

router.patch("/customers/:id/credit-limit", authenticate, requireAdmin, validate(updateCreditLimitSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { creditLimit } = req.body;
    const result = await query(
      "UPDATE users SET credit_limit = $1 WHERE id = $2 AND role = 'customer' RETURNING id, first_name, last_name, email, credit_limit, outstanding_balance",
      [creditLimit, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Customer not found" });
    const creditCustomer = result.rows[0];
    notifyAndLog({
      recipientEmail: creditCustomer.email,
      recipientName: `${creditCustomer.first_name} ${creditCustomer.last_name}`,
      subject: "Credit Limit Updated",
      body: `Your credit limit has been updated to GH₵${Number(creditLimit).toLocaleString()}.`,
      eventType: "customer.credit_updated",
      entityType: "user",
      entityId: creditCustomer.id,
      performedBy: req.userId!,
    }).catch(() => {});
    res.json({ customer: creditCustomer });
  } catch (err) {
    console.error("Update credit limit error:", err);
    res.status(500).json({ error: "Failed to update credit limit" });
  }
});

/* ── Customer Timeline ── */

router.get("/customers/:id/timeline", authenticate, requireRole("admin", "super_admin", "sales", "ops"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT a.id, a.type as event_type, a.description, a.created_at, a.user_id, a.metadata, 'activity' as source
       FROM activities a
       WHERE a.user_id = $1 OR a.entity_id = $1
       UNION ALL
       SELECT qe.id, qe.event_type, qe.description, qe.created_at, qe.user_id, qe.metadata, 'quotation_event' as source
       FROM quotation_events qe
       JOIN quotations q ON qe.quotation_id = q.id
       WHERE q.customer_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    const events = result.rows.map((row: any) => ({
      id: row.id,
      type: row.source as "activity" | "quotation_event",
      eventType: row.event_type,
      description: row.description,
      createdAt: row.created_at,
      userId: row.user_id || null,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    }));

    res.json({ events });
  } catch (err) {
    console.error("Get customer timeline error:", err);
    res.status(500).json({ error: "Failed to fetch timeline" });
  }
});

/* ── Customer Financial Summary ── */

router.get("/customers/:id/financial-summary", authenticate, requireRole("admin", "super_admin", "sales"), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [userResult, ordersAgg, paymentsAgg, invoiceAgg, bankTransferAgg, bookingAgg] = await Promise.all([
      query(`SELECT id, credit_limit, is_credit_approved, outstanding_balance, payment_terms_days FROM users WHERE id = $1 AND role = 'customer'`, [id]),
      query(`SELECT COUNT(*)::int as count, COALESCE(SUM(total), 0) as total_value, COALESCE(SUM(amount_paid), 0) as total_paid, COALESCE(SUM(outstanding_amount), 0) as total_outstanding, MAX(created_at) as last_order_date FROM orders WHERE user_id = $1`, [id]),
      query(`SELECT COALESCE(SUM(op.amount), 0) as total_paid, MAX(op.created_at) as last_payment_date FROM order_payments op JOIN orders o ON op.order_id = o.id WHERE o.user_id = $1`, [id]),
      query(`SELECT COALESCE(SUM(CASE WHEN i.status = 'overdue' THEN i.outstanding_amount ELSE 0 END), 0) as overdue_balance FROM invoices i JOIN orders o ON i.order_id = o.id WHERE o.user_id = $1`, [id]),
      query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE bt.status = 'approved')::int as approved FROM bank_transfers bt JOIN orders o ON bt.order_id = o.id WHERE o.user_id = $1`, [id]),
      query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status = 'completed')::int as completed FROM service_bookings WHERE user_id = $1`, [id]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = userResult.rows[0];
    const orders = ordersAgg.rows[0];
    const payments = paymentsAgg.rows[0];
    const invoices = invoiceAgg.rows[0];
    const bankTransfers = bankTransferAgg.rows[0];
    const bookings = bookingAgg.rows[0];

    const totalOrderValue = parseFloat(orders.total_value);
    const totalOrders = orders.count;

    res.json({
      summary: {
        totalOrders,
        totalOrderValue,
        totalAmountPaid: parseFloat(payments.total_paid),
        totalOutstanding: parseFloat(customer.outstanding_balance),
        creditLimit: parseFloat(customer.credit_limit),
        availableCredit: Math.max(0, parseFloat(customer.credit_limit) - parseFloat(customer.outstanding_balance)),
        isCreditApproved: customer.is_credit_approved,
        paymentTermsDays: customer.payment_terms_days,
        averageOrderValue: totalOrders > 0 ? totalOrderValue / totalOrders : 0,
        overdueBalance: parseFloat(invoices.overdue_balance),
        lastPaymentDate: payments.last_payment_date,
        totalBankTransfers: bankTransfers.total,
        approvedBankTransfers: bankTransfers.approved,
        totalServiceBookings: bookings.total,
        completedServiceBookings: bookings.completed,
      },
    });
  } catch (err) {
    console.error("Get financial summary error:", err);
    res.status(500).json({ error: "Failed to fetch financial summary" });
  }
});

/* ── Activity logging helper ── */

async function logActivity(userId: string, type: string, description: string, metadata: Record<string, any> = {}) {
  try {
    await query(
      `INSERT INTO activities (user_id, type, description, metadata, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, description, JSON.stringify(metadata), metadata.entity_type || null, metadata.entity_id || null]
    );
  } catch (err) {
    console.error("Log activity error:", err);
  }
}

/* ── Admin Products ── */

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  price: z.number().positive(),
  comparePrice: z.number().positive().optional(),
  hasVariablePrice: z.boolean().optional(),
  stockStatus: z.enum(["in_stock", "out_of_stock", "limited"]).optional(),
  featured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().optional(),
    sortOrder: z.number().optional(),
  })).optional(),
  variants: z.array(z.any()).optional(),
  attributes: z.array(z.object({
    name: z.string(),
    value: z.string(),
    sortOrder: z.number().optional(),
  })).optional(),
  specs: z.record(z.any()).optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

router.get("/products", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { search, categoryId, stockStatus, isActive, featured, page = "1", limit = "20", sort = "created_at", order = "desc" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      conditions.push(`(p.name ILIKE $${params.length + 1} OR p.sku ILIKE $${params.length + 1} OR p.description ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    if (categoryId) {
      conditions.push(`p.category_id IN (
        WITH RECURSIVE cat_tree AS (
          SELECT id FROM categories WHERE id = $${params.length + 1}
          UNION ALL
          SELECT c2.id FROM categories c2 JOIN cat_tree ct ON c2.parent_category_id = ct.id
        ) SELECT id FROM cat_tree
      )`);
      params.push(categoryId);
    }
    if (stockStatus) {
      conditions.push(`p.stock_status = $${params.length + 1}`);
      params.push(stockStatus);
    }
    if (isActive !== undefined && isActive !== "") {
      conditions.push(`p.is_active = $${params.length + 1}`);
      params.push(isActive === "true" || isActive === "1");
    }
    if (featured !== undefined && featured !== "") {
      conditions.push(`p.featured = $${params.length + 1}`);
      params.push(featured === "true" || featured === "1");
    }

    const allowedSorts = ["created_at", "name", "price", "updated_at"];
    const sortCol = allowedSorts.includes(sort as string) ? (sort as string) : "created_at";
    const sortOrder = order === "asc" ? "ASC" : "DESC";

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*) FROM products p ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${where}
       ORDER BY p.${sortCol} ${sortOrder}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      products: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Admin get products error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/products/:id", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    const product = result.rows[0];

    const [imgResult, attrResult, mediaResult] = await Promise.all([
      query("SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order, created_at", [req.params.id]),
      query("SELECT * FROM product_attributes WHERE product_id = $1 ORDER BY sort_order, name", [req.params.id]),
      query("SELECT * FROM product_attachments WHERE product_id = $1 AND media_type IN ('image', 'video') ORDER BY sort_order, created_at", [req.params.id]),
    ]);

    product.images_list = imgResult.rows;
    product.attributes_list = attrResult.rows;
    const allMedia = mediaResult.rows;
    product.media = allMedia;
    product.images = allMedia.filter((m: any) => m.media_type === 'image');
    product.videos = allMedia.filter((m: any) => m.media_type === 'video');
    const primaryImage = allMedia.find((a: any) => a.media_type === 'image' && a.is_primary)
      || allMedia.find((a: any) => a.media_type === 'image')
      || imgResult.rows[0];
    product.primary_image = primaryImage ? { id: primaryImage.id, url: primaryImage.url, alt_text: primaryImage.alt_text || primaryImage.alt } : null;

    res.json({ product });
  } catch (err) {
    console.error("Admin get product error:", err);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

router.post("/products", authenticate, requireAdmin, validate(productSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sku, shortDescription, description, categoryId, price, comparePrice, hasVariablePrice, stockStatus, featured, isActive, images, variants, attributes, specs, seoTitle, seoDescription } = req.body;
    const slug = slugify(name);

    if (sku) {
      const existing = await query("SELECT id FROM products WHERE sku = $1", [sku]);
      if (existing.rows.length > 0) return res.status(409).json({ error: `SKU "${sku}" already exists` });
    }

    const result = await query(
      `INSERT INTO products (name, sku, slug, short_description, description, category_id, price, compare_price, has_variable_price, stock_status, featured, is_active, variants, specs, seo_title, seo_description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [name, sku || null, slug, shortDescription || null, description || null, categoryId, price, comparePrice || null, hasVariablePrice || false, stockStatus || "in_stock", featured || false, isActive !== false, variants || [], specs || {}, seoTitle || null, seoDescription || null]
    );
    const product = result.rows[0];

    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        await query(
          `INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1, $2, $3, $4)`,
          [product.id, img.url, img.alt || "", img.sortOrder ?? i]
        );
      }
    }

    if (attributes && attributes.length > 0) {
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        await query(
          `INSERT INTO product_attributes (product_id, name, value, sort_order) VALUES ($1, $2, $3, $4)`,
          [product.id, attr.name, attr.value, attr.sortOrder ?? i]
        );
      }
    }

    const catResult = await query("SELECT name, slug FROM categories WHERE id = $1", [categoryId]);
    if (catResult.rows.length > 0) {
      product.category_name = catResult.rows[0].name;
      product.category_slug = catResult.rows[0].slug;
    }

    indexProduct(product).catch((err) => console.error("ES index error:", err));
    logActivity(req.userId!, "product.created", `Created product: ${name}`, { entity_type: "product", entity_id: product.id, product_name: name });

    res.status(201).json({ product });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.patch("/products/:id", authenticate, requireAdmin, validate(adminUpdateProductSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sku, shortDescription, description, categoryId, price, comparePrice, hasVariablePrice, stockStatus, featured, isActive, images, variants, attributes, specs, seoTitle, seoDescription } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`, `slug = $${idx++}`); values.push(name, slugify(name)); }
    if (sku !== undefined) {
      if (sku) {
        const dup = await query("SELECT id FROM products WHERE sku = $1 AND id != $2", [sku, req.params.id]);
        if (dup.rows.length > 0) return res.status(409).json({ error: `SKU "${sku}" already exists` });
      }
      fields.push(`sku = $${idx++}`); values.push(sku || null);
    }
    if (shortDescription !== undefined) { fields.push(`short_description = $${idx++}`); values.push(shortDescription); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (categoryId !== undefined) { fields.push(`category_id = $${idx++}`); values.push(categoryId); }
    if (price !== undefined) { fields.push(`price = $${idx++}`); values.push(price); }
    if (comparePrice !== undefined) { fields.push(`compare_price = $${idx++}`); values.push(comparePrice); }
    if (hasVariablePrice !== undefined) { fields.push(`has_variable_price = $${idx++}`); values.push(hasVariablePrice); }
    if (stockStatus !== undefined) { fields.push(`stock_status = $${idx++}`); values.push(stockStatus); }
    if (featured !== undefined) { fields.push(`featured = $${idx++}`); values.push(featured); }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }
    if (variants !== undefined) { fields.push(`variants = $${idx++}`); values.push(variants); }
    if (specs !== undefined) { fields.push(`specs = $${idx++}`); values.push(specs); }
    if (seoTitle !== undefined) { fields.push(`seo_title = $${idx++}`); values.push(seoTitle); }
    if (seoDescription !== undefined) { fields.push(`seo_description = $${idx++}`); values.push(seoDescription); }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    const product = result.rows[0];

    if (images !== undefined) {
      await query("DELETE FROM product_images WHERE product_id = $1", [req.params.id]);
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          await query(
            `INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1, $2, $3, $4)`,
            [product.id, img.url || img, img.alt || "", img.sortOrder ?? i]
          );
        }
      }
    }

    if (attributes !== undefined) {
      await query("DELETE FROM product_attributes WHERE product_id = $1", [req.params.id]);
      if (attributes.length > 0) {
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          await query(
            `INSERT INTO product_attributes (product_id, name, value, sort_order) VALUES ($1, $2, $3, $4)`,
            [product.id, attr.name, attr.value, attr.sortOrder ?? i]
          );
        }
      }
    }

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

    logActivity(req.userId!, "product.updated", `Updated product: ${product.name}`, { entity_type: "product", entity_id: product.id });

    res.json({ product });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

router.delete("/products/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING name`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    deleteProductIndex(req.params.id).catch(() => {});
    logActivity(req.userId!, "product.deleted", `Soft-deleted product: ${result.rows[0].name}`, { entity_type: "product", entity_id: req.params.id });

    res.json({ message: "Product deactivated" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

/* ── Admin Categories ── */

router.get("/categories", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { search, page = "1", limit = "50", all } = req.query;
    const isAll = all === "true";
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      conditions.push(`(c.name ILIKE $${params.length + 1} OR c.description ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(`SELECT COUNT(*) FROM categories c ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const q = isAll
      ? `SELECT c.*, c2.name as parent_name,
          (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
          (SELECT COUNT(*) FROM categories child WHERE child.parent_category_id = c.id) as child_count
         FROM categories c
         LEFT JOIN categories c2 ON c.parent_category_id = c2.id
         ${where}
         ORDER BY c.sort_order, c.name`
      : `SELECT c.*, c2.name as parent_name,
          (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
          (SELECT COUNT(*) FROM categories child WHERE child.parent_category_id = c.id) as child_count
         FROM categories c
         LEFT JOIN categories c2 ON c.parent_category_id = c2.id
         ${where}
         ORDER BY c.sort_order, c.name
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const qParams = isAll ? params : [...params, limitNum, offset];

    const result = await query(q, qParams);

    res.json({
      categories: result.rows,
      pagination: isAll ? undefined : { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Get categories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/categories/tree", authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
       FROM categories c
       ORDER BY c.sort_order, c.name`
    );
    const map = new Map<string, any>();
    const roots: any[] = [];
    for (const r of rows.rows) {
      map.set(r.id, { ...r, children: [] });
    }
    for (const r of rows.rows) {
      const node = map.get(r.id);
      if (r.parent_category_id && map.has(r.parent_category_id)) {
        map.get(r.parent_category_id).children.push(node);
      } else if (!r.parent_category_id) {
        roots.push(node);
      }
    }
    res.json({ categories: roots });
  } catch (err) {
    console.error("Get category tree error:", err);
    res.status(500).json({ error: "Failed to fetch category tree" });
  }
});

router.post("/categories", authenticate, requireAdmin, validate(z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
  imageUrl: z.string().max(2000).optional(),
  seoTitle: z.string().max(300).optional(),
  seoDescription: z.string().optional(),
  introText: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, parentId, sortOrder, imageUrl, seoTitle, seoDescription, introText } = req.body;
    const slug = slugify(name);

    // Validate parent exists if provided
    if (parentId) {
      const parent = await query("SELECT id FROM categories WHERE id = $1", [parentId]);
      if (parent.rows.length === 0) return res.status(400).json({ error: "Parent category not found" });
    }

    const result = await query(
      `INSERT INTO categories (name, slug, description, parent_category_id, sort_order, image_url, seo_title, seo_description, intro_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (slug) DO NOTHING RETURNING *`,
      [name, slug, description || null, parentId || null, sortOrder ?? 0, imageUrl || null, seoTitle || null, seoDescription || null, introText || null]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: "Category already exists" });

    logActivity(req.userId!, "category.created", `Created category: ${name}`, { entity_type: "category", entity_id: result.rows[0].id });

    res.status(201).json({ category: result.rows[0] });
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.patch("/categories/:id", authenticate, requireAdmin, validate(z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  seoTitle: z.string().max(300).nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  introText: z.string().nullable().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, slug: customSlug, parentId, sortOrder, isActive, imageUrl, seoTitle, seoDescription, introText } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name);
      if (!customSlug) {
        fields.push(`slug = $${idx++}`);
        values.push(slugify(name));
      }
    }
    if (customSlug !== undefined) { fields.push(`slug = $${idx++}`); values.push(customSlug); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(sortOrder); }
    if (isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(isActive); }
    if (imageUrl !== undefined) { fields.push(`image_url = $${idx++}`); values.push(imageUrl); }
    if (seoTitle !== undefined) { fields.push(`seo_title = $${idx++}`); values.push(seoTitle); }
    if (seoDescription !== undefined) { fields.push(`seo_description = $${idx++}`); values.push(seoDescription); }
    if (introText !== undefined) { fields.push(`intro_text = $${idx++}`); values.push(introText); }

    if (parentId !== undefined) {
      // Prevent self-parent
      if (parentId === req.params.id) return res.status(400).json({ error: "Category cannot be its own parent" });
      // Prevent circular: check if the new parent is a descendant of this category
      if (parentId) {
        const descendant = await query(
          `WITH RECURSIVE descendants AS (
             SELECT id FROM categories WHERE parent_category_id = $1
             UNION ALL
             SELECT c.id FROM categories c JOIN descendants d ON c.parent_category_id = d.id
           ) SELECT id FROM descendants WHERE id = $2`,
          [req.params.id, parentId]
        );
        if (descendant.rows.length > 0) return res.status(400).json({ error: "Circular parent reference detected" });
      }
      fields.push(`parent_category_id = $${idx++}`);
      values.push(parentId || null);
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(req.params.id);

    const result = await query(
      `UPDATE categories SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Category not found" });

    logActivity(req.userId!, "category.updated", `Updated category: ${result.rows[0].name}`, { entity_type: "category", entity_id: req.params.id });

    res.json({ category: result.rows[0] });
  } catch (err) {
    console.error("Update category error:", err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

/* ── Companies (B2B account management) ── */

router.get("/companies", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { search, status, page = "1", limit = "20", companyType } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conditions: string[] = [];

    if (search) {
      conditions.push(`(c.name ILIKE $${params.length + 1} OR c.email ILIKE $${params.length + 1} OR c.contact_person_name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }
    if (status) {
      conditions.push(`c.status = $${params.length + 1}`);
      params.push(status);
    }
    if (companyType) {
      conditions.push(`c.company_type = $${params.length + 1}::company_type`);
      params.push(companyType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(`SELECT COUNT(*) FROM companies c ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id)::int as user_count,
        (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'first_name', u.first_name, 'last_name', u.last_name, 'company_role', u.company_role))
         FROM users u WHERE u.company_id = c.id) as users,
        cg.name as customer_group_name
       FROM companies c
       LEFT JOIN customer_groups cg ON c.customer_group_id = cg.id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      companies: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Get companies error:", err);
    res.status(500).json({ error: "Failed to fetch companies" });
  }
});

router.get("/companies/:id", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT c.*,
        (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id)::int as user_count,
        (SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'first_name', u.first_name, 'last_name', u.last_name, 'company_role', u.company_role, 'account_status', u.account_status))
         FROM users u WHERE u.company_id = c.id) as users,
        cg.name as customer_group_name,
        (SELECT jsonb_build_object(
          'utm_source', u.utm_source,
          'utm_campaign', u.utm_campaign,
          'utm_medium', u.utm_medium,
          'referrer_url', u.referrer_url
        ) FROM users u WHERE u.company_id = c.id AND u.company_role = 'company_admin' LIMIT 1) as registration_attribution
       FROM companies c
       LEFT JOIN customer_groups cg ON c.customer_group_id = cg.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const company = result.rows[0];

    // Fetch related data
    const [ordersResult, rfqsResult, quotationsResult] = await Promise.all([
      query(`SELECT COUNT(*)::int as count, COALESCE(SUM(total), 0) as total_spent FROM orders o WHERE o.user_id IN (SELECT id FROM users WHERE company_id = $1)`, [req.params.id]),
      query(`SELECT COUNT(*)::int as count FROM rfqs r WHERE r.user_id IN (SELECT id FROM users WHERE company_id = $1)`, [req.params.id]),
      query(`SELECT COUNT(*)::int as count FROM quotations q WHERE q.customer_id IN (SELECT id FROM users WHERE company_id = $1)`, [req.params.id]),
    ]);

    res.json({
      company: {
        ...company,
        stats: {
          totalOrders: ordersResult.rows[0].count,
          totalSpent: parseFloat(ordersResult.rows[0].total_spent),
          totalRfqs: rfqsResult.rows[0].count,
          totalQuotations: quotationsResult.rows[0].count,
        },
      },
    });
  } catch (err) {
    console.error("Get company detail error:", err);
    res.status(500).json({ error: "Failed to fetch company" });
  }
});

const approveCompanySchema = z.object({
  status: z.enum(["active", "rejected"]),
  rejectionReason: z.string().optional(),
  customerGroupId: z.string().uuid().optional(),
  assignedSalesRepId: z.string().uuid().optional(),
});

router.patch("/companies/:id/approve", authenticate, requireAdmin, validate(approveCompanySchema), async (req: AuthRequest, res: Response) => {
  try {
    const { status, rejectionReason, customerGroupId, assignedSalesRepId, creditLimit, paymentTermsDays } = req.body;

    // When approving a provider company, also set verification_status
    const companyResult = await query(
      `UPDATE companies SET status = $1, rejection_reason = $2,
        customer_group_id = COALESCE($3, customer_group_id),
        assigned_sales_rep_id = COALESCE($4, assigned_sales_rep_id),
        verification_status = CASE
          WHEN $1 = 'active' AND (is_provider = true OR company_type IN ('supplier', 'service_provider', 'both_supplier_and_service_provider')) THEN 'approved'::verification_status
          WHEN $1 = 'rejected' THEN 'rejected'::verification_status
          ELSE verification_status
        END,
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status, rejectionReason || null, customerGroupId || null, assignedSalesRepId || null, req.params.id]
    );
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const company = companyResult.rows[0];

    // Update all users in company
    await query(
      `UPDATE users SET account_status = $1 WHERE company_id = $2`,
      [status, req.params.id]
    );

    // Note: credit approval is now a separate workflow.
    // Company approval grants portal access only — not credit-sales approval.
    // Use the /companies/:id/credit/* endpoints for credit approval.

    notifyAndLog({
      recipientEmail: company.email,
      recipientName: company.contact_person_name || company.name,
      subject: status === "active" ? "Company Account Approved" : "Company Account Registration Update",
      body: status === "active"
        ? `Your company account (${company.name}) has been approved. You can now place orders and access all features.`
        : `Your company account registration has been reviewed. Status: ${status}. Reason: ${rejectionReason || "N/A"}.`,
      eventType: "company.status_changed",
      entityType: "company",
      entityId: company.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.json({ company });
  } catch (err) {
    console.error("Approve company error:", err);
    res.status(500).json({ error: "Failed to update company status" });
  }
});

router.patch("/companies/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, address, city, state, customerGroupId, assignedSalesRepId, accountManagerId } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone); }
    if (address !== undefined) { fields.push(`address = $${idx++}`); values.push(address); }
    if (city !== undefined) { fields.push(`city = $${idx++}`); values.push(city); }
    if (state !== undefined) { fields.push(`state = $${idx++}`); values.push(state); }
    if (customerGroupId !== undefined) { fields.push(`customer_group_id = $${idx++}`); values.push(customerGroupId); }
    if (assignedSalesRepId !== undefined) { fields.push(`assigned_sales_rep_id = $${idx++}`); values.push(assignedSalesRepId); }
    if (accountManagerId !== undefined) { fields.push(`account_manager_id = $${idx++}`); values.push(accountManagerId); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE companies SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    res.json({ company: result.rows[0] });
  } catch (err) {
    console.error("Update company error:", err);
    res.status(500).json({ error: "Failed to update company" });
  }
});

/* ── Customer Groups / Tiers ── */

router.get("/customer-groups", authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await query("SELECT * FROM customer_groups ORDER BY minimum_order_amount ASC");
    res.json({ customerGroups: result.rows });
  } catch (err) {
    console.error("Get customer groups error:", err);
    res.status(500).json({ error: "Failed to fetch customer groups" });
  }
});

const customerGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  minimumOrderAmount: z.number().min(0).optional(),
  isDefault: z.boolean().optional(),
});

router.post("/customer-groups", authenticate, requireAdmin, validate(customerGroupSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, minimumOrderAmount, isDefault } = req.body;
    if (isDefault) {
      await query(`UPDATE customer_groups SET is_default = false WHERE is_default = true`);
    }
    const result = await query(
      `INSERT INTO customer_groups (name, description, minimum_order_amount, is_default)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, minimumOrderAmount ?? 0, isDefault || false]
    );
    logActivity(req.userId!, "customer_group.created", `Created customer group: ${name}`, { entity_type: "customer_group", entity_id: result.rows[0].id });
    res.status(201).json({ customerGroup: result.rows[0] });
  } catch (err) {
    console.error("Create customer group error:", err);
    res.status(500).json({ error: "Failed to create customer group" });
  }
});

router.patch("/customer-groups/:id", authenticate, requireAdmin, validate(customerGroupSchema.partial()), async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, minimumOrderAmount, isDefault } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (minimumOrderAmount !== undefined) { fields.push(`minimum_order_amount = $${idx++}`); values.push(minimumOrderAmount); }
    if (isDefault !== undefined) {
      if (isDefault) { await query(`UPDATE customer_groups SET is_default = false WHERE is_default = true`); }
      fields.push(`is_default = $${idx++}`); values.push(isDefault);
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(req.params.id);

    const result = await query(
      `UPDATE customer_groups SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Customer group not found" });
    res.json({ customerGroup: result.rows[0] });
  } catch (err) {
    console.error("Update customer group error:", err);
    res.status(500).json({ error: "Failed to update customer group" });
  }
});

/* ── Company-Specific Pricing ── */

const companyPriceSchema = z.object({
  companyId: z.string().uuid().optional(),
  customerGroupId: z.string().uuid().optional(),
  productId: z.string().uuid(),
  price: z.number().positive(),
  minQuantity: z.number().int().min(1).optional(),
});

router.get("/company-prices", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { companyId, productId } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    if (companyId) { conditions.push(`cp.company_id = $${params.length + 1}`); params.push(companyId); }
    if (productId) { conditions.push(`cp.product_id = $${params.length + 1}`); params.push(productId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(
      `SELECT cp.*, p.name as product_name, p.sku,
              c.name as company_name, cg.name as customer_group_name
       FROM company_prices cp
       LEFT JOIN products p ON cp.product_id = p.id
       LEFT JOIN companies c ON cp.company_id = c.id
       LEFT JOIN customer_groups cg ON cp.customer_group_id = cg.id
       ${where}
       ORDER BY cp.created_at DESC`,
      params
    );
    res.json({ companyPrices: result.rows });
  } catch (err) {
    console.error("Get company prices error:", err);
    res.status(500).json({ error: "Failed to fetch company prices" });
  }
});

router.post("/company-prices", authenticate, requireAdmin, validate(companyPriceSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { companyId, customerGroupId, productId, price, minQuantity } = req.body;
    if (!companyId && !customerGroupId) {
      return res.status(400).json({ error: "Either companyId or customerGroupId is required" });
    }
    const result = await query(
      `INSERT INTO company_prices (company_id, customer_group_id, product_id, price, min_quantity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [companyId || null, customerGroupId || null, productId, price, minQuantity || 1]
    );
    logActivity(req.userId!, "company_price.created", `Set custom price for product`, { entity_type: "company_price", entity_id: result.rows[0].id });
    res.status(201).json({ companyPrice: result.rows[0] });
  } catch (err) {
    console.error("Create company price error:", err);
    res.status(500).json({ error: "Failed to create company price" });
  }
});

router.delete("/company-prices/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query("DELETE FROM company_prices WHERE id = $1 RETURNING *", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Company price not found" });
    res.json({ message: "Company price deleted" });
  } catch (err) {
    console.error("Delete company price error:", err);
    res.status(500).json({ error: "Failed to delete company price" });
  }
});

/* ── Sales Reps / Account Managers (list staff users) ── */

router.get("/sales-reps", authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role FROM users
       WHERE role IN ('sales', 'admin', 'super_admin')
       ORDER BY first_name`
    );
    res.json({ salesReps: result.rows });
  } catch (err) {
    console.error("Get sales reps error:", err);
    res.status(500).json({ error: "Failed to fetch sales reps" });
  }
});

/* ── Procurement Lists (admin view) ── */

router.get("/procurement-lists", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { companyId } = req.query;
    const params: any[] = [];
    const conditions: string[] = [];

    if (companyId) { conditions.push(`pl.company_id = $${params.length + 1}`); params.push(companyId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query(
      `SELECT pl.*, c.name as company_name,
        (SELECT COUNT(*) FROM procurement_list_items pli WHERE pli.list_id = pl.id)::int as item_count
       FROM procurement_lists pl
       LEFT JOIN companies c ON pl.company_id = c.id
       ${where}
       ORDER BY pl.updated_at DESC`,
      params
    );
    res.json({ procurementLists: result.rows });
  } catch (err) {
    console.error("Get procurement lists error:", err);
    res.status(500).json({ error: "Failed to fetch procurement lists" });
  }
});

router.get("/procurement-lists/:id", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT pl.*, c.name as company_name
       FROM procurement_lists pl
       LEFT JOIN companies c ON pl.company_id = c.id
       WHERE pl.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Procurement list not found" });

    const items = await query(
      `SELECT pli.*, p.name as product_name, p.sku, p.price, p.images
       FROM procurement_list_items pli
       LEFT JOIN products p ON pli.product_id = p.id
       WHERE pli.list_id = $1
       ORDER BY pli.created_at`,
      [req.params.id]
    );

    res.json({ procurementList: result.rows[0], items: items.rows });
  } catch (err) {
    console.error("Get procurement list detail error:", err);
    res.status(500).json({ error: "Failed to fetch procurement list" });
  }
});

/* ── Company Sub-User Management ── */

const createSubUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  companyRole: z.enum(["company_admin", "buyer", "finance", "viewer"]),
});

router.post("/companies/:id/users", authenticate, requireAdmin, validate(createSubUserSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { email, password, firstName, lastName, phone, companyRole } = req.body;

    const companyResult = await query("SELECT id, name, status FROM companies WHERE id = $1", [id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role,
        company_id, company_role, account_status, company_name)
       VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7, $8, $9)
       RETURNING id, email, first_name, last_name, phone, role, company_role, account_status`,
      [email, passwordHash, firstName, lastName, phone || null,
       id, companyRole, companyResult.rows[0].status, companyResult.rows[0].name]
    );

    logActivity(req.userId!, "company_user.created",
      `Created sub-user ${email} for company ${companyResult.rows[0].name}`,
      { entity_type: "user", entity_id: result.rows[0].id, company_id: id });

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error("Create sub-user error:", err);
    res.status(500).json({ error: "Failed to create sub-user" });
  }
});

const tmpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const err = validateImageFile(file.mimetype, file.originalname);
    if (err) cb(new Error(err));
    else cb(null, true);
  },
});

router.post(
  "/upload",
  authenticate,
  requireAdmin,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    tmpUpload.single("image")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum size is 5MB" });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "No image file uploaded" });

      const driver = getStorageDriver();
      const stored = await driver.store(file.buffer, file.originalname, file.mimetype);

      res.status(201).json({ url: stored.url, filename: stored.filename });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

/* ═══════════════════════════════════════════════════════════════
   Company Credit Approval (separate from company approval)
   ═══════════════════════════════════════════════════════════════ */

const creditApproveSchema = z.object({
  approvedCreditLimit: z.number().min(0),
  paymentTermsDays: z.number().min(0).max(365).optional(),
  creditRiskRating: z.enum(["low", "medium", "high"]).optional(),
  reviewNotes: z.string().max(2000).optional(),
  nextReviewAt: z.string().optional(),
});

const creditRejectSchema = z.object({
  rejectionReason: z.string().min(1).max(2000),
  reviewNotes: z.string().max(2000).optional(),
});

// POST /companies/:id/credit/approve — Approve company credit
router.post("/companies/:id/credit/approve", authenticate, requireAdmin, validate(creditApproveSchema), async (req: AuthRequest, res: Response) => {
  try {
    const companyResult = await query("SELECT id, name, credit_status FROM companies WHERE id = $1", [req.params.id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });
    const company = companyResult.rows[0];

    // Can only approve if pending_review or previously rejected/suspended
    if (!["pending_review", "rejected", "suspended"].includes(company.credit_status)) {
      return res.status(400).json({ error: `Cannot approve credit with status "${company.credit_status}". Must be pending_review, rejected, or suspended.` });
    }

    const { approvedCreditLimit, paymentTermsDays, creditRiskRating, reviewNotes, nextReviewAt } = req.body;

    const result = await query(
      `UPDATE companies SET
        credit_status = 'approved',
        approved_credit_limit = $1,
        payment_terms_days = COALESCE($2, payment_terms_days, 30),
        credit_risk_rating = COALESCE($3, credit_risk_rating, 'low'),
        credit_review_notes = COALESCE($4, credit_review_notes),
        credit_approved_by = $5,
        credit_approved_at = NOW(),
        credit_reviewed_at = NOW(),
        next_review_at = $6,
        credit_rejection_reason = NULL
       WHERE id = $7
       RETURNING *`,
      [
        approvedCreditLimit,
        paymentTermsDays ?? null,
        creditRiskRating ?? null,
        reviewNotes ?? null,
        req.userId,
        nextReviewAt ?? null,
        req.params.id,
      ]
    );

    // Log the credit approval transaction
    await query(
      `INSERT INTO company_credit_transactions (company_id, amount, type, reason, credit_used_before, credit_used_after, created_by)
       VALUES ($1, 0, 'credit_approved', $2, 0, 0, $3)`,
      [req.params.id, `Credit approved: GH₵${Number(approvedCreditLimit).toLocaleString()} limit${paymentTermsDays ? `, ${paymentTermsDays} days terms` : ""}`, req.userId]
    );

    notifyAndLog({
      recipientEmail: company.name,
      recipientName: company.name,
      subject: "Credit Facility Approved",
      body: `Your credit facility has been approved with a limit of GH₵${Number(approvedCreditLimit).toLocaleString()}.`,
      eventType: "company.credit_approved",
      entityType: "company",
      entityId: company.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.json({ company: result.rows[0] });
  } catch (err) {
    console.error("Credit approve error:", err);
    res.status(500).json({ error: "Failed to approve credit" });
  }
});

// POST /companies/:id/credit/reject — Reject company credit application
router.post("/companies/:id/credit/reject", authenticate, requireAdmin, validate(creditRejectSchema), async (req: AuthRequest, res: Response) => {
  try {
    const companyResult = await query("SELECT id, name, credit_status FROM companies WHERE id = $1", [req.params.id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const { rejectionReason, reviewNotes } = req.body;

    const result = await query(
      `UPDATE companies SET
        credit_status = 'rejected',
        credit_rejection_reason = $1,
        credit_review_notes = COALESCE($2, credit_review_notes),
        credit_reviewed_at = NOW(),
        credit_approved_by = NULL,
        credit_approved_at = NULL
       WHERE id = $3
       RETURNING *`,
      [rejectionReason, reviewNotes ?? null, req.params.id]
    );

    await query(
      `INSERT INTO company_credit_transactions (company_id, amount, type, reason, credit_used_before, credit_used_after, created_by)
       VALUES ($1, 0, 'credit_rejected', $2, 0, 0, $3)`,
      [req.params.id, `Credit rejected: ${rejectionReason}`, req.userId]
    );

    res.json({ company: result.rows[0] });
  } catch (err) {
    console.error("Credit reject error:", err);
    res.status(500).json({ error: "Failed to reject credit" });
  }
});

// POST /companies/:id/credit/suspend — Suspend company credit
router.post("/companies/:id/credit/suspend", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const companyResult = await query("SELECT id, name, credit_status FROM companies WHERE id = $1", [req.params.id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });
    if (companyResult.rows[0].credit_status !== "approved") {
      return res.status(400).json({ error: "Only approved credit can be suspended." });
    }

    const result = await query(
      `UPDATE companies SET credit_status = 'suspended', credit_reviewed_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await query(
      `INSERT INTO company_credit_transactions (company_id, amount, type, reason, credit_used_before, credit_used_after, created_by)
       VALUES ($1, 0, 'credit_suspended', $2, 0, 0, $3)`,
      [req.params.id, "Credit facility suspended", req.userId]
    );

    res.json({ company: result.rows[0] });
  } catch (err) {
    console.error("Credit suspend error:", err);
    res.status(500).json({ error: "Failed to suspend credit" });
  }
});

// POST /companies/:id/credit/reactivate — Reactivate suspended/expired credit
router.post("/companies/:id/credit/reactivate", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const companyResult = await query("SELECT id, name, credit_status FROM companies WHERE id = $1", [req.params.id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });
    if (!["suspended", "rejected"].includes(companyResult.rows[0].credit_status)) {
      return res.status(400).json({ error: "Only suspended or rejected credit can be reactivated." });
    }

    const result = await query(
      `UPDATE companies SET credit_status = 'approved', credit_reviewed_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    await query(
      `INSERT INTO company_credit_transactions (company_id, amount, type, reason, credit_used_before, credit_used_after, created_by)
       VALUES ($1, 0, 'credit_reactivated', $2, 0, 0, $3)`,
      [req.params.id, "Credit facility reactivated", req.userId]
    );

    res.json({ company: result.rows[0] });
  } catch (err) {
    console.error("Credit reactivate error:", err);
    res.status(500).json({ error: "Failed to reactivate credit" });
  }
});

// GET /companies/:id/credit/vetting — Run credit vetting heuristic
router.get("/companies/:id/credit/vetting", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const companyResult = await query("SELECT id FROM companies WHERE id = $1", [req.params.id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const vetting = await assessCreditVetting(req.params.id);
    res.json(vetting);
  } catch (err) {
    console.error("Credit vetting error:", err);
    res.status(500).json({ error: "Failed to run credit vetting" });
  }
});

/* ── Company Vetting Workflow ── */

// GET /companies/:id/vetting — Get company vetting profile (admin)
router.get("/companies/:id/vetting", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const companyResult = await query("SELECT id FROM companies WHERE id = $1", [req.params.id]);
    if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });

    const profile = await getFullVettingProfile(req.params.id);
    if (!profile) return res.json({ vetting: null });

    const activeQuestions = await getActiveQuestions();
    const maxScore = activeQuestions.reduce((sum: number, q: any) => sum + q.score_weight, 0) || 1;

    res.json({
      vetting: {
        ...profile,
        maxScore,
        scoreBandInfo: getScoreBandInfo(profile.submission.score, maxScore),
      },
    });
  } catch (err) {
    console.error("Get vetting profile error:", err);
    res.status(500).json({ error: "Failed to get vetting profile" });
  }
});

// PATCH /companies/:id/vetting/status — Update vetting status (admin)
const vettingStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "needs_info"]),
  note: z.string().max(5000).optional(),
});

router.patch(
  "/companies/:id/vetting/status",
  authenticate,
  requireAdmin,
  validate(vettingStatusSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const companyResult = await query("SELECT id FROM companies WHERE id = $1", [req.params.id]);
      if (companyResult.rows.length === 0) return res.status(404).json({ error: "Company not found" });

      const sub = await query(
        "SELECT id FROM vetting_submissions WHERE company_id = $1 AND status IN ('submitted', 'needs_info') ORDER BY created_at DESC LIMIT 1",
        [req.params.id]
      );
      if (sub.rows.length === 0) return res.status(400).json({ error: "No active submission found" });

      const updated = await adminUpdateVettingStatus(
        sub.rows[0].id,
        req.params.id,
        req.userId!,
        req.body.status,
        req.body.note
      );

      res.json({ submission: updated });
    } catch (err) {
      console.error("Update vetting status error:", err);
      res.status(500).json({ error: "Failed to update vetting status" });
    }
  }
);

// POST /companies/:id/vetting/note — Add internal note (admin)
router.post(
  "/companies/:id/vetting/note",
  authenticate,
  requireAdmin,
  validate(z.object({ note: z.string().min(1).max(5000) })),
  async (req: AuthRequest, res: Response) => {
    try {
      const sub = await query(
        "SELECT id FROM vetting_submissions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
        [req.params.id]
      );
      if (sub.rows.length === 0) return res.status(400).json({ error: "No submission found" });

      await addVettingNote(sub.rows[0].id, req.params.id, req.userId!, req.body.note);
      res.json({ message: "Note added" });
    } catch (err) {
      console.error("Add vetting note error:", err);
      res.status(500).json({ error: "Failed to add note" });
    }
  }
);

// GET /companies/:id/vetting/documents — List vetting documents for admin
router.get("/companies/:id/vetting/documents", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const docs = await query(
      "SELECT id, question_key, original_filename, mime_type, size_bytes, created_at FROM vetting_documents WHERE company_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ documents: docs.rows });
  } catch (err) {
    console.error("List vetting documents error:", err);
    res.status(500).json({ error: "Failed to list documents" });
  }
});

/* ── Supplier Credit Vetting Workflow ── */

// GET /providers/:id/credit-vetting — Run supplier credit vetting heuristic
router.get("/providers/:id/credit-vetting", authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const company = await query(
      "SELECT id FROM companies WHERE id = $1 AND is_provider = true",
      [req.params.id]
    );
    if (company.rows.length === 0) return res.status(404).json({ error: "Provider not found" });

    const vetting = await assessSupplierCreditVetting(req.params.id);

    // Also return existing profile if any
    const profile = await query(
      "SELECT * FROM supplier_credit_profiles WHERE company_id = $1",
      [req.params.id]
    );

    res.json({ vetting, profile: profile.rows[0] || null });
  } catch (err) {
    console.error("Supplier credit vetting error:", err);
    res.status(500).json({ error: "Failed to run supplier credit vetting" });
  }
});

// POST /providers/:id/credit-vetting/approve — Approve supplier with tier + limit
const approveSupplierCreditSchema = z.object({
  creditTier: z.enum(["premium", "standard", "basic"]),
  creditLimit: z.number().min(0).optional(),
  reviewNotes: z.string().max(5000).optional(),
  nextReviewAt: z.string().optional(), // ISO date string
});

router.post(
  "/providers/:id/credit-vetting/approve",
  authenticate,
  requireAdmin,
  validate(approveSupplierCreditSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const company = await query(
        "SELECT id FROM companies WHERE id = $1 AND is_provider = true",
        [req.params.id]
      );
      if (company.rows.length === 0) return res.status(404).json({ error: "Provider not found" });

      const { creditTier, creditLimit, reviewNotes, nextReviewAt } = req.body;

      // Upsert supplier credit profile
      await query(
        `INSERT INTO supplier_credit_profiles (company_id, vetting_status, credit_tier, credit_limit,
          review_notes, reviewed_by, reviewed_at, next_review_at)
         VALUES ($1, 'approved', $2, $3, $4, $5, NOW(), $6::date)
         ON CONFLICT (company_id) DO UPDATE SET
          vetting_status = 'approved', credit_tier = $2,
          credit_limit = COALESCE($3, supplier_credit_profiles.credit_limit),
          review_notes = $4, reviewed_by = $5, reviewed_at = NOW(),
          next_review_at = $6::date, updated_at = NOW()`,
        [req.params.id, creditTier, creditLimit || 0, reviewNotes || null, req.userId!, nextReviewAt || null]
      );

      const updated = await query("SELECT * FROM supplier_credit_profiles WHERE company_id = $1", [req.params.id]);

      res.json({ success: true, profile: updated.rows[0] });
    } catch (err) {
      console.error("Approve supplier credit error:", err);
      res.status(500).json({ error: "Failed to approve supplier credit" });
    }
  }
);

// POST /providers/:id/credit-vetting/reject — Reject supplier credit vetting
const rejectSupplierCreditSchema = z.object({
  rejectionReason: z.string().max(5000),
  reviewNotes: z.string().max(5000).optional(),
});

router.post(
  "/providers/:id/credit-vetting/reject",
  authenticate,
  requireAdmin,
  validate(rejectSupplierCreditSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const company = await query(
        "SELECT id FROM companies WHERE id = $1 AND is_provider = true",
        [req.params.id]
      );
      if (company.rows.length === 0) return res.status(404).json({ error: "Provider not found" });

      const { rejectionReason, reviewNotes } = req.body;

      await query(
        `INSERT INTO supplier_credit_profiles (company_id, vetting_status, rejection_reason,
          review_notes, reviewed_by, reviewed_at)
         VALUES ($1, 'rejected', $2, $3, $4, NOW())
         ON CONFLICT (company_id) DO UPDATE SET
          vetting_status = 'rejected', rejection_reason = $2,
          review_notes = $3, reviewed_by = $4, reviewed_at = NOW(),
          credit_tier = 'basic', credit_limit = 0, updated_at = NOW()`,
        [req.params.id, rejectionReason, reviewNotes || null, req.userId!]
      );

      const updated = await query("SELECT * FROM supplier_credit_profiles WHERE company_id = $1", [req.params.id]);

      res.json({ success: true, profile: updated.rows[0] });
    } catch (err) {
      console.error("Reject supplier credit error:", err);
      res.status(500).json({ error: "Failed to reject supplier credit" });
    }
  }
);

/* ═══════════════════════════════════════════════
   OPERATIONS DASHBOARD
   ═══════════════════════════════════════════════ */

router.get(
  "/operations/summary",
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const [openProReq, pendingCredit, acceptedNoOrder, recentOrders] = await Promise.all([
        query(
          "SELECT COUNT(*) as count FROM procurement_requests WHERE status = ANY($1)",
          [["submitted", "in_review"]]
        ),
        query(
          "SELECT COUNT(*) as count FROM supplier_credit_profiles WHERE vetting_status = ANY($1)",
          [["unrated", "pending_review"]]
        ),
        query(
          `SELECT COUNT(*) as count FROM procurement_requests pr
           WHERE pr.status = 'accepted'
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.procurement_request_id = pr.id)`,
        ),
        query(
          `SELECT o.id, o.order_number, o.total, o.status, o.payment_status,
                  o.created_at, pr.title as request_title, c.name as company_name
           FROM orders o
           JOIN procurement_requests pr ON pr.id = o.procurement_request_id
           LEFT JOIN companies c ON c.id = pr.company_id
           ORDER BY o.created_at DESC
           LIMIT 10`,
        ),
      ]);

      res.json({
        openProcurementRequests: parseInt(openProReq.rows[0].count),
        pendingSupplierCreditReviews: parseInt(pendingCredit.rows[0].count),
        acceptedRequestsAwaitingConversion: parseInt(acceptedNoOrder.rows[0].count),
        recentConvertedOrders: recentOrders.rows,
      });
    } catch (err) {
      console.error("Operations summary error:", err);
      res.status(500).json({ error: "Failed to fetch operations summary" });
    }
  }
);

/* ─────────────────────────────────────────
   Super Admin: Admin User Management
   ───────────────────────────────────────── */

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
});

router.get(
  "/admins",
  authenticate,
  requireSuperAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      const result = await query(
        `SELECT id, email, first_name, last_name, phone, role, account_status, created_at, updated_at
         FROM users WHERE role IN ('admin', 'super_admin')
         ORDER BY created_at DESC`
      );
      res.json({
        admins: result.rows.map((u: any) => ({
          id: u.id,
          email: u.email,
          firstName: u.first_name,
          lastName: u.last_name,
          phone: u.phone,
          role: u.role,
          status: u.account_status,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        })),
      });
    } catch (err) {
      console.error("List admins error:", err);
      res.status(500).json({ error: "Failed to list admin users" });
    }
  }
);

router.post(
  "/admins",
  authenticate,
  requireSuperAdmin,
  validate(createAdminSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      // Check if email already exists
      const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }

      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      const result = await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, account_status)
         VALUES ($1, $2, $3, $4, $5, 'admin', 'active')
         RETURNING id, email, first_name, last_name, phone, role, account_status, created_at`,
        [email, passwordHash, firstName, lastName, phone || null]
      );

      const u = result.rows[0];
      res.status(201).json({
        admin: {
          id: u.id,
          email: u.email,
          firstName: u.first_name,
          lastName: u.last_name,
          phone: u.phone,
          role: u.role,
          status: u.account_status,
          createdAt: u.created_at,
        },
      });
    } catch (err) {
      console.error("Create admin error:", err);
      res.status(500).json({ error: "Failed to create admin user" });
    }
  }
);

router.patch(
  "/admins/:id/disable",
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.params.id;

      // Prevent disabling self
      if (userId === req.userId) {
        return res.status(400).json({ error: "You cannot disable your own account" });
      }

      const result = await query(
        "SELECT id, role FROM users WHERE id = $1 AND role IN ('admin', 'super_admin')",
        [userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      // Prevent disabling another super_admin
      if (result.rows[0].role === "super_admin") {
        return res.status(403).json({ error: "You cannot disable another super admin" });
      }

      await query(
        "UPDATE users SET account_status = 'suspended', updated_at = NOW() WHERE id = $1",
        [userId]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Disable admin error:", err);
      res.status(500).json({ error: "Failed to disable admin user" });
    }
  }
);

router.patch(
  "/admins/:id/enable",
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await query(
        "SELECT id FROM users WHERE id = $1 AND role IN ('admin', 'super_admin')",
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      await query(
        "UPDATE users SET account_status = 'active', updated_at = NOW() WHERE id = $1",
        [req.params.id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Enable admin error:", err);
      res.status(500).json({ error: "Failed to enable admin user" });
    }
  }
);

export default router;