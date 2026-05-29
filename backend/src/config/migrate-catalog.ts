import { pool } from "./db";
import { slugify } from "../utils/helpers";

async function run() {
  console.log("Running product catalog migration & seed...");

  try {
    // Apply schema changes
    await pool.query(`
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sales';
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ops';
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

      ALTER TABLE products ADD COLUMN IF NOT EXISTS short_description TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variable_price BOOLEAN DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

      CREATE TABLE IF NOT EXISTS product_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        alt TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS product_attributes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        value TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_attributes_product ON product_attributes(product_id);

      ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS entity_id UUID;
    `);

    console.log("Schema migration complete");

    // Seed categories
    const catRows = await pool.query("SELECT id, slug FROM categories");
    const catMap = new Map(catRows.rows.map((r: any) => [r.slug, r.id]));

    const categories = [
      { name: "Solar Panels", slug: "solar-panels", description: "High-efficiency photovoltaic panels for residential, commercial, and industrial installations." },
      { name: "Inverters", slug: "inverters", description: "Pure sine wave and hybrid inverters for reliable power conversion." },
      { name: "Batteries & Storage", slug: "batteries-and-storage", description: "Lithium-ion, lead-acid, and gel batteries for energy storage solutions." },
      { name: "Solar Charge Controllers", slug: "solar-charge-controllers", description: "MPPT and PWM charge controllers for optimized solar charging." },
      { name: "Cables & Accessories", slug: "cables-and-accessories", description: "Solar cables, connectors, mounting structures, and installation accessories." },
      { name: "Lighting", slug: "lighting", description: "Solar-powered street lights, floodlights, and indoor lighting systems." },
      { name: "Water Pumps", slug: "water-pumps", description: "Solar-powered water pumping solutions for agriculture and domestic use." },
      { name: "Power Distribution", slug: "power-distribution", description: "Distribution boards, circuit breakers, surge protectors, and switchgear." },
    ];

    for (const cat of categories) {
      if (!catMap.has(cat.slug)) {
        const result = await pool.query(
          `INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING RETURNING id`,
          [cat.name, cat.slug, cat.description]
        );
        if (result.rows.length > 0) {
          catMap.set(cat.slug, result.rows[0].id);
          console.log(`  Created category: ${cat.name}`);
        }
      }
    }

    // Refresh category map
    const allCats = await pool.query("SELECT id, slug FROM categories");
    allCats.rows.forEach((r: any) => catMap.set(r.slug, r.id));

    // Seed products
    const products = [
      {
        name: "Bali-Can Mono 450W Solar Panel",
        sku: "BC-SP-450",
        shortDescription: "High-efficiency monocrystalline solar panel, 450W output.",
        description: "Premium monocrystalline solar panel featuring half-cut cell technology and 21.5% module efficiency. Ideal for residential and commercial rooftop installations. Comes with a 25-year linear power output warranty.",
        categorySlug: "solar-panels",
        price: 185000,
        comparePrice: 210000,
        stockStatus: "in_stock",
        featured: true,
        specs: { "Max Power": "450W", "Efficiency": "21.5%", "Cell Type": "Monocrystalline", "Cell Count": "144 (9×16)", "Frame": "Anodized Aluminum", "Weight": "24.5 kg", "Dimensions": "2094×1038×35 mm", "Warranty": "25 years" },
        attributes: [
          { name: "Wattage", value: "450W" },
          { name: "Technology", value: "Half-cut monocrystalline" },
          { name: "Application", value: "Residential / Commercial" },
        ],
        images: ["https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800", "https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?w=800"],
      },
      {
        name: "Bali-Can BiFacial 550W Solar Panel",
        sku: "BC-SP-550",
        shortDescription: "Bifacial solar panel capturing light from both sides for higher yield.",
        description: "Advanced bifacial monocrystalline solar panel that captures sunlight from both sides, increasing total energy yield by up to 30%. Ideal for ground-mounted and reflective surface installations.",
        categorySlug: "solar-panels",
        price: 245000,
        comparePrice: 280000,
        stockStatus: "limited",
        specs: { "Max Power": "550W", "Efficiency": "22.3%", "Cell Type": "Bifacial Monocrystalline", "Bifaciality": "70±5%", "Weight": "28.5 kg", "Dimensions": "2278×1134×30 mm", "Warranty": "30 years" },
        attributes: [
          { name: "Wattage", value: "550W" },
          { name: "Technology", value: "Bifacial monocrystalline" },
          { name: "Application", value: "Ground-mount / Solar farm" },
        ],
        images: ["https://images.unsplash.com/photo-1624397640148-949b1732bb0c?w=800"],
      },
      {
        name: "Bali-Can Poly 330W Solar Panel",
        sku: "BC-SP-330",
        shortDescription: "Cost-effective polycrystalline solar panel for budget-friendly installations.",
        description: "Reliable polycrystalline solar panel offering excellent value for larger installations. 330W output with 17.8% efficiency. Perfect for off-grid and grid-tie systems where budget is a primary consideration.",
        categorySlug: "solar-panels",
        price: 125000,
        comparePrice: 145000,
        stockStatus: "in_stock",
        specs: { "Max Power": "330W", "Efficiency": "17.8%", "Cell Type": "Polycrystalline", "Cell Count": "72 (6×12)", "Weight": "22 kg", "Dimensions": "1956×992×40 mm", "Warranty": "15 years" },
        attributes: [
          { name: "Wattage", value: "330W" },
          { name: "Technology", value: "Polycrystalline" },
          { name: "Application", value: "Off-grid / Budget installations" },
        ],
        images: ["https://images.unsplash.com/photo-1603171371901-3fa88fc11db1?w=800"],
      },
      {
        name: "Bali-Can Hybrid 5kVA Inverter",
        sku: "BC-INV-5K",
        shortDescription: "Pure sine wave hybrid inverter with built-in MPPT charge controller.",
        description: "Versatile 5kVA hybrid inverter featuring dual MPPT charge controllers, pure sine wave output, and seamless grid/battery switching. Supports lithium and lead-acid batteries. Ideal for residential backup and solar self-consumption.",
        categorySlug: "inverters",
        price: 450000,
        comparePrice: 520000,
        stockStatus: "in_stock",
        featured: true,
        specs: { "Power": "5kVA / 4kW", "Waveform": "Pure Sine Wave", "MPPT Voltage": "120-450VDC", "Max PV Input": "6000W", "Battery Voltage": "48V", "Efficiency": "93%", "Transfer Time": "<10ms", "Warranty": "5 years" },
        attributes: [
          { name: "Power Rating", value: "5kVA" },
          { name: "Type", value: "Hybrid Inverter" },
          { name: "Battery Compatibility", value: "Lithium / Lead-acid" },
        ],
        images: ["https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800"],
      },
      {
        name: "Bali-Can Off-Grid 3kVA Inverter",
        sku: "BC-INV-3K",
        shortDescription: "Compact off-grid inverter for small homes and remote cabins.",
        description: "Dedicated off-grid inverter with built-in 60A MPPT charge controller. Compact design perfect for small homes, remote cabins, and backup power. Supports generator auto-start for extended autonomy.",
        categorySlug: "inverters",
        price: 285000,
        stockStatus: "in_stock",
        specs: { "Power": "3kVA / 2.4kW", "Waveform": "Pure Sine Wave", "MPPT Current": "60A", "Battery Voltage": "24V", "Efficiency": "90%", "Weight": "14 kg", "Warranty": "3 years" },
        attributes: [
          { name: "Power Rating", value: "3kVA" },
          { name: "Type", value: "Off-Grid Inverter" },
          { name: "Battery Voltage", value: "24V" },
        ],
        images: ["https://images.unsplash.com/photo-1611558709790-7df2f2e2f0e0?w=800"],
      },
      {
        name: "Bali-Can Grid-Tie 8kW Inverter",
        sku: "BC-INV-8K-GT",
        shortDescription: "Grid-tie inverter for net metering and feed-in tariff systems.",
        description: "High-efficiency grid-tie inverter designed for net metering applications. Features dual MPPT trackers, IP65 outdoor rating, and remote monitoring via WiFi. Compatible with all major utility grid standards.",
        categorySlug: "inverters",
        price: 720000,
        stockStatus: "limited",
        specs: { "Power": "8kW", "MPPT Trackers": "2", "Max Efficiency": "98.2%", "THDi": "<3%", "IP Rating": "IP65", "Communication": "WiFi / RS485", "Weight": "19.5 kg", "Warranty": "10 years" },
        attributes: [
          { name: "Power Rating", value: "8kW" },
          { name: "Type", value: "Grid-Tie Inverter" },
          { name: "Application", value: "Net metering" },
        ],
        images: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800"],
      },
      {
        name: "Bali-Can Lithium 5.12kWh Battery",
        sku: "BC-BAT-LI-5",
        shortDescription: "Wall-mounted lithium iron phosphate battery for home energy storage.",
        description: "Sleek wall-mounted LiFePO4 battery with 5.12kWh usable capacity. Features built-in BMS, long cycle life (6000+ cycles), and lightweight design. Can be paralleled up to 4 units for 20.48kWh total storage.",
        categorySlug: "batteries-and-storage",
        price: 980000,
        comparePrice: 1150000,
        stockStatus: "in_stock",
        featured: true,
        specs: { "Capacity": "5.12kWh", "Voltage": "51.2V", "Chemistry": "LiFePO4", "Cycle Life": "6000+ cycles @ 80% DoD", "Max Discharge": "100A", "Weight": "48 kg", "Dimensions": "580×480×120 mm", "IP Rating": "IP20", "Warranty": "10 years" },
        attributes: [
          { name: "Capacity", value: "5.12kWh" },
          { name: "Chemistry", value: "LiFePO4 (Lithium Iron Phosphate)" },
          { name: "Mounting", value: "Wall-mounted" },
        ],
        images: ["https://images.unsplash.com/photo-1620714223084-8fcacc6dfd8d?w=800"],
      },
      {
        name: "Bali-Can Gel 200Ah Deep Cycle Battery",
        sku: "BC-BAT-GEL-200",
        shortDescription: "Maintenance-free gel battery for deep cycle solar applications.",
        description: "High-quality gel battery with 200Ah capacity at C10 discharge rate. Valve-regulated, spill-proof, and maintenance-free design. Excellent for daily cyclic use in solar storage systems.",
        categorySlug: "batteries-and-storage",
        price: 320000,
        stockStatus: "in_stock",
        specs: { "Capacity": "200Ah @ C10", "Voltage": "12V", "Chemistry": "Gel (VRLA)", "Cycle Life": "1200 cycles @ 50% DoD", "Weight": "58 kg", "Operating Temp": "-20°C to 50°C", "Warranty": "2 years" },
        attributes: [
          { name: "Capacity", value: "200Ah" },
          { name: "Chemistry", value: "Gel (VRLA)" },
          { name: "Voltage", value: "12V" },
        ],
        images: ["https://images.unsplash.com/photo-1631720488317-4f4c6b1a5d5d?w=800"],
      },
      {
        name: "Bali-Can MPPT 100A Charge Controller",
        sku: "BC-CC-100A",
        shortDescription: "High-current MPPT charge controller with LCD display.",
        description: "Professional-grade MPPT solar charge controller rated at 100A. Features a large backlit LCD display, temperature compensation, and RS232 communication. Supports up to 150VDC PV input voltage.",
        categorySlug: "solar-charge-controllers",
        price: 175000,
        comparePrice: 200000,
        stockStatus: "in_stock",
        specs: { "Rated Current": "100A", "Max PV Voltage": "150VDC", "Battery Voltage": "12/24/48V Auto", "Efficiency": "98%", "Display": "Backlit LCD", "Communication": "RS232 / Optional WiFi", "Weight": "3.2 kg", "Warranty": "3 years" },
        attributes: [
          { name: "Current Rating", value: "100A" },
          { name: "Type", value: "MPPT" },
          { name: "Battery Voltage", value: "12/24/48V" },
        ],
        images: ["https://images.unsplash.com/photo-1611365892117-00ac5ef43c90?w=800"],
      },
      {
        name: "Bali-Can PWM 30A Charge Controller",
        sku: "BC-CC-30A",
        shortDescription: "Affordable PWM controller for small solar systems.",
        description: "Compact and affordable PWM solar charge controller, ideal for smaller systems. Features overcharge, over-discharge, and reverse polarity protection. Perfect for solar street lights and small cabin setups.",
        categorySlug: "solar-charge-controllers",
        price: 45000,
        stockStatus: "in_stock",
        specs: { "Rated Current": "30A", "Battery Voltage": "12/24V Auto", "Protection": "Overcharge / Over-discharge / Reverse polarity", "Weight": "0.5 kg", "Warranty": "1 year" },
        attributes: [
          { name: "Current Rating", value: "30A" },
          { name: "Type", value: "PWM" },
          { name: "Application", value: "Small systems / Lighting" },
        ],
        images: [],
      },
      {
        name: "Bali-Can Solar PV Cable 6mm² (100m)",
        sku: "BC-CAB-6MM",
        shortDescription: "UV-resistant solar PV cable for panel interconnection.",
        description: "High-quality, double-insulated solar PV cable. UV and ozone resistant, suitable for outdoor use. 6mm² cross-section rated for up to 55A. Comes in 100-meter rolls.",
        categorySlug: "cables-and-accessories",
        price: 85000,
        stockStatus: "in_stock",
        specs: { "Cross Section": "6mm²", "Current Rating": "55A", "Voltage Rating": "1800VDC", "Insulation": "XLPO (Halogen-free)", "Length": "100m", "Color": "Red + Black" },
        attributes: [
          { name: "Type", value: "PV Cable" },
          { name: "Size", value: "6mm²" },
          { name: "Length", value: "100m" },
        ],
        images: [],
      },
      {
        name: "Bali-Can MC4 Connector Pair",
        sku: "BC-MC4-1",
        shortDescription: "Industry-standard MC4 solar connectors (male + female).",
        description: "Genuine MC4 connectors suitable for all standard solar panels. Rated at 1500VDC / 30A. UV-stable, waterproof (IP67), and tool-free assembly. Sold as male+female pairs.",
        categorySlug: "cables-and-accessories",
        price: 3500,
        stockStatus: "in_stock",
        specs: { "Type": "MC4", "Rated Voltage": "1500VDC", "Rated Current": "30A", "IP Rating": "IP67", "Contact Material": "Silver-plated copper", "Cable Size": "4-6mm²" },
        attributes: [
          { name: "Type", value: "MC4 Connector" },
          { name: "Rating", value: "30A / 1500V" },
          { name: "Pack Size", value: "Pair (male + female)" },
        ],
        images: [],
      },
      {
        name: "Bali-Can Solar Street Light 100W",
        sku: "BC-LT-100W",
        shortDescription: "All-in-one solar street light with motion sensor.",
        description: "Integrated solar street light with 100W LED, monocrystalline solar panel, and lithium battery. Features PIR motion sensor for intelligent dimming. Pole-mounted with all brackets included.",
        categorySlug: "lighting",
        price: 185000,
        comparePrice: 220000,
        stockStatus: "in_stock",
        featured: true,
        specs: { "LED Power": "100W", "Luminous Flux": "12000 lm", "Color Temperature": "6000K (Cool White)", "Solar Panel": "18V / 80W Poly", "Battery": "3.2V / 60Ah LiFePO4", "Lighting Hours": "12+ hours (dimming mode)", "Pole Height": "6-8m", "IP Rating": "IP65", "Warranty": "3 years" },
        attributes: [
          { name: "Wattage", value: "100W LED" },
          { name: "Type", value: "All-in-one solar street light" },
          { name: "Sensor", value: "PIR motion sensor" },
        ],
        images: ["https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800"],
      },
      {
        name: "Bali-Can Solar Floodlight 50W",
        sku: "BC-LT-FL50",
        shortDescription: "Weatherproof solar floodlight for outdoor security lighting.",
        description: "Rugged die-cast aluminum solar floodlight with 50W LED output. Features a separate solar panel for flexible mounting. Adjustable bracket allows precise aiming. Ideal for security lighting, gardens, and pathways.",
        categorySlug: "lighting",
        price: 65000,
        stockStatus: "in_stock",
        specs: { "LED Power": "50W", "Luminous Flux": "5500 lm", "Color Temperature": "6500K (Daylight)", "Solar Panel": "18V / 40W Poly", "Battery": "12V / 20Ah Lithium", "Lighting Hours": "8-10 hours", "IP Rating": "IP65", "Material": "Die-cast Aluminum" },
        attributes: [
          { name: "Wattage", value: "50W" },
          { name: "Type", value: "Solar Floodlight" },
          { name: "Mounting", value: "Wall / Pole" },
        ],
        images: [],
      },
      {
        name: "Bali-Can Solar Water Pump 2HP",
        sku: "BC-WP-2HP",
        shortDescription: "Submersible solar water pump for borehole applications.",
        description: "High-performance submersible solar water pump with 2HP motor. Features a helical rotor design for efficient water lifting from depths up to 80 meters. Includes MPPT controller, stainless steel body, and dry-run protection.",
        categorySlug: "water-pumps",
        price: 890000,
        comparePrice: 1050000,
        stockStatus: "limited",
        specs: { "Power": "2HP (1.5kW)", "Max Flow": "120 L/min", "Max Head": "80m", "Outlet": "2 inches (50mm)", "Motor Type": "Brushless DC (BLDC)", "Controller": "Built-in MPPT", "Material": "Stainless Steel 304", "Warranty": "3 years" },
        attributes: [
          { name: "Power", value: "2HP" },
          { name: "Type", value: "Submersible Solar Pump" },
          { name: "Max Depth", value: "80m" },
        ],
        images: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800"],
      },
      {
        name: "Bali-Can Distribution Board 12-Way",
        sku: "BC-DB-12W",
        shortDescription: "12-way distribution board with surge protection.",
        description: "Modern 12-way distribution board with built-in surge protective device (SPD). IP40 rated for indoor use. Suitable for residential and commercial solar installations. Includes DIN rail and neutral/earth bars.",
        categorySlug: "power-distribution",
        price: 45000,
        stockStatus: "in_stock",
        specs: { "Ways": "12", "SPD": "Built-in (Type 2)", "IP Rating": "IP40", "Material": "Engineering-grade plastic", "Mounting": "Surface / Flush", "Rated Current": "100A Main Switch" },
        attributes: [
          { name: "Type", value: "Distribution Board" },
          { name: "Ways", value: "12" },
          { name: "Protection", value: "Built-in SPD" },
        ],
        images: [],
      },
      {
        name: "Bali-Can DC Surge Protector 1000V",
        sku: "BC-SPD-DC",
        shortDescription: "DC-side surge protector for solar PV arrays.",
        description: "Type 2 DC surge protective device rated at 1000VDC. Protects solar PV arrays from lightning-induced surges. Compact DIN-rail mountable design with visual status indicator.",
        categorySlug: "power-distribution",
        price: 25000,
        stockStatus: "in_stock",
        specs: { "Type": "Type 2 (SPD)", "Max Continuous Voltage": "1000VDC", "Nominal Discharge Current": "20kA", "Max Discharge Current": "40kA", "Protection Modes": "L+ / L- / PE", "Mounting": "DIN Rail 35mm" },
        attributes: [
          { name: "Type", value: "DC Surge Protector" },
          { name: "Voltage", value: "1000VDC" },
          { name: "Application", value: "Solar PV Arrays" },
        ],
        images: [],
      },
    ];

    let createdCount = 0;
    for (const product of products) {
      const slug = slugify(product.name);
      const catId = catMap.get(product.categorySlug);

      if (!catId) {
        console.log(`  SKIP: No category found for "${product.categorySlug}"`);
        continue;
      }

      const existing = await pool.query("SELECT id FROM products WHERE slug = $1", [slug]);
      if (existing.rows.length > 0) continue;

      const result = await pool.query(
        `INSERT INTO products (name, sku, slug, short_description, description, category_id, price, compare_price, stock_status, featured, specs, variants)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '[]')
         RETURNING id`,
        [product.name, product.sku || null, slug, product.shortDescription, product.description, catId, product.price, product.comparePrice || null, product.stockStatus, product.featured || false, JSON.stringify(product.specs)]
      );
      const productId = result.rows[0].id;

      if (product.images && product.images.length > 0) {
        for (let i = 0; i < product.images.length; i++) {
          await pool.query(
            `INSERT INTO product_images (product_id, url, alt, sort_order) VALUES ($1, $2, $3, $4)`,
            [productId, product.images[i], product.name, i]
          );
        }
      }

      if (product.attributes && product.attributes.length > 0) {
        for (let i = 0; i < product.attributes.length; i++) {
          const attr = product.attributes[i];
          await pool.query(
            `INSERT INTO product_attributes (product_id, name, value, sort_order) VALUES ($1, $2, $3, $4)`,
            [productId, attr.name, attr.value, i]
          );
        }
      }

      createdCount++;
    }

    console.log(`Created ${createdCount} seed products`);
    console.log("Product catalog migration & seed complete");
  } catch (err) {
    console.error("Catalog migration/seed failed:", err);
  } finally {
    await pool.end();
  }
}

run();
