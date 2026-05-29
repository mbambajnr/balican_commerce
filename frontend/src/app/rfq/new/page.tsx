import type { Metadata } from "next";
import Link from "next/link";
import RfqPageClient from "./rfq-page-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Request a Quote — Bali-Can Limited",
  description: "Submit a request for quote (RFQ) for industrial products. Get custom pricing for HVAC, electricals, solar, and more. B2B procurement support across Ghana.",
  alternates: { canonical: "/rfq/new" },
  openGraph: {
    title: "Request a Quote — Bali-Can Limited",
    description: "Submit a request for quote (RFQ) for industrial products. Get custom pricing for HVAC, electricals, solar, and more.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Request a Quote — Bali-Can Limited",
    description: "Submit a request for quote (RFQ) for industrial products.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/rfq/new#webpage`,
      url: `${siteUrl}/rfq/new`,
      name: "Request a Quote — Bali-Can Limited",
      description: "Submit a request for quote (RFQ) for industrial products. Get custom pricing.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/rfq/new#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/rfq/new#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Request a Quote", item: `${siteUrl}/rfq/new` },
      ],
    },
  ],
};

export default function NewRfqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Request a Quote</li>
          </ol>
        </nav>
        <RfqPageClient />
      </div>
    </>
  );
}
