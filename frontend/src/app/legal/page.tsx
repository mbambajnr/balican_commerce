import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Legal Notice — Bali-Can Limited",
  description: "Bali-Can Limited legal notice, company registration details, registered address, and corporate information.",
  alternates: { canonical: "/legal" },
  openGraph: {
    title: "Legal Notice — Bali-Can Limited",
    description: "Bali-Can Limited company registration and corporate information.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Legal Notice — Bali-Can Limited",
    description: "Bali-Can Limited company information.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/legal#webpage`,
      url: `${siteUrl}/legal`,
      name: "Legal Notice — Bali-Can Limited",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/legal#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/legal#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Legal Notice", item: `${siteUrl}/legal` },
      ],
    },
  ],
};

export default function LegalPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Legal Notice</li>
          </ol>
        </nav>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Legal Notice</h1>
        <p className="mt-2 text-sm text-muted">Last updated: June 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Company Information</h2>
            <div className="mt-3 space-y-2">
              <p><strong>Registered Name:</strong> Bali-Can Limited</p>
              <p><strong>Registered Address:</strong> Accra, Greater Accra Region, Ghana</p>
              <p><strong>Email:</strong> info@balican.com</p>
              <p><strong>Phone:</strong> +233 XXX XXX XXX</p>
              <p><strong>Website:</strong> <Link href="/" className="text-accent hover:underline">{siteUrl}</Link></p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Contact Information</h2>
            <div className="mt-3 space-y-2">
              <p><strong>General Enquiries:</strong> info@balican.com</p>
              <p><strong>Sales:</strong> sales@balican.com</p>
              <p><strong>Customer Support:</strong> support@balican.com</p>
              <p><strong>Legal:</strong> legal@balican.com</p>
              <p><strong>Privacy:</strong> privacy@balican.com</p>
              <p><strong>Data Protection Officer:</strong> dpo@balican.com</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Platform Overview</h2>
            <p className="mt-2">
              Bali-Can Limited operates a B2B procurement platform connecting industrial buyers with vetted
              suppliers across Ghana. The platform facilitates RFQ submissions, competitive quoting, company
              credit management, and order fulfilment for the HVAC, electrical, solar, and appliance sectors.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Dispute Resolution</h2>
            <p className="mt-2">
              Any disputes arising from the use of this Platform shall be governed by the laws of the Republic of
              Ghana and resolved in accordance with our Terms of Service. We encourage users to contact us directly
              at legal@balican.com to resolve any concerns before pursuing formal proceedings.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Regulatory Compliance</h2>
            <p className="mt-2">
              Bali-Can Limited complies with all applicable laws and regulations of the Republic of Ghana. The
              Platform implements appropriate technical and organisational measures to protect user data and
              ensure secure transactions.
            </p>
          </section>

        </div>
      </div>
    </>
  );
}
