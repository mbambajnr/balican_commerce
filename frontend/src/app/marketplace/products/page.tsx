import type { Metadata } from "next";
import MarketplaceProductsPageClient from "./products-page-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Products — B2B Marketplace — Bali-Can Limited",
  description: "Browse industrial products from verified suppliers in Ghana. Shop HVAC, electrical, solar, plumbing, and industrial equipment with B2B pricing.",
  alternates: { canonical: "/marketplace/products" },
  openGraph: {
    title: "Products — B2B Marketplace — Bali-Can Limited",
    description: "Browse industrial products from verified suppliers in Ghana. Shop HVAC, electrical, solar, plumbing, and industrial equipment.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Products — B2B Marketplace — Bali-Can Limited",
    description: "Browse industrial products from verified suppliers in Ghana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${siteUrl}/marketplace/products#webpage`,
      url: `${siteUrl}/marketplace/products`,
      name: "Products — B2B Marketplace — Bali-Can Limited",
      description: "Browse industrial products from verified suppliers in Ghana.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/marketplace/products#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/marketplace/products#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
        { "@type": "ListItem", position: 3, name: "Products", item: `${siteUrl}/marketplace/products` },
      ],
    },
  ],
};

export default function MarketplaceProductsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketplaceProductsPageClient />
    </>
  );
}
