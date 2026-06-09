import type { Metadata } from "next";
import MarketplaceProviderDetailPageClient from "./provider-detail-page-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

async function getProvider(id: string) {
  try {
    const res = await fetch(`${API}/marketplace/providers/${id}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.provider || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const provider = await getProvider(id);
  if (!provider) {
    return {
      title: "Provider — B2B Marketplace — Bali-Can Limited",
      description: "Browse verified suppliers and service providers on Bali-Can.",
    };
  }
  return {
    title: `${provider.name} — B2B Marketplace — Bali-Can Limited`,
    description: provider.description?.slice(0, 160) || `Browse products and services from ${provider.name}, a verified B2B provider on Bali-Can.`,
    alternates: { canonical: `/marketplace/providers/${id}` },
    openGraph: {
      title: `${provider.name} — B2B Marketplace — Bali-Can Limited`,
      description: provider.description?.slice(0, 160) || `Browse products and services from ${provider.name} on Bali-Can.`,
      type: "profile",
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${provider.name} — B2B Marketplace — Bali-Can Limited`,
      description: provider.description?.slice(0, 160) || `Browse products and services from ${provider.name}.`,
    },
  };
}

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provider = await getProvider(id);

  const jsonLd = provider ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${siteUrl}/marketplace/providers/${id}#business`,
        name: provider.name,
        description: provider.description?.slice(0, 200) || undefined,
        url: `${siteUrl}/marketplace/providers/${id}`,
        isPartOf: { "@id": `${siteUrl}#website` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${siteUrl}/marketplace/providers/${id}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
          { "@type": "ListItem", position: 3, name: "Providers", item: `${siteUrl}/marketplace/providers` },
          { "@type": "ListItem", position: 4, name: provider.name, item: `${siteUrl}/marketplace/providers/${id}` },
        ],
      },
    ],
  } : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <MarketplaceProviderDetailPageClient id={id} />
    </>
  );
}
