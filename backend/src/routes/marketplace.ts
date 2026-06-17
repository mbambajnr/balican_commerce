import { Router, Request, Response } from "express";
import { query } from "../config/db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { computeSupplierScore } from "../services/supplier-scoring";
import { resolveAuthSession } from "../services/auth-session";

const router = Router();

/**
 * Resolve price visibility for a product or service.
 * - quote_only → always null for non-admin
 * - approved_buyers_only → null unless requester is from an approved buyer company
 * - public → always visible
 */
async function resolvePrice(
  price: number | null | undefined,
  priceVisibility: string | null | undefined,
  req: Request
): Promise<number | null> {
  if (price == null) return null;
  if (priceVisibility === "quote_only") return null;
  if (priceVisibility === "approved_buyers_only") {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    try {
      const session = await resolveAuthSession(authHeader.split(" ")[1]);
      if (!session) return null;
      if (session.role === "admin" || session.role === "super_admin") return price;
      const userResult = await query(
        `SELECT u.company_id, c.is_buyer, c.company_type
         FROM users u JOIN companies c ON u.company_id = c.id
         WHERE u.id = $1 AND c.status = 'active'`,
        [session.userId]
      );
      if (userResult.rows.length > 0 && (userResult.rows[0].is_buyer || userResult.rows[0].company_type === 'buyer')) {
        return price;
      }
      return null;
    } catch {
      return null;
    }
  }
  return price;
}

/** Check if a request comes from an admin user. */
async function isAdminRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  try {
    const session = await resolveAuthSession(authHeader.split(" ")[1]);
    return session?.role === "admin" || session?.role === "super_admin";
  } catch {
    return false;
  }
}

/* ── List approved providers ── */
router.get("/marketplace/providers", async (req: Request, res: Response) => {
  try {
    const { type, region, category, search, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [
      "c.status = 'active'",
      "c.is_provider = true",
      "c.verification_status = 'approved'",
    ];

    if (type) {
      params.push(type);
      conds.push(`pp.provider_type = $${params.length}::provider_type`);
    }
    if (region) {
      params.push(`%${region}%`);
      conds.push(`($${params.length} = ANY(pp.service_areas) OR $${params.length} = ANY(c.service_areas))`);
    }
    if (category) {
      params.push(category);
      conds.push(`$${params.length} = ANY(c.business_categories)`);
    }
    if (search) {
      params.push(`%${search}%`);
      conds.push(`(c.name ILIKE $${params.length} OR pp.display_name ILIKE $${params.length})`);
    }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*) FROM companies c
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT c.id, c.name, c.description, c.website, c.logo_url, c.business_categories,
              c.service_areas, c.years_in_business, c.city, c.state, c.country,
              c.verified_until,
              pp.id as profile_id, pp.display_name, pp.provider_type,
              pp.industries_served, pp.service_areas as profile_service_areas,
              pp.years_experience, pp.certifications, pp.verification_badge,
              pp.rating_average, pp.completed_orders_count, pp.completed_jobs_count,
              pp.credit_available,
              scp.credit_tier,
              (SELECT COUNT(*) FROM products p WHERE p.provider_company_id = c.id AND p.is_active = true) as product_count,
              (SELECT COUNT(*) FROM services s WHERE s.provider_company_id = c.id AND s.is_active = true) as service_count
       FROM companies c
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       LEFT JOIN supplier_credit_profiles scp ON scp.company_id = c.id
       ${where}
       ORDER BY pp.rating_average DESC NULLS LAST, c.name ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      providers: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("List providers error:", err);
    res.status(500).json({ error: "Failed to list providers" });
  }
});

/* ── Single provider detail ── */
router.get("/marketplace/providers/:id", async (req: Request, res: Response) => {
  try {
    const providerResult = await query(
      `SELECT c.id, c.name, c.description, c.website, c.logo_url, c.business_categories,
              c.service_areas, c.years_in_business, c.address, c.city, c.state, c.country,
              c.email, c.phone, c.contact_person_name, c.verified_until,
              pp.id as profile_id, pp.display_name, pp.provider_type,
              pp.description as profile_description, pp.industries_served,
              pp.service_areas as profile_service_areas, pp.operating_regions,
              pp.years_experience, pp.certifications, pp.licenses,
              pp.portfolio_images, pp.verification_badge,
              pp.rating_average, pp.completed_orders_count, pp.completed_jobs_count,
              pp.credit_available,
              scp.credit_tier, scp.vetting_status as supplier_credit_status
       FROM companies c
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       LEFT JOIN supplier_credit_profiles scp ON scp.company_id = c.id
       WHERE c.id = $1 AND c.status = 'active' AND c.is_provider = true
         AND c.verification_status = 'approved'`,
      [req.params.id]
    );
    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const provider = providerResult.rows[0];

    const products = (await query(
      `SELECT id, name, slug, description, category_id, price, price_visibility,
              images, stock_status, minimum_order_quantity, credit_eligible,
              created_at
       FROM products
       WHERE provider_company_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [provider.id]
    )).rows;

    // Resolve prices for products
    const resolvedProducts = await Promise.all(products.map(async (p: any) => {
      const resolvedPrice = await resolvePrice(p.price, p.price_visibility, req);
      const { price_visibility, ...rest } = p;
      return { ...rest, price: resolvedPrice };
    }));

    const services = (await query(
      `SELECT s.id, s.name, s.slug, s.description, s.category_id, s.service_type,
              s.pricing_model, s.starting_price, s.price_visibility,
              s.minimum_job_value, s.estimated_response_time, s.credit_eligible,
              s.images, s.created_at,
              cat.name as category_name, cat.slug as category_slug
       FROM services s
       LEFT JOIN categories cat ON s.category_id = cat.id
       WHERE s.provider_company_id = $1 AND s.is_active = true
       ORDER BY s.created_at DESC`,
      [provider.id]
    )).rows;

    // Resolve prices for services
    const resolvedServices = await Promise.all(services.map(async (s: any) => {
      const resolvedPrice = await resolvePrice(s.starting_price, s.price_visibility, req);
      const { price_visibility, ...rest } = s;
      return { ...rest, starting_price: resolvedPrice };
    }));

    res.json({ provider, products: resolvedProducts, services: resolvedServices });
  } catch (err) {
    console.error("Provider detail error:", err);
    res.status(500).json({ error: "Failed to load provider" });
  }
});

/* ── List marketplace products ── */
router.get("/marketplace/products", async (req: Request, res: Response) => {
  try {
    const { category, search, provider_id, price_min, price_max, credit, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [
      "p.is_active = true",
      "c.status = 'active'",
      "c.is_provider = true",
      "c.verification_status = 'approved'",
    ];

    if (category) { params.push(category); conds.push(`p.category_id = $${params.length}::uuid`); }
    if (search) { params.push(`%${search}%`); conds.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`); }
    if (provider_id) { params.push(provider_id); conds.push(`p.provider_company_id = $${params.length}::uuid`); }
    if (credit === "true") { conds.push("p.credit_eligible = true"); }
    if (price_min) { params.push(parseFloat(price_min as string)); conds.push(`p.price >= $${params.length}`); }
    if (price_max) { params.push(parseFloat(price_max as string)); conds.push(`p.price <= $${params.length}`); }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*) FROM products p
       JOIN companies c ON p.provider_company_id = c.id
       ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT p.id, p.name, p.slug, p.description, p.category_id, p.price,
              p.price_visibility, p.images, p.stock_status, p.minimum_order_quantity,
              p.credit_eligible, p.created_at,
              c.id as provider_id, c.name as provider_name, c.logo_url as provider_logo,
              pp.rating_average as provider_rating, pp.verification_badge,
              (SELECT COALESCE(json_agg(DISTINCT od.document_type), '[]'::json)
               FROM offering_documents od
               WHERE od.offering_type = 'PRODUCT' AND od.offering_id = p.id
                 AND od.is_active = true AND od.is_public = true
              ) as document_badges
       FROM products p
       JOIN companies c ON p.provider_company_id = c.id
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    // Resolve prices — remove price_visibility from response, nullify hidden prices
    const resolvedProducts = await Promise.all(result.rows.map(async (p: any) => {
      const resolvedPrice = await resolvePrice(p.price, p.price_visibility, req);
      const { price_visibility, ...rest } = p;
      return { ...rest, price: resolvedPrice };
    }));

    res.json({
      products: resolvedProducts,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Marketplace products error:", err);
    res.status(500).json({ error: "Failed to list products" });
  }
});

/* ── Suppliers selling a product (same name, different providers) ── */
router.get("/marketplace/products/:id/suppliers", async (req: Request, res: Response) => {
  try {
    const productResult = await query(
      `SELECT id, name, provider_company_id FROM products WHERE id = $1 AND is_active = true`,
      [req.params.id]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    const product = productResult.rows[0];

    const result = await query(
      `SELECT c.id, c.name, c.logo_url, c.description, c.website, c.city, c.state, c.country,
              pp.verification_badge, pp.rating_average, pp.completed_orders_count,
              pp.completed_jobs_count, pp.credit_available,
              scp.credit_tier, scp.vetting_status as supplier_credit_status,
              p.id as product_id, p.price, p.price_visibility, p.slug as product_slug
       FROM products p
       JOIN companies c ON p.provider_company_id = c.id
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       LEFT JOIN supplier_credit_profiles scp ON scp.company_id = c.id
       WHERE p.name = $1
         AND p.is_active = true
         AND c.status = 'active'
         AND c.is_provider = true
         AND c.verification_status = 'approved'
       ORDER BY pp.rating_average DESC NULLS LAST, c.name ASC`,
      [product.name]
    );

    const resolvedSuppliers = await Promise.all(result.rows.map(async (row: any) => {
      const resolvedPrice = await resolvePrice(row.price, row.price_visibility, req);
      const { price, price_visibility, ...rest } = row;
      const scoring = await computeSupplierScore(row.id);
      return { ...rest, price: resolvedPrice, ...scoring };
    }));

    // Sort by supplierScore descending (buyer-facing default)
    resolvedSuppliers.sort((a, b) => b.supplierScore - a.supplierScore);

    res.json({ suppliers: resolvedSuppliers });
  } catch (err) {
    console.error("Get product suppliers error:", err);
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

/* ── List marketplace services ── */
router.get("/marketplace/services", async (req: Request, res: Response) => {
  try {
    const { category, search, provider_id, credit, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [
      "s.is_active = true",
      "c.status = 'active'",
      "c.is_provider = true",
      "c.verification_status = 'approved'",
    ];

    if (category) { params.push(category); conds.push(`s.category_id = $${params.length}::uuid`); }
    if (search) { params.push(`%${search}%`); conds.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }
    if (provider_id) { params.push(provider_id); conds.push(`s.provider_company_id = $${params.length}::uuid`); }
    if (credit === "true") { conds.push("s.credit_eligible = true"); }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*) FROM services s
       JOIN companies c ON s.provider_company_id = c.id
       ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT s.id, s.name, s.slug, s.description, s.category_id, s.service_type,
              s.pricing_model, s.starting_price, s.price_visibility,
              s.minimum_job_value, s.estimated_response_time, s.credit_eligible,
              s.images, s.created_at,
              cat.name as category_name, cat.slug as category_slug,
              c.id as provider_id, c.name as provider_name, c.logo_url as provider_logo,
              pp.rating_average as provider_rating, pp.verification_badge,
              (SELECT COALESCE(json_agg(DISTINCT od.document_type), '[]'::json)
               FROM offering_documents od
               WHERE od.offering_type = 'SERVICE' AND od.offering_id = s.id
                 AND od.is_active = true AND od.is_public = true
              ) as document_badges
       FROM services s
       JOIN companies c ON s.provider_company_id = c.id
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       LEFT JOIN categories cat ON s.category_id = cat.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    const resolvedServices = await Promise.all(result.rows.map(async (s: any) => {
      const resolvedPrice = await resolvePrice(s.starting_price, s.price_visibility, req);
      const { price_visibility, ...rest } = s;
      return { ...rest, starting_price: resolvedPrice };
    }));

    res.json({
      services: resolvedServices,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Marketplace services error:", err);
    res.status(500).json({ error: "Failed to list services" });
  }
});

/* ── Service detail ── */
router.get("/marketplace/services/slug/:slug", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT s.id, s.name, s.slug, s.description, s.category_id, s.service_type,
              s.pricing_model, s.starting_price, s.price_visibility,
              s.minimum_job_value, s.estimated_response_time, s.credit_eligible,
              s.images, s.created_at,
              cat.name as category_name, cat.slug as category_slug,
              c.id as provider_id, c.name as provider_name, c.logo_url as provider_logo,
              pp.rating_average as provider_rating, pp.verification_badge,
              (SELECT COALESCE(json_agg(DISTINCT od.document_type), '[]'::json)
               FROM offering_documents od
               WHERE od.offering_type = 'SERVICE' AND od.offering_id = s.id
                 AND od.is_active = true AND od.is_public = true
              ) as document_badges
       FROM services s
       JOIN companies c ON s.provider_company_id = c.id
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       LEFT JOIN categories cat ON s.category_id = cat.id
       WHERE s.slug = $1 AND s.is_active = true
         AND c.status = 'active' AND c.verification_status = 'approved'`,
      [req.params.slug]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Service not found" });

    const svc = result.rows[0];
    const resolvedPrice = await resolvePrice(svc.starting_price, svc.price_visibility, req);
    const { price_visibility, ...rest } = svc;
    res.json({ service: { ...rest, starting_price: resolvedPrice } });
  } catch (err) {
    console.error("Service detail error:", err);
    res.status(500).json({ error: "Failed to load service" });
  }
});

/* ── Marketplace categories (product + service) ── */
router.get("/marketplace/categories", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let typeFilter = "";
    if (type === "product") { typeFilter = "AND (cat.type = 'product' OR cat.type = 'both')"; }
    else if (type === "service") { typeFilter = "AND (cat.type = 'service' OR cat.type = 'both')"; }

    const cats = await query(
      `SELECT cat.id, cat.name, cat.slug, cat.type, cat.parent_category_id, cat.image_url,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = cat.id AND p.is_active = true) as product_count,
              (SELECT COUNT(*) FROM services s WHERE s.category_id = cat.id AND s.is_active = true) as service_count
       FROM categories cat
       WHERE cat.is_active = true ${typeFilter}
       ORDER BY cat.sort_order ASC, cat.name ASC`
    );

    const providers = await query(
      `SELECT c.id, c.name, c.logo_url, c.city, c.state,
              pp.provider_type, pp.rating_average, pp.verification_badge,
              (SELECT COUNT(*) FROM products p WHERE p.provider_company_id = c.id AND p.is_active = true) as product_count,
              (SELECT COUNT(*) FROM services s WHERE s.provider_company_id = c.id AND s.is_active = true) as service_count
       FROM companies c
       LEFT JOIN provider_profiles pp ON pp.company_id = c.id
       WHERE c.status = 'active' AND c.is_provider = true AND c.verification_status = 'approved'
       ORDER BY pp.rating_average DESC NULLS LAST
       LIMIT 12`
    );

    res.json({ categories: cats.rows, featuredProviders: providers.rows });
  } catch (err) {
    console.error("Marketplace categories error:", err);
    res.status(500).json({ error: "Failed to load marketplace data" });
  }
});

/* ── Provider profile management (for provider companies) ── */
router.get("/provider/profile", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    if (!userResult.rows[0]?.company_id) return res.status(403).json({ error: "No company" });

    const companyId = userResult.rows[0].company_id;
    const company = (await query("SELECT * FROM companies WHERE id = $1", [companyId])).rows[0];
    if (!company?.is_provider) return res.status(403).json({ error: "Not a provider company" });

    const profile = (await query(
      "SELECT * FROM provider_profiles WHERE company_id = $1", [companyId]
    )).rows[0] || null;

    res.json({ company, profile });
  } catch (err) {
    console.error("Provider profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

router.put("/provider/profile", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    if (!userResult.rows[0]?.company_id) return res.status(403).json({ error: "No company" });

    const companyId = userResult.rows[0].company_id;
    const company = (await query("SELECT * FROM companies WHERE id = $1", [companyId])).rows[0];
    if (!company?.is_provider) return res.status(403).json({ error: "Not a provider company" });

    const { displayName, description, providerType, industriesServed, serviceAreas,
            operatingRegions, yearsExperience, certifications, licenses, portfolioImages } = req.body;

    await query(
      `INSERT INTO provider_profiles (company_id, display_name, provider_type, description,
        industries_served, service_areas, operating_regions, years_experience,
        certifications, licenses, portfolio_images)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (company_id)
       DO UPDATE SET display_name = EXCLUDED.display_name,
         provider_type = EXCLUDED.provider_type,
         description = EXCLUDED.description,
         industries_served = EXCLUDED.industries_served,
         service_areas = EXCLUDED.service_areas,
         operating_regions = EXCLUDED.operating_regions,
         years_experience = EXCLUDED.years_experience,
         certifications = EXCLUDED.certifications,
         licenses = EXCLUDED.licenses,
         portfolio_images = EXCLUDED.portfolio_images,
         updated_at = NOW()`,
      [companyId, displayName || company.name, providerType || 'supplier',
       description || null, industriesServed || null, serviceAreas || null,
       operatingRegions || null, yearsExperience || null,
       certifications || null, licenses || null, portfolioImages || null]
    );

    if (req.body.description || req.body.website || req.body.logoUrl) {
      const upds: string[] = [];
      const updParams: any[] = [companyId];
      if (req.body.description) { upds.push(`description = $${updParams.length + 1}`); updParams.push(req.body.description); }
      if (req.body.website) { upds.push(`website = $${updParams.length + 1}`); updParams.push(req.body.website); }
      if (req.body.logoUrl) { upds.push(`logo_url = $${updParams.length + 1}`); updParams.push(req.body.logoUrl); }
      if (upds.length > 0) {
        await query(`UPDATE companies SET ${upds.join(", ")} WHERE id = $1`, updParams);
      }
    }

    const profile = (await query("SELECT * FROM provider_profiles WHERE company_id = $1", [companyId])).rows[0];
    res.json({ profile });
  } catch (err) {
    console.error("Update provider profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/* ── Admin: verify provider company ── */
router.post("/admin/companies/:id/verify", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { verificationStatus } = req.body;
    if (!["approved", "rejected", "suspended"].includes(verificationStatus)) {
      return res.status(400).json({ error: "Invalid verification status" });
    }
    await query("UPDATE companies SET verification_status = $1, updated_at = NOW() WHERE id = $2", [verificationStatus, req.params.id]);

    if (verificationStatus === "approved") {
      await query(
        `UPDATE provider_profiles SET verification_badge = true, updated_at = NOW() WHERE company_id = $1`,
        [req.params.id]
      );
    }

    res.json({ message: `Provider ${verificationStatus}` });
  } catch (err) {
    console.error("Verify provider error:", err);
    res.status(500).json({ error: "Failed to verify provider" });
  }
});

export default router;
