import { pool } from "./config/db";
import argon2 from "argon2";
import { faker } from "@faker-js/faker";

faker.seed(42);

const PASSWORD = "Password123!";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const GHANA_REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Eastern", "Central",
  "Volta", "Northern", "Upper East", "Upper West", "Bono",
  "Ahafo", "Bono East", "Oti", "North East", "Savannah", "Western North",
];

const GHANA_CITIES = [
  "Accra", "Kumasi", "Sekondi-Takoradi", "Tamale", "Tema",
  "Cape Coast", "Koforidua", "Ho", "Wa", "Bolgatanga",
  "Sunyani", "Obuasi", "Techiman", "Nkawkaw", "Winneba",
];

const INDUSTRIES = [
  "Construction & Engineering", "Solar & Renewable Energy", "Manufacturing",
  "Telecommunications", "Agriculture & Agribusiness", "Oil & Gas",
  "Mining", "Government & Public Sector", "Education", "Healthcare",
  "Hospitality & Tourism", "Retail & Wholesale", "Transportation & Logistics",
  "Real Estate",
];

const PRODUCT_CATEGORIES = [
  { name: "HVAC & Refrigeration", slug: "hvac", desc: "Air conditioning units, chillers, compressors, spare parts" },
  { name: "Electrical & Power", slug: "electrical", desc: "Cables, switchgear, transformers, circuit breakers" },
  { name: "Solar & Renewable", slug: "solar", desc: "Panels, inverters, batteries, charge controllers" },
  { name: "Industrial Equipment", slug: "industrial-equipment", desc: "Pumps, generators, power tools, machinery" },
  { name: "Plumbing & Fixtures", slug: "plumbing", desc: "Pipes, fittings, valves, bathroom fixtures" },
  { name: "Security & Safety", slug: "security", desc: "CCTV, alarms, access control, fire safety" },
  { name: "Lighting", slug: "lighting", desc: "LED lights, bulbs, street lighting, fixtures" },
  { name: "Building Materials", slug: "building-materials", desc: "Cement, steel, roofing, lumber" },
];

const SERVICE_CATEGORIES = [
  { name: "HVAC Services", slug: "hvac", desc: "Installation, servicing, repairs" },
  { name: "Electrical Services", slug: "electrical", desc: "Wiring, panel work, maintenance" },
  { name: "Solar Services", slug: "solar", desc: "System design, installation, support" },
  { name: "Facility Services", slug: "facility-services", desc: "Cleaning, carpentry, plumbing, maintenance" },
  { name: "Security Services", slug: "security", desc: "System setup, monitoring, support" },
  { name: "Industrial Services", slug: "industrial-equipment", desc: "Equipment servicing, maintenance" },
];

const STOCK_STATUSES = ["in_stock", "in_stock", "in_stock", "out_of_stock", "low_stock"];

const PRODUCT_ADJECTIVES = [
  "Professional", "Industrial", "Heavy-Duty", "Premium", "Standard",
  "Commercial", "High-Performance", "Economy", "Pro", "Deluxe",
];

const PRODUCT_NOUNS = [
  "AC Unit", "Compressor", "Generator", "Water Pump", "Circuit Breaker",
  "Solar Panel", "Inverter", "Battery Bank", "LED Floodlight", "Cable Drum",
  "Switchgear", "Transformer", "Fan Coil Unit", "Chiller", "Thermostat",
  "Pressure Gauge", "Valve", "Pipe Fitting", "Extension Cord", "Distribution Board",
];

async function main() {
  console.log("🌱 Seeding database...\n");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── 1. Categories ──
    const catIds: Record<string, string> = {};
    for (const cat of [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES]) {
      const type = PRODUCT_CATEGORIES.find(c => c.slug === cat.slug) ? "product" : "service";
      const res = await client.query(
        `INSERT INTO categories (name, slug, description, type, is_active)
         VALUES ($1, $2, $3, $4::category_type, true)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cat.name, cat.slug, cat.desc, type]
      );
      catIds[cat.slug] = res.rows[0].id;
    }
    console.log(`  ✓ ${PRODUCT_CATEGORIES.length + SERVICE_CATEGORIES.length} categories`);

    // ── 2. Customer Groups ──
    const groupIds: Record<string, string> = {};
    const groups = [
      { name: "Standard", min: 0, def: true },
      { name: "Silver", min: 10000, def: false },
      { name: "Gold", min: 50000, def: false },
      { name: "Platinum", min: 200000, def: false },
    ];
    for (const g of groups) {
      // Check if exists first
      const exists = await client.query("SELECT id FROM customer_groups WHERE name = $1", [g.name]);
      if (exists.rows.length > 0) {
        groupIds[g.name] = exists.rows[0].id;
        continue;
      }
      const res = await client.query(
        `INSERT INTO customer_groups (name, description, minimum_order_amount, is_default)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [g.name, `${g.name} tier - min GH₵${g.min.toLocaleString()}`, g.min, g.def]
      );
      groupIds[g.name] = res.rows[0].id;
    }
    console.log("  ✓ 4 customer groups");

    // ── 3. Shipping Methods ──
    await client.query(
      `INSERT INTO shipping_methods (name, code, base_rate, rate_per_kg, estimated_days_min, estimated_days_max)
       VALUES
         ('Standard Delivery', 'standard', 30, 1.5, 3, 7),
         ('Express Delivery', 'express', 50, 2.5, 1, 3),
         ('Same-Day Delivery', 'same_day', 100, 5, 0, 1)
       ON CONFLICT (code) DO NOTHING`
    );
    console.log("  ✓ 3 shipping methods");

    // ── 4. Fast password hash ──
    const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

    // ── 5. Companies ──
    const companies: { id: string; name: string; type: string; isProvider: boolean }[] = [];

    // 5a. Buyer companies (no provider)
    for (let i = 0; i < 12; i++) {
      const name = faker.company.name() + " Ltd";
      const email = faker.internet.email({ firstName: "info", lastName: name.split(" ")[0], provider: "gmail.com" });
      const res = await client.query(
        `INSERT INTO companies (name, business_type, industry, email, phone, address, city, state, country,
           contact_person_name, contact_person_email, contact_person_phone, status,
           company_type, is_provider, is_buyer, verification_status, customer_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ghana', $9, $10, $11, 'active',
           'buyer'::company_type, false, true, 'approved'::verification_status,
           $12::uuid)
         RETURNING id`,
        [
          name, pick(["Private Limited Company (Ltd)", "Partnership", "Sole Proprietorship"]),
          pick(INDUSTRIES), email, faker.phone.number(),
          faker.location.streetAddress(), pick(GHANA_CITIES), pick(GHANA_REGIONS),
          faker.person.fullName(), email, faker.phone.number(),
          pick([groupIds.Standard, groupIds.Silver, groupIds.Gold]),
        ]
      );
      companies.push({ id: res.rows[0].id, name, type: "buyer", isProvider: false });
    }

    // 5b. Supplier companies
    for (let i = 0; i < 10; i++) {
      const name = faker.company.name() + " Supply";
      const email = faker.internet.email({ firstName: "sales", lastName: name.split(" ")[0], provider: "gmail.com" });
      const res = await client.query(
        `INSERT INTO companies (name, business_type, industry, email, phone, address, city, state, country,
           contact_person_name, contact_person_email, contact_person_phone, status,
           company_type, is_provider, is_buyer, verification_status, description, website,
           customer_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ghana', $9, $10, $11, 'active',
           'supplier'::company_type, true, false, 'approved'::verification_status,
           $12, $13, $14::uuid)
         RETURNING id`,
        [
          name, "Private Limited Company (Ltd)",
          pick(["Manufacturing", "Wholesale & Retail", "Industrial Equipment"]),
          email, faker.phone.number(),
          faker.location.streetAddress(), pick(GHANA_CITIES), pick(GHANA_REGIONS),
          faker.person.fullName(), email, faker.phone.number(),
          faker.lorem.sentence(), `https://${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
          pick([groupIds.Standard, groupIds.Silver]),
        ]
      );
      companies.push({ id: res.rows[0].id, name, type: "supplier", isProvider: true });
    }

    // 5c. Service provider companies
    for (let i = 0; i < 8; i++) {
      const name = faker.company.name() + " Services";
      const email = faker.internet.email({ firstName: "info", lastName: name.split(" ")[0], provider: "gmail.com" });
      const res = await client.query(
        `INSERT INTO companies (name, business_type, industry, email, phone, address, city, state, country,
           contact_person_name, contact_person_email, contact_person_phone, status,
           company_type, is_provider, is_buyer, verification_status, description, website,
           service_areas, years_in_business, customer_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ghana', $9, $10, $11, 'active',
           'service_provider'::company_type, true, false, 'approved'::verification_status,
           $12, $13, $14, $15, $16::uuid)
         RETURNING id`,
        [
          name, "Private Limited Company (Ltd)",
          pick(["Construction & Engineering", "Solar & Renewable Energy", "Telecommunications"]),
          email, faker.phone.number(),
          faker.location.streetAddress(), pick(GHANA_CITIES), pick(GHANA_REGIONS),
          faker.person.fullName(), email, faker.phone.number(),
          faker.lorem.sentence(), `https://${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.gh`,
          faker.helpers.arrayElements(GHANA_REGIONS, randInt(2, 6)),
          randInt(2, 25),
          pick([groupIds.Standard, groupIds.Silver]),
        ]
      );
      companies.push({ id: res.rows[0].id, name, type: "service_provider", isProvider: true });
    }

    // 5d. Both buyer + provider (Both type)
    for (let i = 0; i < 4; i++) {
      const name = faker.company.name() + " Ltd (Group)";
      const email = faker.internet.email({ firstName: "info", lastName: name.split(" ")[0], provider: "gmail.com" });
      const res = await client.query(
        `INSERT INTO companies (name, business_type, industry, email, phone, address, city, state, country,
           contact_person_name, contact_person_email, contact_person_phone, status,
           company_type, is_provider, is_buyer, verification_status, description, website,
           customer_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Ghana', $9, $10, $11, 'active',
           'both_supplier_and_service_provider'::company_type, true, true, 'approved'::verification_status,
           $12, $13, $14::uuid)
         RETURNING id`,
        [
          name, "Private Limited Company (Ltd)",
          pick(["Construction & Engineering", "Manufacturing", "Oil & Gas"]),
          email, faker.phone.number(),
          faker.location.streetAddress(), pick(GHANA_CITIES), pick(GHANA_REGIONS),
          faker.person.fullName(), email, faker.phone.number(),
          faker.lorem.sentence(), `https://${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com.gh`,
          pick([groupIds.Gold, groupIds.Platinum]),
        ]
      );
      companies.push({ id: res.rows[0].id, name, type: "both", isProvider: true });
    }

    console.log(`  ✓ ${companies.length} companies (${companies.filter(c => !c.isProvider).length} buyers, ${companies.filter(c => c.isProvider).length} providers)`);

    // ── 6. Users ──
    for (const company of companies) {
      // Company admin
      const email = `admin@${company.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.local`;
      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role,
           company_id, company_role, account_status, company_name)
         VALUES ($1, $2, $3, $4, $5, 'customer', $6, 'company_admin', 'active', $7)
         ON CONFLICT (email) DO NOTHING`,
        [email, passwordHash, faker.person.firstName(), faker.person.lastName(),
         faker.phone.number(), company.id, company.name]
      );

      // Additional users per company
      const extraCount = randInt(1, 3);
      for (let j = 0; j < extraCount; j++) {
        await client.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, phone, role,
             company_id, company_role, account_status, company_name)
           VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7, 'active', $8)
           ON CONFLICT (email) DO NOTHING`,
          [faker.internet.email({ provider: "company.gh" }) + "." + Date.now() + String(j),
           passwordHash, faker.person.firstName(), faker.person.lastName(),
           faker.phone.number(), company.id,
           pick(["buyer", "finance", "viewer"]), company.name]
        );
      }
    }
    // Re-fetch all users linked to seeded companies
    const userRes = await client.query(
      `SELECT id, company_id, company_role FROM users WHERE company_id = ANY($1::uuid[])`,
      [companies.map(c => c.id)]
    );
    const users: { id: string; companyId: string; role: string }[] = userRes.rows.map((r: any) => ({
      id: r.id, companyId: r.company_id, role: r.company_role,
    }));
    console.log(`  ✓ ${users.length} users`);

    // ── 7. Products (under supplier/provider companies) ──
    const providerCompanies = companies.filter(c => c.isProvider);
    const products: { id: string; companyId: string; name: string; price: number }[] = [];
    for (const company of providerCompanies) {
      const productCount = randInt(3, 12);
      for (let i = 0; i < productCount; i++) {
        const cat = pick(PRODUCT_CATEGORIES);
        const adj = pick(PRODUCT_ADJECTIVES);
        const noun = pick(PRODUCT_NOUNS);
        const name = `${adj} ${noun}`;
        const slug = `${company.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${i}`;
        const price = randInt(50, 50000);
        const existingProd = await client.query("SELECT id FROM products WHERE slug = $1", [slug]);
        if (existingProd.rows.length > 0) {
          products.push({ id: existingProd.rows[0].id, companyId: company.id, name, price });
          continue;
        }
        const res = await client.query(
          `INSERT INTO products (name, slug, description, category_id, price, stock_status, sku,
             is_active, provider_company_id, hide_price, minimum_order_quantity, credit_eligible)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11)
           RETURNING id`,
          [
            name, slug, faker.lorem.paragraph(),
            catIds[cat.slug], price, pick(STOCK_STATUSES),
            `${company.name.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(3, "0")}-${Date.now().toString(36)}`,
            company.id, Math.random() < 0.15, randInt(1, 10), Math.random() < 0.3,
          ]
        );
        if (res.rows[0]) {
          products.push({ id: res.rows[0].id, companyId: company.id, name, price });
        }
      }
    }
    console.log(`  ✓ ${products.length} products`);

    // ── 8. Services (under service providers and both types) ──
    const serviceProviders = providerCompanies.filter(c => c.type === "service_provider" || c.type === "both");
    const services: { id: string; companyId: string }[] = [];
    for (const company of serviceProviders) {
      const serviceCount = randInt(2, 6);
      for (let i = 0; i < serviceCount; i++) {
        const cat = pick(SERVICE_CATEGORIES);
        const name = `${cat.name} — ${pick(["Installation", "Maintenance", "Repair", "Consultation", "Inspection"])}`;
        const slug = `${company.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-svc-${i}`;
        // Check if exists first (services may not have unique slug constraint)
        const existingSvc = await client.query("SELECT id FROM services WHERE provider_company_id = $1 AND slug = $2", [company.id, slug]);
        if (existingSvc.rows.length > 0) {
          services.push({ id: existingSvc.rows[0].id, companyId: company.id });
          continue;
        }
        const res = await client.query(
          `INSERT INTO services (provider_company_id, name, slug, description, category_id,
             service_type, pricing_model, starting_price, availability_status,
             minimum_job_value, estimated_response_time, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, 'quote_only', $7, 'active',
             $8, $9, true)
           RETURNING id`,
          [
            company.id, name, slug, faker.lorem.paragraph(),
            catIds[cat.slug], pick(["installation", "maintenance", "repair"]),
            randInt(500, 20000), randInt(200, 5000),
            pick(["Within 24 hours", "Within 48 hours", "Within 1 week"]),
          ]
        );
        if (res.rows[0]) services.push({ id: res.rows[0].id, companyId: company.id });
      }
    }
    console.log(`  ✓ ${services.length} services`);

    // ── 9. Company Prices (some products get custom pricing) ──
    let priceCount = 0;
    for (const product of products.slice(0, Math.floor(products.length * 0.4))) {
      const targetCompanies = companies.filter(c => c.id !== product.companyId && !c.isProvider).slice(0, randInt(1, 4));
      for (const tc of targetCompanies) {
        await client.query(
          `INSERT INTO company_prices (company_id, product_id, price, min_quantity)
           VALUES ($1, $2, $3, $4)`,
          [tc.id, product.id, product.price * (0.85 + Math.random() * 0.1), randInt(1, 5)]
        );
        priceCount++;
      }
    }
    console.log(`  ✓ ${priceCount} company prices`);

    // ── 10. RFQs from buyer companies ──
    const buyerCompanies = companies.filter(c => c.type === "buyer" || c.type === "both");
    const rfqs: { id: string; userId: string; companyId: string; status: string }[] = [];
    for (const company of buyerCompanies) {
      const companyUsers = users.filter(u => u.companyId === company.id);
      if (companyUsers.length === 0) continue;
      const rfqCount = randInt(1, 5);
      for (let i = 0; i < rfqCount; i++) {
        const user = pick(companyUsers);
        const product = pick(products);
        const status = pick(["pending", "pending", "quoted", "accepted"]);
        const res = await client.query(
          `INSERT INTO rfqs (user_id, product_id, quantity, status, request_type,
             delivery_location, deadline_at, notes, source)
           VALUES ($1, $2, $3, $4, 'product_sourcing', $5, $6, $7, 'registered')
           RETURNING id`,
          [
            user.id, product.id, randInt(1, 100), status,
            pick(GHANA_CITIES),
            new Date(Date.now() + randInt(7, 90) * 86400000),
            faker.lorem.sentence(),
          ]
        );
        rfqs.push({ id: res.rows[0].id, userId: user.id, companyId: company.id, status });
      }
    }
    console.log(`  ✓ ${rfqs.length} RFQs`);

    // ── 11. Quotations on RFQs ──
    const quotableRfqs = rfqs.filter(r => r.status === "quoted" || r.status === "accepted");
    const quotations: { id: string; rfqId: string }[] = [];
    for (const rfq of quotableRfqs) {
      const adminUser = pick(users);
      const total = randInt(1000, 100000);
      const res = await client.query(
        `INSERT INTO quotations (rfq_id, customer_id, quotation_number, status, subtotal, total_amount, valid_until, created_by)
         VALUES ($1, $2, $3, 'sent', $4, $5, $6, $7)
         RETURNING id`,
        [
          rfq.id, rfq.userId,
          `QTN-${faker.string.alphanumeric({ length: 8, casing: "upper" })}`,
          total, total,       new Date(Date.now() + 30 * 86400000),
          adminUser.id,
        ]
      );
      quotations.push({ id: res.rows[0].id, rfqId: rfq.id });
    }
    console.log(`  ✓ ${quotations.length} quotations`);

    // ── 12. Scout Requests from buyers ──
    const scoutRequests: { id: string; companyId: string; status: string }[] = [];
    for (const company of buyerCompanies) {
      const companyUsers = users.filter(u => u.companyId === company.id);
      if (companyUsers.length === 0) continue;
      const count = randInt(0, 4);
      for (let i = 0; i < count; i++) {
        const user = pick(companyUsers);
        const reqType = Math.random() > 0.5 ? "product" : "service";
        const status = pick(["open", "open", "awarded", "cancelled"]) as string;
        const cat = reqType === "product" ? pick(PRODUCT_CATEGORIES) : pick(SERVICE_CATEGORIES);
        const res = await client.query(
          `INSERT INTO scout_requests (company_id, created_by, title, description, quantity, unit,
             delivery_location, desired_delivery_date, budget_min, budget_max, status, category_id, request_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::scout_request_type)
           RETURNING id`,
          [
            company.id, user.id,
            `${pick(["Need", "Looking for", "Require", "Urgent: "])} ${pick(PRODUCT_NOUNS)}`,
            faker.lorem.paragraph(), randInt(1, 50), pick(["units", "pieces", "sets", "items"]),
            pick(GHANA_CITIES),         new Date(Date.now() + randInt(14, 120) * 86400000),
            randInt(1000, 10000), randInt(10000, 200000),
            status, catIds[cat.slug], reqType,
          ]
        );
        scoutRequests.push({ id: res.rows[0].id, companyId: company.id, status });
      }
    }
    console.log(`  ✓ ${scoutRequests.length} scout requests`);

    // ── 13. Scout Proposals from providers ──
    const openRequests = scoutRequests.filter(r => r.status === "open");
    const proposals: { id: string; requestId: string; providerId: string; status: string }[] = [];
    for (const req of openRequests) {
      const eligibleProviders = providerCompanies.filter(c => c.id !== req.companyId);
      const chosen = faker.helpers.arrayElements(eligibleProviders, randInt(1, Math.min(4, eligibleProviders.length)));
      for (const prov of chosen) {
        const provUsers = users.filter(u => u.companyId === prov.id);
        if (provUsers.length === 0) continue;
        const res = await client.query(
          `INSERT INTO scout_quotes (request_id, provider_company_id, submitted_by, quoted_price, delivery_date, payment_terms, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           ON CONFLICT (request_id, provider_company_id) DO NOTHING
           RETURNING id`,
          [
            req.id, prov.id, pick(provUsers).id,
            randInt(5000, 150000), new Date(Date.now() + randInt(7, 60) * 86400000),
            pick(["Net 30", "Net 15", "50% upfront, 50% on delivery", "Payment on delivery"]),
          ]
        );
        if (res.rows[0]) {
          proposals.push({ id: res.rows[0].id, requestId: req.id, providerId: prov.id, status: "pending" });
        }
      }
    }
    console.log(`  ✓ ${proposals.length} scout proposals`);

    // ── 14. Agreements (from accepted proposals) ──
    const agreements: { id: string }[] = [];
    if (proposals.length > 0) {
      const acceptCount = Math.min(randInt(1, 4), proposals.length);
      const toAccept = proposals.slice(0, acceptCount);
      for (const prop of toAccept) {
        const req = scoutRequests.find(r => r.id === prop.requestId);
        if (!req) continue;
        const buyerCompany = companies.find(c => c.id === req.companyId);
        const provider = companies.find(c => c.id === prop.providerId);
        if (!buyerCompany || !provider) continue;

        const res = await client.query(
          `INSERT INTO scout_agreements (scout_request_id, buyer_company_id, provider_company_id,
             accepted_quote_id, status, agreed_price, agreed_delivery_date, payment_terms)
           VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
           RETURNING id`,
          [
            req.id, req.companyId, prop.providerId, prop.id,
            randInt(5000, 150000), new Date(Date.now() + randInt(7, 60) * 86400000),
            pick(["Net 30", "Net 15"]),
          ]
        );
        agreements.push({ id: res.rows[0].id });
      }
    }
    console.log(`  ✓ ${agreements.length} agreements`);

    // ── 15. Orders (from some quotations and agreements) ──
    const orderUserIds = users.filter(u => u.role === "company_admin").map((u: any) => u.id);
    let orderCount = 0;
    for (const q of quotations.slice(0, Math.floor(quotations.length * 0.5))) {
      const rfq = rfqs.find(r => r.id === q.rfqId);
      if (!rfq) continue;
      const total = randInt(1000, 50000);
      const status = pick(["pending", "processing", "completed", "paid"]);
      await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, order_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'sales')`,
        [
          rfq.userId,
          `ORD-${faker.string.alphanumeric({ length: 8, casing: "upper" })}`,
          JSON.stringify([{ product_id: faker.string.uuid(), name: "Order Item", quantity: randInt(1, 10), price: total / randInt(1, 5) }]),
          total, Math.round(total * 0.15), total,
          status, pick(["paystack", "bank_transfer", "credit"]),
        ]
      );
      orderCount++;
    }

    // Some agreements converted to orders
    for (const agreement of agreements.slice(0, Math.floor(agreements.length * 0.6))) {
      if (orderUserIds.length === 0) continue;
      const total = randInt(10000, 100000);
      await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status, payment_method, agreement_id, order_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'sales')`,
        [
          pick(orderUserIds),
          `ORD-${faker.string.alphanumeric({ length: 8, casing: "upper" })}`,
          JSON.stringify([{ agreement_id: agreement.id, name: "Agreement Order", quantity: 1, price: total }]),
          total, Math.round(total * 0.15), total,
          pick(["processing", "completed"]), pick(["paystack", "bank_transfer"]),
          agreement.id,
        ]
      );
      orderCount++;

      // Mark agreement completed
      await client.query(
        `UPDATE scout_agreements SET status = 'completed' WHERE id = $1`,
        [agreement.id]
      );
    }
    console.log(`  ✓ ${orderCount} orders`);

    // ── 16. Super Admin User ──
    const adminEmail = "admin@bali-can.com";
    const existingAdmin = await client.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
    if (existingAdmin.rows.length === 0) {
      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, account_status)
         VALUES ($1, $2, 'Super', 'Admin', 'super_admin', 'active')`,
        [adminEmail, passwordHash]
      );
    }
    console.log(`  ✓ super admin user (${adminEmail} / ${PASSWORD})`);

    await client.query("COMMIT");
    console.log("\n✅ Seeding complete!");
    console.log(`\n📋 Login credentials:`);
    console.log(`   Super Admin: ${adminEmail} / ${PASSWORD}`);
    console.log(`   All other users: Password123!`);
    console.log(`\n🏢 ${companies.length} companies`);
    console.log(`   Buyers: ${companies.filter(c => !c.isProvider).length}`);
    console.log(`   Suppliers: ${companies.filter(c => c.type === "supplier").length}`);
    console.log(`   Service Providers: ${companies.filter(c => c.type === "service_provider").length}`);
    console.log(`   Both: ${companies.filter(c => c.type === "both").length}`);
    console.log(`👤 ${users.length} users`);
    console.log(`📦 ${products.length} products`);
    console.log(`🔧 ${services.length} services`);
    console.log(`📄 ${rfqs.length} RFQs`);
    console.log(`💬 ${quotations.length} quotations`);
    console.log(`🔍 ${scoutRequests.length} scout requests`);
    console.log(`📋 ${proposals.length} scout proposals`);
    console.log(`🤝 ${agreements.length} agreements`);
    console.log(`🛒 ${orderCount} orders`);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Seed failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
