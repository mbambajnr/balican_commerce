import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Returns & Refunds Policy — Bali-Can Limited",
  description: "Bali-Can Limited returns and refunds policy for industrial products. Information on warranties, returns process, and refund timelines.",
  alternates: { canonical: "/returns-policy" },
  openGraph: {
    title: "Returns & Refunds Policy — Bali-Can Limited",
    description: "Returns and refunds policy for industrial products from Bali-Can Limited.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Returns & Refunds Policy — Bali-Can Limited",
    description: "Returns and refunds policy for industrial products from Bali-Can Limited.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/returns-policy#webpage`,
      url: `${siteUrl}/returns-policy`,
      name: "Returns & Refunds Policy — Bali-Can Limited",
      description: "Returns and refunds policy for industrial products from Bali-Can Limited.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/returns-policy#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/returns-policy#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Returns & Refunds Policy", item: `${siteUrl}/returns-policy` },
      ],
    },
  ],
};

export default function ReturnsPolicyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
          <li>/</li>
          <li className="text-ink font-medium">Returns &amp; Refunds Policy</li>
        </ol>
      </nav>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Returns &amp; Refunds Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: May 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink">1. Returns Eligibility</h2>
          <p className="mt-2">
            We accept returns on products within 14 days of delivery under the following conditions:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>The product is unused and in its original packaging</li>
            <li>All accessories, manuals, and documentation are included</li>
            <li>The product was not custom-ordered or specially manufactured for your order</li>
            <li>A return authorization has been issued by our team</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">2. Non-Returnable Items</h2>
          <p className="mt-2">The following items cannot be returned:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Custom or specially manufactured products</li>
            <li>Products that have been installed or modified</li>
            <li>Perishable or consumable items</li>
            <li>Products returned without original packaging</li>
            <li>Products returned after 14 days from delivery</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">3. Return Process</h2>
          <ol className="mt-2 list-inside list-decimal space-y-2">
            <li>Contact our support team within 14 days of delivery to request a return authorization</li>
            <li>Provide your order number, product details, and reason for return</li>
            <li>Our team will review and issue a return authorization if eligible</li>
            <li>Pack the product securely in its original packaging</li>
            <li>Ship the product back to the address provided by our team</li>
            <li>Once received and inspected, we will process your refund or replacement</li>
          </ol>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">4. Refund Timelines</h2>
          <p className="mt-2">
            Approved refunds are processed within 5–10 business days after we receive and inspect the returned product. Refunds are issued to the original payment method. Payment processing times may vary depending on your bank or payment provider.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">5. Damaged or Defective Products</h2>
          <p className="mt-2">
            If you receive a damaged or defective product, contact us within 48 hours of delivery. We will arrange for a replacement or repair at no additional cost. Please include photos of the damage in your communication.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">6. B2B Returns</h2>
          <p className="mt-2">
            Returns for B2B customers are governed by the terms outlined in your company&apos;s service agreement or negotiated contract. Please refer to your agreement or contact your account manager for specific return terms.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/contact" className="btn btn-primary btn-sm">Contact Support</Link>
        <Link href="/b2b-procurement" className="btn btn-sm">B2B Procurement Guide</Link>
        <Link href="/products" className="btn btn-sm">Browse Products</Link>
        <Link href="/shipping-policy" className="btn btn-sm">Shipping Policy</Link>
      </div>
    </div>
    </>
  );
}
