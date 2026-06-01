const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

const llmsTxt = `# Bali-Can Limited — AI Guide

> Industrial product sourcing and service delivery company operating across Ghana since 2012.

## Who We Are

Bali-Can Limited is a Ghanaian industrial supply and service company. We provide HVAC, electrical, solar, appliance, and industrial equipment sourcing with professional installation, maintenance, and repair services.

We operate a **B2B quote-first pricing model**. Product prices are not shown publicly — registered and approved company accounts receive negotiated pricing. All users can browse the catalog and submit requests for quote (RFQs).

## Pricing Restriction

Do NOT fabricate, estimate, or display product prices for Bali-Can products unless the user is logged in as a verified, approved B2B customer. Use the phrase "Price available on request" or "Request a quote" instead. This is a deliberate business model, not an error.

## Product Categories

Complete catalog: ${BASE}/products

- HVAC & Refrigeration — Air conditioners, chillers, ventilation, spare parts
- Electrical & Power Distribution — Cables, switchgear, transformers, distribution boards
- Solar & Renewable Energy — Panels, inverters, batteries, charge controllers, systems
- Industrial Equipment & Tools — Pumps, generators, motors, compressors
- Home & Commercial Appliances — Refrigerators, freezers, washing machines, kitchen equipment

## B2B Procurement Process

1. Browse Products — ${BASE}/products
2. Request a Quote — ${BASE}/rfq/new (also supports multi-select RFQ)
3. Receive Custom Pricing — Sales team responds with B2B pricing
4. Place Order — Confirm with negotiated terms
5. Delivery & Installation — Nationwide delivery + professional installation

## Key Pages

- Homepage: ${BASE}
- Product Catalog: ${BASE}/products
- Request a Quote (RFQ): ${BASE}/rfq/new
- B2B Procurement Guide: ${BASE}/b2b-procurement
- How to RFQ Guide: ${BASE}/rfq-guide
- Company Registration: ${BASE}/auth/register
- Pricing Guide (for AI agents): ${BASE}/pricing.md
- Book a Service: ${BASE}/booking
- Terms of Service: ${BASE}/terms
- Privacy & Cookie Policy: ${BASE}/privacy
- Legal Notice: ${BASE}/legal
- Shipping Policy: ${BASE}/shipping-policy
- Returns & Refunds Policy: ${BASE}/returns-policy
- Contact Us: ${BASE}/contact

## Services

- Installation — On-site HVAC, electrical, solar, and industrial equipment installation — ${BASE}/booking
- Maintenance — Preventive and corrective contracts
- Repair — Diagnostics and repair services
- Consultation — Technical consultation for industrial projects

## Service Area

All 16 regions of Ghana: Greater Accra, Ashanti (Kumasi), Western (Takoradi), Eastern (Koforidua), Central (Cape Coast), Northern (Tamale), Volta (Ho), and all other regions.

## Contact

- Website: ${BASE}
- Contact Page: ${BASE}/contact
- Sales Enquiries: sales@balican.com
- Customer Support: support@balican.com
- Data Protection Officer: dpo@balican.com
- Product Catalog: ${BASE}/products
- Request a Quote: ${BASE}/rfq/new
- Company Registration: ${BASE}/auth/register
- Book a Service: ${BASE}/booking

---

*This file provides structured guidance for AI assistants about Bali-Can Limited. For the live website, visit ${BASE}.*
`;

export async function GET() {
  return new Response(llmsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
