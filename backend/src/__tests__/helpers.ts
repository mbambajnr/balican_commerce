import { query } from "../config/db";
import argon2 from "argon2";

export const TEST_PREFIX = "test-qa-";

export function makeEmail(name: string): string {
  return `${TEST_PREFIX}${name}@test-sslplan.com`;
}

export function makeUnique(prefix: string): string {
  return `${TEST_PREFIX}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createTestCompany(name?: string) {
  const companyName = name || makeUnique("company");
  const result = await query(
    `INSERT INTO companies (name, email, contact_person_name, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [companyName, `${companyName.toLowerCase()}@test-sslplan.com`, "Test Contact"]
  );
  if (result.rows.length > 0) return result.rows[0];
  const existing = await query("SELECT * FROM companies WHERE name = $1", [companyName]);
  return existing.rows[0];
}

export async function createTestUser(
  overrides: Partial<{
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    phone: string;
    creditLimit: number;
    isCreditApproved: boolean;
    paymentTermsDays: number;
    companyName: string;
    companyId: string;
    companyRole: string;
    accountStatus: string;
  }> = {}
) {
  const email = overrides.email || makeEmail("user");
  const password = overrides.password || "TestPass123!";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // Create a default company for this user if needed
  let companyId = overrides.companyId;
  if (!companyId && overrides.companyName) {
    const company = await createTestCompany(overrides.companyName);
    companyId = company.id;
  }

  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, phone,
      credit_limit, is_credit_approved, payment_terms_days, company_name, company_id, company_role, account_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW(), outstanding_balance = 0, store_credit = 0, credit_limit = EXCLUDED.credit_limit, is_credit_approved = EXCLUDED.is_credit_approved, account_status = EXCLUDED.account_status, company_id = EXCLUDED.company_id, company_name = EXCLUDED.company_name
     RETURNING id, email, first_name, last_name, role, credit_limit, outstanding_balance, is_credit_approved, payment_terms_days, company_id, company_role, account_status`,
    [
      email,
      passwordHash,
      overrides.firstName || "Test",
      overrides.lastName || "User",
      overrides.role || "customer",
      overrides.phone || "0800000000",
      overrides.creditLimit ?? 0,
      overrides.isCreditApproved ?? false,
      overrides.paymentTermsDays ?? 30,
      overrides.companyName || null,
      companyId || null,
      overrides.companyRole || "company_admin",
      overrides.accountStatus || "active",
    ]
  );
  return result.rows[0];
}

export async function createTestCategory(name?: string) {
  const categoryName = name || makeUnique("category");
  const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  const result = await query(
    `INSERT INTO categories (name, slug, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [categoryName, slug, `Test category ${categoryName}`]
  );
  return result.rows[0];
}

export async function createTestProduct(
  overrides: Partial<{
    name: string;
    price: number;
    categoryId: string;
    isActive: boolean;
    stockStatus: string;
    sku: string;
    hidePrice: boolean;
  }> = {}
) {
  const name = overrides.name || makeUnique("product");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
  const sku = overrides.sku || makeUnique("sku");

  const result = await query(
    `INSERT INTO products (name, slug, description, category_id, price, stock_status, is_active, sku, hide_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      name,
      slug,
      `Test product ${name}`,
      overrides.categoryId || null,
      overrides.price ?? 10000,
      overrides.stockStatus || "in_stock",
      overrides.isActive !== false,
      sku,
      overrides.hidePrice === true,
    ]
  );
  return result.rows[0];
}

export async function createTestQuotation(
  overrides: Partial<{
    rfqId: string;
    customerId: string;
    status: string;
    totalAmount: number;
    subtotal: number;
    validUntil: string;
  }> = {}
) {
  const quotationNumber = `QTN-TEST-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const result = await query(
    `INSERT INTO quotations (rfq_id, customer_id, quotation_number, status, subtotal, total_amount, valid_until, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      overrides.rfqId || null,
      overrides.customerId,
      quotationNumber,
      overrides.status || "draft",
      overrides.subtotal || 10000,
      overrides.totalAmount || 10000,
      overrides.validUntil || null,
      overrides.customerId,
    ]
  );
  return result.rows[0];
}

export async function createTestQuotationItem(
  overrides: Partial<{
    quotationId: string;
    productId: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }> = {}
) {
  const lineTotal = (overrides.quantity || 1) * (overrides.unitPrice || 10000);
  const result = await query(
    `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, line_total, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      overrides.quotationId,
      overrides.productId || null,
      overrides.description || "Test item",
      overrides.quantity || 1,
      overrides.unitPrice || 10000,
      lineTotal,
      0,
    ]
  );
  return result.rows[0];
}

export async function createTestOrder(
  overrides: Partial<{
    userId: string;
    items: any[];
    subtotal: number;
    tax: number;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    amountPaid: number;
    status: string;
    quotationId: string;
    rfqId: string;
    paystackReference: string;
  }> = {}
) {
  const orderNumber = `ORD-TEST-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const items = overrides.items || [{ productId: "test", name: "Test Item", price: 10000, quantity: 1 }];
  const total = overrides.total ?? 10000;
  const amountPaid = overrides.amountPaid ?? (overrides.paymentStatus === "paid" ? total : 0);
  const outstanding = total - amountPaid;

  const orderType = overrides.paymentMethod === "service" ? "service" : (overrides as any).orderType || "sales";
  const result = await query(
    `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status,
      payment_method, payment_status, amount_paid, outstanding_amount,
      quotation_id, rfq_id, paystack_reference, order_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      overrides.userId,
      orderNumber,
      JSON.stringify(items),
      overrides.subtotal ?? total,
      overrides.tax ?? 0,
      total,
      overrides.status || "pending",
      overrides.paymentMethod || "credit",
      overrides.paymentStatus || "unpaid",
      amountPaid,
      outstanding,
      overrides.quotationId || null,
      overrides.rfqId || null,
      overrides.paystackReference || null,
      orderType,
    ]
  );
  return result.rows[0];
}

export async function createTestInvoice(
  overrides: Partial<{
    orderId: string;
    status: string;
    total: number;
    amountPaid: number;
    outstandingAmount: number;
  }> = {}
) {
  const invoiceNumber = `INV-TEST-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const total = overrides.total ?? 10000;
  const amountPaid = overrides.amountPaid ?? 0;
  const outstanding = overrides.outstandingAmount ?? total;

  const result = await query(
    `INSERT INTO invoices (order_id, invoice_number, status, subtotal, tax, total, amount_paid, outstanding_amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      overrides.orderId,
      invoiceNumber,
      overrides.status || "issued",
      total,
      0,
      total,
      amountPaid,
      outstanding,
    ]
  );
  return result.rows[0];
}

export async function createTestBankTransfer(
  overrides: Partial<{
    orderId: string;
    userId: string;
    amount: number;
    status: string;
    transferReference: string;
  }> = {}
) {
  const result = await query(
    `INSERT INTO bank_transfers (order_id, user_id, amount, status, transfer_reference, bank_name, account_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      overrides.orderId,
      overrides.userId,
      overrides.amount ?? 10000,
      overrides.status || "pending_verification",
      overrides.transferReference || `TFR-TEST-${Date.now()}`,
      "Test Bank",
      "Test Account",
    ]
  );
  return result.rows[0];
}

export async function createTestRFQ(
  overrides: Partial<{
    userId: string;
    productId: string;
    quantity: number;
    status: string;
  }> = {}
) {
  const result = await query(
    `INSERT INTO rfqs (user_id, product_id, quantity, status, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.userId,
      overrides.productId || null,
      overrides.quantity || 1,
      overrides.status || "pending",
      "Test RFQ for QA validation",
    ]
  );
  return result.rows[0];
}

// Pre-computed argon2id hash of "TestPass123!" — avoids ~1.3s hashing per user
const FAST_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder";

/**
 * Fast user creation that skips argon2 hashing. Use when tests authenticate
 * via JWT tokens (generateToken) and never verify passwords.
 */
export async function createTestUserFast(
  overrides: Partial<{
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    phone: string;
    companyId: string;
    companyRole: string;
    accountStatus: string;
  }> = {}
) {
  const email = overrides.email || makeEmail("user");
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, phone,
      company_id, company_role, account_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW(), account_status = EXCLUDED.account_status,
       company_id = EXCLUDED.company_id
     RETURNING id, email, first_name, last_name, role, company_id, company_role, account_status`,
    [
      email,
      FAST_PASSWORD_HASH,
      overrides.firstName || "Test",
      overrides.lastName || "User",
      overrides.role || "customer",
      overrides.phone || "0800000000",
      overrides.companyId || null,
      overrides.companyRole || "company_admin",
      overrides.accountStatus || "active",
    ]
  );
  return result.rows[0];
}

export function generateToken(userId: string, role: string): string {
  const jwt = require("jsonwebtoken");
  const { config } = require("../config");
  return jwt.sign({ userId, role }, config.jwtSecret, { expiresIn: "1h" });
}

export async function cleanupTestData() {
  // Delete all test data in reverse dependency order
  const tables = [
    "vetting_audit_log",
    "vetting_responses",
    "vetting_submissions",
    "procurement_list_items",
    "procurement_lists",
    "notifications",
    "company_prices",
    "product_attachments",
    "quotation_events",
    "quotation_items",
    "quotations",
    "order_status_history",
    "order_payments",
    "bank_transfers",
    "invoices",
    "activities",
    "orders",
    "scout_quotes",
    "scout_requests",
    "rfqs",
    "product_images",
    "product_attributes",
    "cart_items",
    "carts",
    "products",
    "categories",
    "provider_profiles",
    "subscription_events",
    "company_subscriptions",
    "verification_documents",
    "audit_logs",
    "activity_logs",
    "companies",
  ];

  for (const table of tables) {
    await query(`DELETE FROM ${table} WHERE id::text LIKE '${TEST_PREFIX}%' OR email LIKE '${TEST_PREFIX}%' OR order_number LIKE 'ORD-TEST-%' OR invoice_number LIKE 'INV-TEST-%' OR quotation_number LIKE 'QTN-TEST-%' OR transfer_reference LIKE 'TFR-TEST-%' OR name LIKE '${TEST_PREFIX}%'`).catch(() => {});
  }

  // Delete test users
  await query(`DELETE FROM users WHERE email LIKE '${TEST_PREFIX}%'`).catch(() => {});
}
