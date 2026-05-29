import type { Metadata } from "next";
import Link from "next/link";
import BookingPageClient from "./booking-page-client";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Book Installation Service — Bali-Can Limited",
  description: "Schedule professional installation, maintenance, repair, or consultation for your industrial equipment across Ghana.",
  alternates: { canonical: "/booking" },
  openGraph: {
    title: "Book Installation Service — Bali-Can Limited",
    description: "Schedule professional installation, maintenance, repair, or consultation for your industrial equipment across Ghana.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Book Installation Service — Bali-Can Limited",
    description: "Schedule professional installation, maintenance, or repair services.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/booking#webpage`,
      url: `${siteUrl}/booking`,
      name: "Book Installation Service — Bali-Can Limited",
      description: "Schedule professional installation, maintenance, repair, or consultation for your industrial equipment across Ghana.",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/booking#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/booking#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Book a Service", item: `${siteUrl}/booking` },
      ],
    },
  ],
};

export default function BookingPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Book a Service</li>
          </ol>
        </nav>
        <BookingPageClient />
      </div>
    </>
  );
}
