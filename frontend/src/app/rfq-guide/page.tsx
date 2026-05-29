import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "How to Request a Quote (RFQ) — Bali-Can Limited",
  description: "Learn how to submit a Request for Quote (RFQ) for industrial products with Bali-Can Limited. Step-by-step guide for B2B procurement in Ghana.",
  alternates: { canonical: "/rfq-guide" },
  openGraph: {
    title: "How to Request a Quote (RFQ) — Bali-Can Limited",
    description: "Step-by-step guide for submitting an RFQ for industrial products with Bali-Can Limited.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "How to Request a Quote (RFQ) — Bali-Can Limited",
    description: "Step-by-step guide for submitting an RFQ for industrial products with Bali-Can Limited.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/rfq-guide#webpage`,
      url: `${siteUrl}/rfq-guide`,
      name: "How to Request a Quote (RFQ) — Bali-Can Limited",
      isPartOf: { "@id": siteUrl },
      breadcrumb: { "@id": `${siteUrl}/rfq-guide#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/rfq-guide#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "RFQ Guide", item: `${siteUrl}/rfq-guide` },
      ],
    },
    {
      "@type": "HowTo",
      name: "How to Submit a Request for Quote on Bali-Can",
      description: "Step-by-step guide to submitting an RFQ for industrial products.",
      estimatedCost: { "@type": "MonetaryAmount", currency: "GHS" },
      step: [
        { "@type": "HowToStep", position: 1, name: "Browse Products", url: `${siteUrl}/products`, text: "Find the products you need in our catalog. Use search and category filters to narrow results." },
        { "@type": "HowToStep", position: 2, name: "Select Items for Quote", url: `${siteUrl}/rfq/new`, text: "Click 'Request Quote' on individual products or use multi-select to request quotes for multiple items at once." },
        { "@type": "HowToStep", position: 3, name: "Fill in Your Details", text: "Provide your contact information, company name, delivery address, and any special requirements or notes." },
        { "@type": "HowToStep", position: 4, name: "Submit RFQ", text: "Review your request and submit. Our sales team will review and respond with customized pricing." },
        { "@type": "HowToStep", position: 5, name: "Receive Quotation", text: "You will receive a formal quotation with pricing, terms, and validity period. Review and respond." },
      ],
    },
  ],
};

export default function RfqGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">RFQ Guide</li>
          </ol>
        </nav>

        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">How to Request a Quote (RFQ)</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Bali-Can Limited uses a <strong>quote-first pricing model</strong>. Product prices are not displayed publicly — instead, you submit a Request for Quote (RFQ) and our sales team responds with pricing customized to your business needs.
        </p>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Why Quote-First Pricing?</h2>
          <p className="mt-2 text-sm text-soft">
            B2B pricing varies based on order volume, frequency, payment terms, and relationship. Our quote-first model ensures you receive the best possible pricing for your specific situation rather than generic retail prices.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Step-by-Step Guide</h2>
          <ol className="mt-6 space-y-6">
            {[
              { step: 1, title: "Browse Products", desc: "Visit our product catalog and browse by category or search for specific items. Use filters to narrow down by HVAC, electrical, solar, or industrial equipment.", link: "/products" },
              { step: 2, title: "Request a Quote", desc: "Click 'Request Quote' on any product page. You can also select multiple products from the listing page and request a bulk quote.", link: "/rfq/new" },
              { step: 3, title: "Provide Your Details", desc: "Fill in your contact information, company name, delivery location, and any special requirements. If you are a registered company, this information is pre-filled.", link: null },
              { step: 4, title: "Submit Your RFQ", desc: "Review your request and submit it. You will receive a confirmation email with your RFQ details.", link: null },
              { step: 5, title: "Wait for Response", desc: "Our sales team reviews your RFQ and prepares a formal quotation with pricing, terms, and availability. Typical response time is within 24 business hours.", link: null },
              { step: 6, title: "Review & Respond", desc: "Review your quotation, accept or negotiate terms, and proceed to order. You can track all your RFQs and quotations from your account dashboard.", link: null },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{item.step}</span>
                <div>
                  <h3 className="font-display font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm text-soft">{item.desc}</p>
                  {item.link && (
                    <Link href={item.link} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-bold transition-colors">
                      {item.link === "/products" ? "Browse Products" : "Go to RFQ Page"} &rarr;
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Tips for a Successful RFQ</h2>
          <ul className="mt-4 space-y-3 text-sm text-soft">
            <li><strong>Be specific</strong> — Include product quantities, preferred brands, and delivery timelines.</li>
            <li><strong>Register first</strong> — Registered company accounts receive faster responses and better pricing.</li>
            <li><strong>Bulk orders</strong> — Larger quantities often qualify for volume discounts. Mention your expected order volume.</li>
            <li><strong>Special requirements</strong> — Note any installation, training, or certification needs in your request.</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold text-ink">Frequently Asked Questions</h2>
          <div className="mt-6 space-y-4">
            {[
              { q: "Do I need to register to submit an RFQ?", a: "No, you can submit an RFQ as a guest. However, registered company accounts receive faster responses and access to negotiated pricing." },
              { q: "How long does it take to get a response?", a: "Our sales team typically responds within 24 hours on business days. Complex requests may take up to 48 hours." },
              { q: "Can I request quotes for multiple products at once?", a: "Yes, use the multi-select feature on the product listing page to select multiple products and submit one RFQ." },
              { q: "Is the quotation binding?", a: "Quotations are valid for the period stated in the document. Pricing and terms are confirmed at the time of order placement." },
              { q: "What payment methods are accepted?", a: "We accept Paystack (card payments), bank transfers, and approved credit terms for qualifying B2B customers." },
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
          <Link href="/rfq/new" className="btn btn-primary">Submit an RFQ</Link>
          <Link href="/auth/register" className="btn">Register Your Company</Link>
          <Link href="/b2b-procurement" className="btn">B2B Procurement Guide</Link>
        </div>
      </div>
    </>
  );
}
