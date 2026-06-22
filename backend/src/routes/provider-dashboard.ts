import { Router, Response } from "express";
import { query } from "../config/db";
import { authenticate, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { computeSupplierScore } from "../services/supplier-scoring";
import { businessProfileCompletion, getBusinessProfile } from "../services/business-profile";

const router = Router();

/** Allowed roles for mutating catalog (create/update/toggle/inventory/availability). */
const MUTATE_ROLES = new Set(["company_admin"]);

async function resolveProviderCompany(req: AuthRequest, res: Response, requireVerified = true): Promise<{ companyId: string; role: string } | null> {
  // Super admins bypass all provider checks
  if (req.userRole === "super_admin") {
    const userResult = await query(
      "SELECT company_id, company_role FROM users WHERE id = $1",
      [req.userId]
    );
    if (!userResult.rows[0]?.company_id) {
      res.status(403).json({ error: "No company" });
      return null;
    }
    return { companyId: userResult.rows[0].company_id, role: userResult.rows[0].company_role || "company_admin" };
  }

  const userResult = await query(
    "SELECT company_id, company_role, account_status FROM users WHERE id = $1",
    [req.userId]
  );
  if (!userResult.rows[0]?.company_id) {
    res.status(403).json({ error: "No company" });
    return null;
  }
  if (userResult.rows[0].account_status !== "active") {
    res.status(403).json({ error: "Account not active" });
    return null;
  }
  const companyId = userResult.rows[0].company_id;
  const companyRole = userResult.rows[0].company_role;

  const company = (await query(
    "SELECT is_provider, verification_status, status FROM companies WHERE id = $1",
    [companyId]
  )).rows[0];
  if (!company?.is_provider) {
    res.status(403).json({ error: "Not a provider company" });
    return null;
  }
  if (company.status !== "active") {
    res.status(403).json({ error: "Company not active" });
    return null;
  }
  if (requireVerified && company.verification_status !== "approved") {
    res.status(403).json({ error: "Provider not yet verified" });
    return null;
  }
  return { companyId, role: companyRole };
}

function requireMutateRole(role: string, res: Response): boolean {
  if (!MUTATE_ROLES.has(role)) {
    res.status(403).json({ error: "Insufficient permissions to modify catalog" });
    return false;
  }
  return true;
}

/* ── Dashboard overview ── */
router.get("/provider/dashboard", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res, false);
    if (!ctx) return;

    const [productCount, serviceCount, recentProducts, recentServices, businessProfile] = await Promise.all([
      query("SELECT COUNT(*) as cnt FROM products WHERE provider_company_id = $1 AND is_active = true", [ctx.companyId]),
      query("SELECT COUNT(*) as cnt FROM services WHERE provider_company_id = $1 AND is_active = true", [ctx.companyId]),
      query(
        `SELECT id, name, slug, price, stock_status, is_active, created_at
         FROM products WHERE provider_company_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [ctx.companyId]
      ),
      query(
        `SELECT id, name, slug, pricing_model, starting_price, is_active, created_at
         FROM services WHERE provider_company_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [ctx.companyId]
      ),
      getBusinessProfile(ctx.companyId),
    ]);

    res.json({
      stats: {
        products: parseInt(productCount.rows[0].cnt),
        services: parseInt(serviceCount.rows[0].cnt),
      },
      recentProducts: recentProducts.rows,
      recentServices: recentServices.rows,
      businessProfile: businessProfile ? businessProfileCompletion(businessProfile) : null,
    });
  } catch (err) {
    console.error("Provider dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

/* ── Provider operations summary ── */
router.get("/provider/operations/summary", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;

    const [
      incomingRequests,
      quotedCount,
      acceptedCount,
      declinedCount,
      creditProfile,
    ] = await Promise.all([
      query(
        `SELECT COUNT(*) as count FROM procurement_request_providers prp
         JOIN procurement_requests pr ON pr.id = prp.request_id
         WHERE prp.provider_company_id = $1 AND prp.status = 'invited'`,
        [ctx.companyId]
      ),
      query(
        `SELECT COUNT(*) as count FROM procurement_request_providers
         WHERE provider_company_id = $1 AND status = 'quoted'`,
        [ctx.companyId]
      ),
      query(
        `SELECT COUNT(*) as count FROM procurement_request_providers
         WHERE provider_company_id = $1 AND status = 'selected'`,
        [ctx.companyId]
      ),
      query(
        `SELECT COUNT(*) as count FROM procurement_request_providers
         WHERE provider_company_id = $1 AND status = 'declined'`,
        [ctx.companyId]
      ),
      query(
        "SELECT vetting_status, credit_tier, credit_limit, next_review_at FROM supplier_credit_profiles WHERE company_id = $1",
        [ctx.companyId]
      ),
    ]);

    res.json({
      incomingRequests: parseInt(incomingRequests.rows[0].count),
      quotedCount: parseInt(quotedCount.rows[0].count),
      acceptedCount: parseInt(acceptedCount.rows[0].count),
      declinedCount: parseInt(declinedCount.rows[0].count),
      creditProfile: creditProfile.rows[0] || null,
    });
  } catch (err) {
    console.error("Provider operations summary error:", err);
    res.status(500).json({ error: "Failed to load operations summary" });
  }
});

/* ── List own products ── */
router.get("/provider/products", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;

    const { page = "1", limit = "20", search, status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [ctx.companyId];
    const conds: string[] = ["p.provider_company_id = $1"];

    if (search) { params.push(`%${search}%`); conds.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`); }
    if (status === "active") { conds.push("p.is_active = true"); }
    else if (status === "inactive") { conds.push("p.is_active = false"); }

    const where = `WHERE ${conds.join(" AND ")}`;

    const countResult = await query(`SELECT COUNT(*) FROM products p ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT p.*, c.name as category_name,
              (SELECT COALESCE(json_agg(json_build_object('id', od.id, 'document_type', od.document_type, 'file_name', od.file_name, 'created_at', od.created_at)), '[]'::json)
               FROM offering_documents od
               WHERE od.offering_type = 'PRODUCT' AND od.offering_id = p.id AND od.is_active = true
              ) as documents
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      products: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Provider products list error:", err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

/* ── Create product ── */
router.post("/provider/products", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const { name, description, categoryId, price, sku, stockStatus, priceVisibility, minimumOrderQuantity, creditEligible, images, brand, model, warrantyInformation, deliveryCoverage, creditTerms, visibilityStatus, quoteOnly } = req.body;

    if (!name) return res.status(400).json({ error: "Product name is required" });
    if (price == null) return res.status(400).json({ error: "Price is required" });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
    const productSku = sku || `BC-${ctx.companyId.substring(0, 6)}-${Date.now()}`;

    const result = await query(
      `INSERT INTO products (name, slug, description, category_id, price, sku, stock_status,
        is_active, provider_company_id, price_visibility, minimum_order_quantity, credit_eligible, images,
        brand, model, warranty_information, delivery_coverage, credit_terms, visibility_status, quote_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [name, slug, description || null, categoryId || null, price, productSku, stockStatus || "in_stock",
       ctx.companyId, priceVisibility || "public", minimumOrderQuantity || 1, creditEligible || false, images || null,
       brand || null, model || null, warrantyInformation || null, deliveryCoverage || null,
       creditTerms || null, visibilityStatus || "public", quoteOnly ?? false]
    );

    res.status(201).json({ product: result.rows[0] });
  } catch (err) {
    console.error("Provider create product error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
});

/* ── Update product ── */
router.put("/provider/products/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const existing = await query(
      "SELECT id FROM products WHERE id = $1 AND provider_company_id = $2",
      [req.params.id, ctx.companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    const { name, description, categoryId, price, sku, stockStatus, priceVisibility, minimumOrderQuantity, creditEligible, isActive, images, brand, model, warrantyInformation, deliveryCoverage, creditTerms, visibilityStatus, quoteOnly } = req.body;

    const result = await query(
      `UPDATE products SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category_id = COALESCE($3, category_id),
        price = COALESCE($4, price),
        sku = COALESCE($5, sku),
        stock_status = COALESCE($6, stock_status),
        price_visibility = COALESCE($7, price_visibility),
        minimum_order_quantity = COALESCE($8, minimum_order_quantity),
        credit_eligible = COALESCE($9, credit_eligible),
        is_active = COALESCE($10, is_active),
        images = COALESCE($11, images),
        brand = COALESCE($12, brand),
        model = COALESCE($13, model),
        warranty_information = COALESCE($14, warranty_information),
        delivery_coverage = COALESCE($15, delivery_coverage),
        credit_terms = COALESCE($16, credit_terms),
        visibility_status = COALESCE($17, visibility_status),
        quote_only = COALESCE($18, quote_only),
        updated_at = NOW()
       WHERE id = $19 AND provider_company_id = $20
       RETURNING *`,
      [name || null, description !== undefined ? description : null, categoryId || null,
       price !== undefined ? price : null, sku || null, stockStatus || null,
       priceVisibility || null, minimumOrderQuantity !== undefined ? minimumOrderQuantity : null,
       creditEligible !== undefined ? creditEligible : null,
       isActive !== undefined ? isActive : null, images !== undefined ? images : null,
       brand || null, model || null, warrantyInformation || null,
       deliveryCoverage || null, creditTerms || null,
       visibilityStatus || null, quoteOnly !== undefined ? quoteOnly : null,
       req.params.id, ctx.companyId]
    );

    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error("Provider update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

/* ── Toggle product active status ── */
router.patch("/provider/products/:id/toggle", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const result = await query(
      `UPDATE products SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND provider_company_id = $2
       RETURNING id, is_active`,
      [req.params.id, ctx.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Product not found" });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error("Provider toggle product error:", err);
    res.status(500).json({ error: "Failed to toggle product" });
  }
});

/* ── Update inventory (stock + availability) ── */
router.patch("/provider/products/:id/inventory", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const existing = await query(
      "SELECT id FROM products WHERE id = $1 AND provider_company_id = $2",
      [req.params.id, ctx.companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Product not found" });

    const { stockStatus, stockQuantity } = req.body;
    await query(
      `UPDATE products SET stock_status = COALESCE($1, stock_status),
        minimum_order_quantity = COALESCE($2, minimum_order_quantity),
        updated_at = NOW()
       WHERE id = $3 AND provider_company_id = $4`,
      [stockStatus || null, stockQuantity != null ? stockQuantity : null, req.params.id, ctx.companyId]
    );

    const updated = (await query("SELECT id, name, stock_status, minimum_order_quantity FROM products WHERE id = $1", [req.params.id])).rows[0];
    res.json({ product: updated });
  } catch (err) {
    console.error("Provider inventory error:", err);
    res.status(500).json({ error: "Failed to update inventory" });
  }
});

/* ── List own services ── */
router.get("/provider/services", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;

    const { page = "1", limit = "20", search, status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [ctx.companyId];
    const conds: string[] = ["s.provider_company_id = $1"];

    if (search) { params.push(`%${search}%`); conds.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }
    if (status === "active") { conds.push("s.is_active = true"); }
    else if (status === "inactive") { conds.push("s.is_active = false"); }

    const where = `WHERE ${conds.join(" AND ")}`;

    const countResult = await query(`SELECT COUNT(*) FROM services s ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT s.*, cat.name as category_name,
              (SELECT COALESCE(json_agg(json_build_object('id', od.id, 'document_type', od.document_type, 'file_name', od.file_name, 'created_at', od.created_at)), '[]'::json)
               FROM offering_documents od
               WHERE od.offering_type = 'SERVICE' AND od.offering_id = s.id AND od.is_active = true
              ) as documents
       FROM services s
       LEFT JOIN categories cat ON s.category_id = cat.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      services: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Provider services list error:", err);
    res.status(500).json({ error: "Failed to list services" });
  }
});

/* ── Get single service ── */
router.get("/provider/services/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;

    const result = await query(
      `SELECT s.*, cat.name as category_name
       FROM services s
       LEFT JOIN categories cat ON s.category_id = cat.id
       WHERE s.id = $1 AND s.provider_company_id = $2`,
      [req.params.id, ctx.companyId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Service not found" });

    res.json({ service: result.rows[0] });
  } catch (err) {
    console.error("Provider get service error:", err);
    res.status(500).json({ error: "Failed to load service" });
  }
});

/* ── Create service ── */
router.post("/provider/services", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const { name, description, categoryId, serviceType, serviceAreas, pricingModel, startingPrice, priceVisibility, minimumJobValue, estimatedResponseTime, creditEligible, images, coverageArea, contractType, teamSizeOrCapacity, industriesServed, certificationsOrLicenses, equipmentOrToolsAvailable, experienceSummary, visibilityStatus, quoteOnly } = req.body;

    if (!name) return res.status(400).json({ error: "Service name is required" });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();

    const result = await query(
      `INSERT INTO services (provider_company_id, name, slug, description, category_id,
        service_type, service_areas, pricing_model, starting_price, price_visibility,
        minimum_job_value, estimated_response_time, credit_eligible, is_active, images,
        coverage_area, contract_type, team_size_or_capacity, industries_served,
        certifications_or_licenses, equipment_or_tools_available, experience_summary,
        visibility_status, quote_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING *`,
      [ctx.companyId, name, slug, description || null, categoryId || null,
       serviceType || null, serviceAreas || null, pricingModel || "quote_only",
       startingPrice || null, priceVisibility || "public",
       minimumJobValue || null, estimatedResponseTime || null,
       creditEligible || false, images || null,
       coverageArea || null, contractType || null, teamSizeOrCapacity || null,
       industriesServed || null, certificationsOrLicenses || null,
       equipmentOrToolsAvailable || null, experienceSummary || null,
       visibilityStatus || "public", quoteOnly ?? false]
    );

    res.status(201).json({ service: result.rows[0] });
  } catch (err) {
    console.error("Provider create service error:", err);
    res.status(500).json({ error: "Failed to create service" });
  }
});

/* ── Update service ── */
router.put("/provider/services/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const existing = await query(
      "SELECT id FROM services WHERE id = $1 AND provider_company_id = $2",
      [req.params.id, ctx.companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Service not found" });

    const { name, description, categoryId, serviceType, serviceAreas, pricingModel, startingPrice, priceVisibility, minimumJobValue, estimatedResponseTime, creditEligible, isActive, images, coverageArea, contractType, teamSizeOrCapacity, industriesServed, certificationsOrLicenses, equipmentOrToolsAvailable, experienceSummary, visibilityStatus, quoteOnly } = req.body;

    const result = await query(
      `UPDATE services SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        category_id = COALESCE($3, category_id),
        service_type = COALESCE($4, service_type),
        service_areas = COALESCE($5, service_areas),
        pricing_model = COALESCE($6, pricing_model),
        starting_price = COALESCE($7, starting_price),
        price_visibility = COALESCE($8, price_visibility),
        minimum_job_value = COALESCE($9, minimum_job_value),
        estimated_response_time = COALESCE($10, estimated_response_time),
        credit_eligible = COALESCE($11, credit_eligible),
        is_active = COALESCE($12, is_active),
        images = COALESCE($13, images),
        coverage_area = COALESCE($14, coverage_area),
        contract_type = COALESCE($15, contract_type),
        team_size_or_capacity = COALESCE($16, team_size_or_capacity),
        industries_served = COALESCE($17, industries_served),
        certifications_or_licenses = COALESCE($18, certifications_or_licenses),
        equipment_or_tools_available = COALESCE($19, equipment_or_tools_available),
        experience_summary = COALESCE($20, experience_summary),
        visibility_status = COALESCE($21, visibility_status),
        quote_only = COALESCE($22, quote_only),
        updated_at = NOW()
       WHERE id = $23 AND provider_company_id = $24
       RETURNING *`,
      [name || null, description !== undefined ? description : null, categoryId || null,
       serviceType || null, serviceAreas || null, pricingModel || null,
       startingPrice !== undefined ? startingPrice : null, priceVisibility || null,
       minimumJobValue !== undefined ? minimumJobValue : null, estimatedResponseTime || null,
       creditEligible !== undefined ? creditEligible : null,
       isActive !== undefined ? isActive : null, images !== undefined ? images : null,
       coverageArea || null, contractType || null, teamSizeOrCapacity || null,
       industriesServed || null, certificationsOrLicenses || null,
       equipmentOrToolsAvailable || null, experienceSummary || null,
       visibilityStatus || null, quoteOnly !== undefined ? quoteOnly : null,
       req.params.id, ctx.companyId]
    );

    res.json({ service: result.rows[0] });
  } catch (err) {
    console.error("Provider update service error:", err);
    res.status(500).json({ error: "Failed to update service" });
  }
});

/* ── Toggle service active status ── */
router.patch("/provider/services/:id/toggle", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const result = await query(
      `UPDATE services SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1 AND provider_company_id = $2
       RETURNING id, is_active`,
      [req.params.id, ctx.companyId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Service not found" });
    res.json({ service: result.rows[0] });
  } catch (err) {
    console.error("Provider toggle service error:", err);
    res.status(500).json({ error: "Failed to toggle service" });
  }
});

/* ── Update service availability ── */
router.patch("/provider/services/:id/availability", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    if (!requireMutateRole(ctx.role, res)) return;

    const existing = await query(
      "SELECT id FROM services WHERE id = $1 AND provider_company_id = $2",
      [req.params.id, ctx.companyId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: "Service not found" });

    const { availabilityStatus, minimumJobValue } = req.body;
    await query(
      `UPDATE services SET availability_status = COALESCE($1, availability_status),
        minimum_job_value = COALESCE($2, minimum_job_value),
        updated_at = NOW()
       WHERE id = $3 AND provider_company_id = $4`,
      [availabilityStatus || null, minimumJobValue != null ? minimumJobValue : null, req.params.id, ctx.companyId]
    );

    const updated = (await query("SELECT id, name, availability_status, minimum_job_value FROM services WHERE id = $1", [req.params.id])).rows[0];
    res.json({ service: updated });
  } catch (err) {
    console.error("Provider service availability error:", err);
    res.status(500).json({ error: "Failed to update availability" });
  }
});

/* ── Provider self-score ── */
router.get("/provider/supplier-score", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    const result = await computeSupplierScore(ctx.companyId);
    res.json(result);
  } catch (err) {
    console.error("Provider supplier score error:", err);
    res.status(500).json({ error: "Failed to compute supplier score" });
  }
});

/* ── Marketplace readiness check ── */
router.get("/provider/readiness", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;

    type ReadinessItem = { id: string; name: string; offeringType: "PRODUCT" | "SERVICE"; issues: string[]; status: "ready" | "needs_work" | "draft" };

    const products = await query(
      `SELECT p.id, p.name, p.is_active, p.category_id, p.description, p.price, p.images, p.brand, p.model,
              p.delivery_coverage, p.warranty_information, p.credit_terms, p.stock_status, p.visibility_status,
              (SELECT COUNT(*)::int FROM offering_documents od WHERE od.offering_type = 'PRODUCT' AND od.offering_id = p.id AND od.is_active = true)
       FROM products p WHERE p.provider_company_id = $1`,
      [ctx.companyId]
    );

    const services = await query(
      `SELECT s.id, s.name, s.is_active, s.category_id, s.description, s.starting_price, s.images,
              s.coverage_area, s.estimated_response_time, s.visibility_status, s.contract_type,
              s.certifications_or_licenses, s.industries_served, s.experience_summary,
              (SELECT COUNT(*)::int FROM offering_documents od WHERE od.offering_type = 'SERVICE' AND od.offering_id = s.id AND od.is_active = true)
       FROM services s WHERE s.provider_company_id = $1`,
      [ctx.companyId]
    );

    const evaluate = (row: any, type: "PRODUCT" | "SERVICE"): ReadinessItem => {
      const issues: string[] = [];
      if (!row.is_active) issues.push("Draft/private");
      if (!row.category_id) issues.push("Missing category");
      if (!row.description) issues.push("Missing description");
      if (!row.images) issues.push("Missing image");
      if (type === "PRODUCT") {
        if (!row.price) issues.push("Missing price");
        if (!row.brand || !row.model) issues.push("Missing brand/model");
        if (!row.delivery_coverage) issues.push("Missing delivery coverage");
        if (row.doc_count === 0) issues.push("No technical documents");
      } else {
        if (!row.starting_price) issues.push("Missing starting price");
        if (!row.coverage_area) issues.push("Missing coverage area");
        if (!row.estimated_response_time) issues.push("Missing response time");
        if (row.doc_count === 0) issues.push("No supporting documents");
      }
      const status = row.is_active && issues.filter(i => !i.startsWith("Draft")).length <= 1 ? "ready" :
                     row.is_active ? "needs_work" : "draft";
      return { id: row.id, name: row.name, offeringType: type, issues, status };
    };

    res.json({
      products: products.rows.map((r: any) => evaluate(r, "PRODUCT")),
      services: services.rows.map((r: any) => evaluate(r, "SERVICE")),
    });
  } catch (err) {
    console.error("Provider readiness error:", err);
    res.status(500).json({ error: "Failed to check readiness" });
  }
});

router.get("/provider/commissions", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await resolveProviderCompany(req, res);
    if (!ctx) return;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [count, summary, rows] = await Promise.all([
      query("SELECT COUNT(*)::int FROM commission_ledger WHERE provider_company_id = $1", [ctx.companyId]),
      query(
        `SELECT COALESCE(SUM(base_amount), 0)::numeric(12,2) as base_total,
                COALESCE(SUM(commission_amount), 0)::numeric(12,2) as commission_total
         FROM commission_ledger WHERE provider_company_id = $1`,
        [ctx.companyId]
      ),
      query(
        `SELECT cl.*, o.order_number, buyer.name as buyer_name, cat.name as category_name
         FROM commission_ledger cl
         JOIN orders o ON o.id = cl.order_id
         JOIN companies buyer ON buyer.id = cl.buyer_company_id
         LEFT JOIN categories cat ON cat.id = cl.category_id
         WHERE cl.provider_company_id = $1
         ORDER BY cl.accrued_at DESC
         LIMIT $2 OFFSET $3`,
        [ctx.companyId, limit, offset]
      ),
    ]);

    const total = count.rows[0].count;
    res.json({
      summary: {
        baseTotal: Number(summary.rows[0].base_total),
        commissionTotal: Number(summary.rows[0].commission_total),
      },
      commissions: rows.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Provider commissions error:", err);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

export default router;
export { resolveProviderCompany };
