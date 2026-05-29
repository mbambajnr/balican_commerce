import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Contact Us — Bali-Can Limited",
  description: "Contact Bali-Can Limited for industrial product sourcing, HVAC, electrical, solar, and B2B procurement services across Ghana.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Us — Bali-Can Limited",
    description: "Contact Bali-Can Limited for industrial product sourcing and services across Ghana.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Contact Us — Bali-Can Limited",
    description: "Contact Bali-Can Limited for industrial product sourcing and services across Ghana.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      "@id": `${siteUrl}/contact#business`,
      name: "Bali-Can Limited",
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      image: `${siteUrl}/og-default.png`,
      description: "End-to-end industrial product sourcing and service delivery across Ghana. HVAC, electricals, appliances, solar, and B2B procurement.",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Accra",
        addressRegion: "Greater Accra",
        addressCountry: "GH",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 5.6037,
        longitude: -0.1870,
      },
      telephone: "+233-XXX-XXX-XXXX",
      email: "info@balican.com",
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "09:00", closes: "13:00" },
      ],
      sameAs: [],
      contactPoint: [
        {
          "@type": "ContactPoint",
          telephone: "+233-XXX-XXX-XXXX",
          contactType: "sales",
          availableLanguage: ["English"],
        },
        {
          "@type": "ContactPoint",
          telephone: "+233-XXX-XXX-XXXX",
          contactType: "customer service",
          availableLanguage: ["English"],
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Contact Us", item: `${siteUrl}/contact` },
      ],
    },
  ],
};

export default function ContactPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Contact Us</li>
          </ol>
        </nav>

        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Contact Us</h1>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          Get in touch with Bali-Can Limited for product enquiries, quotes, service bookings, or general information.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Sales Enquiries</h2>
            <p className="mt-2 text-sm text-soft">For product pricing, quotes, and procurement.</p>
            <p className="mt-3 text-sm"><strong>Email:</strong> sales@balican.com</p>
            <p className="text-sm"><strong>Phone:</strong> +233-XXX-XXX-XXXX</p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Customer Support</h2>
            <p className="mt-2 text-sm text-soft">For order status, account help, and service issues.</p>
            <p className="mt-3 text-sm"><strong>Email:</strong> support@balican.com</p>
            <p className="text-sm"><strong>Phone:</strong> +233-XXX-XXX-XXXX</p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Service Bookings</h2>
            <p className="mt-2 text-sm text-soft">For installation, maintenance, and repair services.</p>
            <Link href="/booking" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-bold transition-colors">
              Book a Service &rarr;
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Office Address</h2>
            <p className="mt-2 text-sm text-soft">Bali-Can Limited<br />Accra, Greater Accra Region<br />Ghana</p>
            <p className="mt-3 text-sm"><strong>Hours:</strong> Mon–Fri 8:00–17:00, Sat 9:00–13:00</p>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/rfq/new" className="btn btn-primary btn-sm">Request a Quote</Link>
            <Link href="/products" className="btn btn-sm">Browse Products</Link>
            <Link href="/booking" className="btn btn-sm">Book a Service</Link>
            <Link href="/auth/register" className="btn btn-sm">Register Your Company</Link>
          </div>
        </div>
      </div>
    </>
  );
}
