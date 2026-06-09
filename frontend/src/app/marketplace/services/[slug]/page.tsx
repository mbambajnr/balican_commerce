import type { Metadata } from "next";
import ServiceDetailPageClient from "./service-detail-page-client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

async function getService(slug: string) {
  try {
    const res = await fetch(`${API}/marketplace/services/slug/${slug}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.service || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = await getService(slug);
  if (!service) {
    return {
      title: "Service Detail — B2B Marketplace — Bali-Can Limited",
      description: "View service details from verified providers on Bali-Can.",
    };
  }
  return {
    title: `${service.name} — B2B Marketplace — Bali-Can Limited`,
    description: service.description?.slice(0, 160) || `${service.name} service from ${service.provider_name} on Bali-Can. Request a quote for your business.`,
    alternates: { canonical: `/marketplace/services/${slug}` },
    openGraph: {
      title: `${service.name} — B2B Marketplace — Bali-Can Limited`,
      description: service.description?.slice(0, 160) || `${service.name} service from ${service.provider_name} on Bali-Can.`,
      type: "website",
      images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${service.name} — B2B Marketplace — Bali-Can Limited`,
      description: service.description?.slice(0, 160) || `${service.name} service from ${service.provider_name}.`,
    },
  };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getService(slug);

  const jsonLd = service ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${siteUrl}/marketplace/services/${slug}#service`,
        name: service.name,
        description: service.description?.slice(0, 200) || undefined,
        provider: {
          "@type": "Organization",
          name: service.provider_name,
        },
        url: `${siteUrl}/marketplace/services/${slug}`,
        isPartOf: { "@id": `${siteUrl}#website` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${siteUrl}/marketplace/services/${slug}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Marketplace", item: `${siteUrl}/marketplace` },
          { "@type": "ListItem", position: 3, name: "Services", item: `${siteUrl}/marketplace/services` },
          { "@type": "ListItem", position: 4, name: service.name, item: `${siteUrl}/marketplace/services/${slug}` },
        ],
      },
    ],
  } : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ServiceDetailPageClient slug={slug} />
    </>
  );
}
