import type { Metadata } from "next";
import MarketplacePageClient from "./marketplace-page-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "B2B Marketplace — Bali-Can Limited",
  description: "Browse industrial products, services, and verified suppliers across Ghana. Source HVAC, electrical, solar, plumbing, and industrial equipment from trusted B2B providers.",
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: "B2B Marketplace — Bali-Can Limited",
    description: "Browse industrial products, services, and verified suppliers across Ghana. Source HVAC, electrical, solar, plumbing, and industrial equipment.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "B2B Marketplace — Bali-Can Limited",
    description: "Browse industrial products, services, and verified suppliers across Ghana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/marketplace#webpage`,
      url: `${siteUrl}/marketplace`,
      name: "B2B Marketplace — Bali-Can Limited",
      description: "Browse industrial products, services, and verified suppliers across Ghana.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/marketplace#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/marketplace#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
      ],
    },
  ],
};

export default function MarketplacePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketplacePageClient />
    </>
  );
}
