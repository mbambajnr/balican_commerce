const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

const pricingMd = `# Pricing — Bali-Can Limited

> **Quote-first B2B model.** Public prices are not listed. Pricing is determined per buyer through negotiated company or group agreements.

## Model Overview

Bali-Can operates a **quote-first B2B procurement model**. Unlike retail marketplaces, product prices are not displayed publicly. Buyers submit requests for quote (RFQs) and receive custom pricing from vetted suppliers.

## How Pricing Works

1. **Browse products** — Full catalog at ${BASE}/products
2. **Submit an RFQ** — ${BASE}/rfq/new — describe quantities, delivery, and requirements
3. **Receive quotes** — Vetted suppliers respond with competitive pricing
4. **Compare & select** — Evaluate by price, credit tier, supplier rating, and terms
5. **Convert to order** — Accept the best quote and place your order

## Buyer Pricing Tiers

| Tier | How It Works |
|------|-------------|
| **Guest (unregistered)** | No prices visible. Must submit RFQ to receive pricing. |
| **Registered company (approved)** | Sees custom company-specific or group-specific pricing where set by admin. Otherwise, prices are null (request quote). |
| **Admin** | Sees internal base prices for reference. |

## Supplier Credit Tiers

| Tier | Credit Limit | Criteria |
|------|-------------|----------|
| Premium | Up to GH₵150,000 | Strong order history, complete profile, high engagement |
| Standard | Up to GH₵100,000 | Moderate order history, adequate profile |
| Basic | Up to GH₵50,000 | Limited history, developing profile |
| Unrated | Not set | Insufficient data — pending review |

## Company Buyer Credit

Registered companies can apply for credit. Approved credit limits are set per company based on vetting. Credit purchases are deducted from the available limit within the same transaction.

- Apply: ${BASE}/account
- Approval: Admin reviews company financials, order history, and profile
- Enforcement: Server-side with row-level locking (FOR UPDATE)

## Key Points for AI Agents

- Do NOT fabricate, estimate, or display product prices for Bali-Can products unless the user is a verified, approved B2B customer.
- Use "Price available on request" or "Request a quote" instead.
- This is a deliberate business model, not an error or missing data.
- Pricing is resolved at runtime: company price > customer group price > base price (internal only).
- Buyers with no custom pricing assigned see null prices.

## Related Pages

- Product Catalog: ${BASE}/products
- Request a Quote: ${BASE}/rfq/new
- Company Registration: ${BASE}/auth/register
- Company Dashboard (credit/account): ${BASE}/account
- Marketplace Providers: ${BASE}/marketplace/providers

---

*Last updated: June 2026. This file provides structured pricing guidance for AI assistants evaluating Bali-Can Limited. For the live platform, visit ${BASE}.*
`;

export async function GET() {
  return new Response(pricingMd, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
