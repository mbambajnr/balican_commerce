import type { Metadata } from "next";
import MarketplaceProvidersPageClient from "./providers-page-client";

export const metadata: Metadata = {
  title: "Providers — B2B Marketplace — Bali-Can Limited",
  description: "Browse verified suppliers and service providers on Bali-Can. Find HVAC, electrical, solar, plumbing, and industrial service providers across Ghana.",
  alternates: { canonical: "/marketplace/providers" },
  openGraph: {
    title: "Providers — B2B Marketplace — Bali-Can Limited",
    description: "Browse verified suppliers and service providers on Bali-Can for your business needs in Ghana.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Providers — B2B Marketplace — Bali-Can Limited",
    description: "Browse verified suppliers and service providers on Bali-Can.",
  },
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${siteUrl}/marketplace/providers#webpage`,
      url: `${siteUrl}/marketplace/providers`,
      name: "Providers — B2B Marketplace — Bali-Can Limited",
      description: "Browse verified suppliers and service providers on Bali-Can.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/marketplace/providers#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/marketplace/providers#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
        { "@type": "ListItem", position: 3, name: "Providers", item: `${siteUrl}/marketplace/providers` },
      ],
    },
  ],
};

export default function ProvidersPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketplaceProvidersPageClient />
    </>
  );
}
