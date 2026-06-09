import type { Metadata } from "next";
import MarketplaceServicesPageClient from "./services-page-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Service Providers — B2B Marketplace — Bali-Can Limited",
  description: "Find verified service providers for HVAC installation, electrical, solar, plumbing, and facility management services across Ghana.",
  alternates: { canonical: "/marketplace/services" },
  openGraph: {
    title: "Service Providers — B2B Marketplace — Bali-Can Limited",
    description: "Find verified service providers for HVAC installation, electrical, solar, plumbing, and facility management across Ghana.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Service Providers — B2B Marketplace — Bali-Can Limited",
    description: "Find verified service providers for your business needs across Ghana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${siteUrl}/marketplace/services#webpage`,
      url: `${siteUrl}/marketplace/services`,
      name: "Service Providers — B2B Marketplace — Bali-Can Limited",
      description: "Find verified service providers for HVAC installation, electrical, solar, plumbing, and facility management across Ghana.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/marketplace/services#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/marketplace/services#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
        { "@type": "ListItem", position: 3, name: "Services", item: `${siteUrl}/marketplace/services` },
      ],
    },
  ],
};

export default function MarketplaceServicesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketplaceServicesPageClient />
    </>
  );
}
