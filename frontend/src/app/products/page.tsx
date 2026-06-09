import type { Metadata } from "next";
import Link from "next/link";
import ProductListingClient from "./product-listing-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Industrial Products Catalog — Bali-Can Limited",
  description: "Browse our full catalog of industrial products across Ghana. HVAC, electricals, solar, appliances, and more from Bali-Can Limited.",
  alternates: { canonical: "/products" },
  openGraph: {
    title: "Industrial Products Catalog — Bali-Can Limited",
    description: "Browse our full catalog of industrial products across Ghana. HVAC, electricals, solar, appliances, and more.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Industrial Products Catalog — Bali-Can Limited",
    description: "Browse our full catalog of industrial products across Ghana.",
  },
};

const faqs = [
  {
    q: "How do I request a quote for bulk industrial products?",
    a: "Browse our catalog, select the products you need, and click 'Request Quote'. For bulk orders, use the multi-select feature to add multiple items before submitting your RFQ. Our sales team will respond with custom pricing within 24 business hours.",
  },
  {
    q: "Can I get pricing without registering a company account?",
    a: "Product prices are available to registered and approved B2B customers with negotiated pricing. Guest users can browse the catalog and submit RFQs — our sales team will respond with a formal quotation.",
  },
  {
    q: "What delivery options are available across Ghana?",
    a: "We deliver nationwide across all 16 regions of Ghana. In-stock products reach Greater Accra within 1-3 business days and regional areas within 3-7 business days. Special orders and bulk procurement delivery timelines are quoted at order confirmation.",
  },
  {
    q: "What is your returns and refund policy?",
    a: "We accept returns within 14 days of delivery for unused products in original packaging. Custom-ordered and installed products are non-returnable. See our full returns policy for details.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept Paystack (card payments), bank transfers, and approved credit terms for qualifying B2B customers. Payment terms are discussed during the quotation process.",
  },
  {
    q: "How do I check product availability?",
    a: "Each product listing shows current stock status (In Stock / Out of Stock). For large quantities or specific delivery timelines, please submit an RFQ and our team will confirm availability.",
  },
  {
    q: "Do you support company accounts with multiple users?",
    a: "Yes. Registered B2B companies can have multiple users with different roles (admin, buyer, finance, viewer). Each user can submit RFQs, place orders, and track history under the same company account.",
  },
  {
    q: "How does the quote-first pricing model work?",
    a: "Instead of displaying public retail prices, we provide customized B2B pricing based on your order volume, frequency, and requirements. Submit an RFQ, and our sales team will respond with a formal quotation tailored to your business.",
  },
];

export default function ProductsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Industrial Products Catalog",
        description: "Browse our full catalog of industrial products across Ghana. HVAC, electricals, solar, appliances, and more.",
        url: `${siteUrl}/products`,
        isPartOf: {
          "@type": "WebSite",
          url: siteUrl,
          name: "Bali-Can Limited",
        },
        breadcrumb: { "@id": `${siteUrl}/products#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${siteUrl}/products#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
          { "@type": "ListItem", position: 3, name: "Products", item: `${siteUrl}/products` },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.a,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-2 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li><Link href="/marketplace" className="hover:text-ink transition-colors">Marketplace</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Products</li>
          </ol>
        </nav>
        <p className="mb-6 text-[11px] text-soft">
          Products are part of the Bali-Can Marketplace.{' '}
          <Link href="/marketplace" className="text-accent hover:underline">Browse Marketplace</Link>
          {' '}or{' '}
          <Link href="/scout" className="text-accent hover:underline">use Scout</Link> for custom sourcing or service requests.
        </p>
        <ProductListingClient />

        <div className="mt-20 space-y-16">
          {/* Buying Guide */}
          <section className="rounded-2xl border border-border bg-surface/50 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-ink">Industrial Procurement Guide</h2>
            <p className="mt-3 text-sm leading-relaxed text-soft">
              Whether you need HVAC systems for a commercial building, electrical distribution equipment for an industrial facility,
              or solar solutions for an off-grid project, Bali-Can Limited streamlines your procurement process.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-ink">Who Should Buy</h3>
                <p className="text-sm text-soft">Contractors, facility managers, property developers, government agencies, NGOs, and businesses across Ghana needing reliable industrial supply chains.</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-ink">Key Considerations</h3>
                <p className="text-sm text-soft">Evaluate product specifications, brand reliability, warranty terms, installation requirements, and total cost of ownership — not just upfront price.</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-ink">Bulk Procurement</h3>
                <p className="text-sm text-soft">Volume discounts are available for qualifying B2B orders. Use the multi-select RFQ feature or contact our sales team for large-scale requirements.</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-ink">Request a Quote</h3>
                <p className="text-sm text-soft">Submit an RFQ for the products you need. Our team responds within 24 business hours with pricing, availability, and delivery timelines tailored to your requirements.</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-ink">Delivery & Returns</h3>
                <p className="text-sm text-soft">Nationwide delivery across all 16 regions. 14-day returns on unused products. Custom and installed items are non-returnable.</p>
              </div>
              <div className="space-y-2">
                <h3 className="font-display font-semibold text-ink">Company Accounts</h3>
                <p className="text-sm text-soft">Register your company for multi-user access, order history, streamlined RFQ, and negotiated pricing. Credit terms available for approved accounts.</p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/rfq/new" className="btn btn-primary btn-sm">Request a Quote</Link>
              <Link href="/b2b-procurement" className="btn btn-sm">B2B Procurement Guide</Link>
              <Link href="/rfq-guide" className="btn btn-sm">How to RFQ</Link>
              <Link href="/auth/register" className="btn btn-sm">Register Company</Link>
            </div>
          </section>

          {/* FAQ */}
          <section className="rounded-2xl border border-border bg-surface/50 p-6 sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-ink">Frequently Asked Questions</h2>
            <p className="mt-2 text-sm text-soft">Common questions about industrial procurement with Bali-Can Limited.</p>

            <div className="mt-6 space-y-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="group rounded-xl border border-border bg-white">
                  <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-medium text-ink">
                    {faq.q}
                    <span className="text-muted transition-transform group-open:rotate-180">&darr;</span>
                  </summary>
                  <div className="border-t border-border px-4 pb-4 pt-3">
                    <p className="text-sm leading-relaxed text-soft">{faq.a}</p>
                  </div>
                </details>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/rfq-guide" className="btn btn-sm">RFQ Guide</Link>
              <Link href="/shipping-policy" className="btn btn-sm">Shipping Policy</Link>
              <Link href="/returns-policy" className="btn btn-sm">Returns Policy</Link>
              <Link href="/contact" className="btn btn-sm">Contact Us</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
