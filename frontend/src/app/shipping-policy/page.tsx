import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Shipping Policy — Bali-Can Limited",
  description: "Bali-Can Limited shipping policy for industrial products across Ghana. Nationwide delivery to all 16 regions including Accra, Kumasi, Takoradi, and Tamale.",
  alternates: { canonical: "/shipping-policy" },
  openGraph: {
    title: "Shipping Policy — Bali-Can Limited",
    description: "Nationwide delivery of industrial products across all 16 regions of Ghana.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shipping Policy — Bali-Can Limited",
    description: "Nationwide delivery of industrial products across all 16 regions of Ghana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/shipping-policy#webpage`,
      url: `${siteUrl}/shipping-policy`,
      name: "Shipping Policy — Bali-Can Limited",
      description: "Bali-Can Limited shipping policy for industrial products across Ghana.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/shipping-policy#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/shipping-policy#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Shipping Policy", item: `${siteUrl}/shipping-policy` },
      ],
    },
  ],
};

export default function ShippingPolicyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
          <li>/</li>
          <li className="text-ink font-medium">Shipping Policy</li>
        </ol>
      </nav>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Shipping Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: May 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink">1. Delivery Coverage</h2>
          <p className="mt-2">
            Bali-Can Limited delivers industrial products and equipment across all 16 regions of Ghana. We serve both urban and remote industrial zones, including:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Greater Accra Region (Accra, Tema)</li>
            <li>Ashanti Region (Kumasi)</li>
            <li>Western Region (Takoradi, Sekondi)</li>
            <li>Eastern Region (Koforidua)</li>
            <li>Central Region (Cape Coast)</li>
            <li>Northern Region (Tamale)</li>
            <li>Volta Region (Ho)</li>
            <li>And all other regions across the country</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">2. Delivery Timeframes</h2>
          <div className="mt-2 space-y-3">
            <p><strong>In-stock products (Greater Accra):</strong> 1–3 business days</p>
            <p><strong>In-stock products (Regional):</strong> 3–7 business days depending on location</p>
            <p><strong>Special orders / bulk procurement:</strong> Quoted at time of order confirmation</p>
            <p><strong>Installation services:</strong> Scheduled separately based on service availability</p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">3. Shipping Costs</h2>
          <p className="mt-2">
            Shipping costs are calculated based on order weight, dimensions, and delivery location. Exact shipping fees are provided at checkout or at the time of quotation for B2B orders.
          </p>
          <p className="mt-2">
            For B2B customers with negotiated terms, shipping may be included as part of the service agreement. Contact our sales team for details.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">4. Order Processing</h2>
          <p className="mt-2">
            Orders placed before 14:00 on business days are processed the same day. Orders placed after 14:00 or on weekends/holidays are processed the next business day. You will receive a confirmation with tracking details once your order ships.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">5. Delivery Requirements</h2>
          <p className="mt-2">
            A valid delivery address and contact phone number are required for all orders. For large equipment or bulk deliveries, please ensure a responsible person is available to receive and inspect the goods at the time of delivery.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">6. Damaged or Missing Items</h2>
          <p className="mt-2">
            Inspect all deliveries immediately upon receipt. Report any damaged or missing items within 48 hours of delivery by contacting our support team. We will arrange replacements or repairs as needed.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/contact" className="btn btn-primary btn-sm">Contact Support</Link>
        <Link href="/b2b-procurement" className="btn btn-sm">B2B Procurement Guide</Link>
        <Link href="/products" className="btn btn-sm">Browse Products</Link>
        <Link href="/returns-policy" className="btn btn-sm">Returns Policy</Link>
      </div>
    </div>
    </>
  );
}
