import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "B2B Industrial Procurement — Bali-Can Limited",
  description: "Streamlined B2B procurement for industrial products in Ghana. HVAC, electricals, solar, and equipment sourcing with custom pricing, company accounts, and nationwide delivery.",
  alternates: { canonical: "/b2b-procurement" },
  openGraph: {
    title: "B2B Industrial Procurement — Bali-Can Limited",
    description: "Streamlined B2B procurement for industrial products in Ghana. Company accounts, custom pricing, RFQ workflow, and nationwide delivery.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "B2B Industrial Procurement — Bali-Can Limited",
    description: "Streamlined B2B procurement for industrial products in Ghana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/b2b-procurement#webpage`,
      url: `${siteUrl}/b2b-procurement`,
      name: "B2B Industrial Procurement — Bali-Can Limited",
      description: "Streamlined B2B procurement for industrial products in Ghana.",
      isPartOf: { "@id": siteUrl },
      breadcrumb: { "@id": `${siteUrl}/b2b-procurement#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/b2b-procurement#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "B2B Procurement", item: `${siteUrl}/b2b-procurement` },
      ],
    },
    {
      "@type": "HowTo",
      name: "How to Procure Industrial Products with Bali-Can",
      description: "Step-by-step guide to the Bali-Can B2B procurement process.",
      step: [
        { "@type": "HowToStep", position: 1, name: "Browse Products", text: "Search and browse our catalog of industrial products by category or keyword." },
        { "@type": "HowToStep", position: 2, name: "Register Your Company", text: "Create a company account to access B2B pricing and submit RFQs." },
        { "@type": "HowToStep", position: 3, name: "Request a Quote", text: "Submit a request for quote (RFQ) for the products you need." },
        { "@type": "HowToStep", position: 4, name: "Receive Custom Pricing", text: "Our sales team responds with customized B2B pricing based on your requirements." },
        { "@type": "HowToStep", position: 5, name: "Place Your Order", text: "Confirm the quotation and place your order with negotiated terms." },
        { "@type": "HowToStep", position: 6, name: "Delivery & Installation", text: "We deliver nationwide and offer professional installation services." },
      ],
    },
  ],
};

export default function B2BProcurementPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">B2B Procurement</li>
          </ol>
        </nav>

        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">B2B Industrial Procurement</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Bali-Can Limited offers a streamlined procurement platform for businesses in Ghana. From HVAC and electrical equipment to solar energy systems and industrial supplies, we simplify the way you source and purchase industrial products.
        </p>

        {/* Why B2B */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Why Use Bali-Can for B2B Procurement?</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display font-semibold text-ink">Quote-First Pricing</h3>
              <p className="mt-1.5 text-sm text-soft">No public prices — negotiate custom pricing for your business volume and frequency.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display font-semibold text-ink">Company Accounts</h3>
              <p className="mt-1.5 text-sm text-soft">Dedicated company profiles with multi-user access, order history, and credit terms.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display font-semibold text-ink">Nationwide Delivery</h3>
              <p className="mt-1.5 text-sm text-soft">Reliable delivery to all 16 regions of Ghana, including remote industrial zones.</p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="font-display font-semibold text-ink">Technical Support</h3>
              <p className="mt-1.5 text-sm text-soft">Dedicated account managers and technical support for every B2B client.</p>
            </div>
          </div>
        </section>

        {/* Procurement Process */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Procurement Process</h2>
          <p className="mt-2 text-sm text-soft">Our B2B procurement process is designed to be transparent and efficient:</p>
          <ol className="mt-6 space-y-6">
            {[
              { step: 1, title: "Browse Our Catalog", desc: "Explore thousands of industrial products across HVAC, electrical, solar, appliances, and industrial equipment categories." },
              { step: 2, title: "Register Your Company", desc: "Create a free company account. Submit your business details and our team will review your application." },
              { step: 3, title: "Submit an RFQ", desc: "Request a quote for specific products with your desired quantities. Add any special requirements or delivery preferences." },
              { step: 4, title: "Receive Custom Pricing", desc: "Our sales team reviews your request and responds with pricing tailored to your business needs." },
              { step: 5, title: "Negotiate & Confirm", desc: "Review the quotation, negotiate terms if needed, and confirm your order." },
              { step: 6, title: "Delivery & Beyond", desc: "We handle logistics, delivery, and optional installation. Your dedicated account manager stays with you." },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{item.step}</span>
                <div>
                  <h3 className="font-display font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm text-soft">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Product Categories */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Product Categories</h2>
          <p className="mt-2 text-sm text-soft">We supply across these major categories:</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/products?category=hvac" className="rounded-xl border border-border p-4 text-sm hover:border-accent/30 transition-colors">
              <strong className="text-ink">HVAC &amp; Refrigeration</strong>
              <p className="mt-1 text-soft">Air conditioners, chillers, ventilation, spare parts</p>
            </Link>
            <Link href="/products?category=electrical" className="rounded-xl border border-border p-4 text-sm hover:border-accent/30 transition-colors">
              <strong className="text-ink">Electrical &amp; Power</strong>
              <p className="mt-1 text-soft">Cables, switchgear, transformers, distribution boards</p>
            </Link>
            <Link href="/products?category=solar" className="rounded-xl border border-border p-4 text-sm hover:border-accent/30 transition-colors">
              <strong className="text-ink">Solar &amp; Renewable Energy</strong>
              <p className="mt-1 text-soft">Panels, inverters, batteries, complete solar systems</p>
            </Link>
            <Link href="/products?category=industrial" className="rounded-xl border border-border p-4 text-sm hover:border-accent/30 transition-colors">
              <strong className="text-ink">Industrial Equipment</strong>
              <p className="mt-1 text-soft">Pumps, generators, motors, compressors, tools</p>
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Frequently Asked Questions</h2>
          <div className="mt-6 space-y-4">
            {[
              { q: "How do I create a company account?", a: "Visit our registration page and submit your company details. Our team will review and activate your account." },
              { q: "Can I get pricing without registering?", a: "Product prices are available to registered and approved B2B customers. Guests can browse the catalog and submit RFQs." },
              { q: "How long does the RFQ process take?", a: "Our sales team typically responds to RFQs within 24 hours on business days." },
              { q: "Do you offer credit terms?", a: "Yes, approved B2B customers may qualify for credit terms. Apply during the company registration or contact sales." },
              { q: "What areas do you deliver to?", a: "We deliver across all 16 regions of Ghana, including remote industrial areas." },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-border">
                <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-medium text-ink">
                  {faq.q}
                  <span className="text-muted transition-transform group-open:rotate-180">&darr;</span>
                </summary>
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <p className="text-sm text-soft">{faq.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/auth/register" className="btn btn-primary">Register Your Company</Link>
          <Link href="/rfq/new" className="btn">Request a Quote</Link>
          <Link href="/products" className="btn">Browse Products</Link>
          <Link href="/rfq-guide" className="btn">RFQ Guide</Link>
        </div>
      </div>
    </>
  );
}
