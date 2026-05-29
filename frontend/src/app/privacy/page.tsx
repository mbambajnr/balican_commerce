import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Privacy & Cookie Policy — Bali-Can Limited",
  description: "Bali-Can Limited privacy policy, cookie usage, and data handling practices. Learn how we collect, use, and protect your personal data.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy & Cookie Policy — Bali-Can Limited",
    description: "Bali-Can Limited privacy policy, cookie usage, and data handling practices.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy & Cookie Policy — Bali-Can Limited",
    description: "Bali-Can Limited privacy policy.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/privacy#webpage`,
      url: `${siteUrl}/privacy`,
      name: "Privacy & Cookie Policy — Bali-Can Limited",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/privacy#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/privacy#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Privacy & Cookie Policy", item: `${siteUrl}/privacy` },
      ],
    },
  ],
};

export default function PrivacyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Privacy &amp; Cookie Policy</li>
          </ol>
        </nav>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Privacy &amp; Cookie Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: May 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">
        <section>
          <h2 className="font-display text-lg font-semibold text-ink">1. Introduction</h2>
          <p className="mt-2">
            Bali-Can Limited (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is committed to protecting your
            privacy. This policy explains how we collect, use, and share your personal data when you visit our website,
            submit enquiries, place orders, or interact with our services.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">2. Information We Collect</h2>
          <div className="mt-2 space-y-3">
            <p><strong>Information you provide:</strong> Name, email, phone, company name, business details, billing
            address, tax/VAT numbers, and any details you submit through RFQ forms, registration, or order placement.</p>
            <p><strong>Technical information:</strong> IP address, browser type, device information, pages visited, and
            referring URLs.</p>
            <p><strong>Marketing &amp; advertising data:</strong> UTM parameters (<code>utm_source</code>,
            <code>utm_campaign</code>, <code>utm_medium</code>, etc.), GCLID, FBCLID, and click identifiers from search
            engines and social media platforms. This data may be stored alongside your enquiries and orders to help us
            measure the effectiveness of our advertising.</p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">3. Cookies</h2>
          <p className="mt-2">Our website uses the following categories of cookies:</p>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-zinc-50 p-4">
              <h3 className="font-semibold text-ink">Essential Cookies</h3>
              <p className="mt-1 text-soft">Required for the website to function properly. These include session tokens,
              authentication cookies, and security measures. You cannot opt out of essential cookies while using our
              platform.</p>
            </div>
            <div className="rounded-lg border border-border bg-zinc-50 p-4">
              <h3 className="font-semibold text-ink">Analytics Cookies</h3>
              <p className="mt-1 text-soft">Help us understand how visitors interact with our website. We use Google
              Analytics 4 to collect aggregated data about page views, traffic sources, and user behaviour. All data is
              anonymised. These cookies are only loaded with your consent.</p>
            </div>
            <div className="rounded-lg border border-border bg-zinc-50 p-4">
              <h3 className="font-semibold text-ink">Marketing &amp; Advertising Cookies</h3>
              <p className="mt-1 text-soft">Used to deliver relevant ads and measure ad campaign performance. We use
              Google Tag Manager, Google Ads, and Meta Pixel (Facebook) for this purpose. These cookies track your
              visit across websites and may build a profile of your interests. They are only loaded with your explicit
              consent.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">4. Consent Choices</h2>
          <p className="mt-2">
            When you first visit our website, you will see a cookie consent banner. You may choose:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Accept All</strong> &mdash; enables analytics and marketing cookies.</li>
            <li><strong>Essential Only</strong> &mdash; disables all non-essential cookies.</li>
          </ul>
          <p className="mt-2">
            Your choice is stored in your browser&apos;s local storage. You can change your selection at any time by
            clearing your cookies and local storage and reloading the page. You may also manage cookie preferences
            through your browser settings.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">5. How We Use Your Data</h2>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>To process and respond to your quote requests and orders</li>
            <li>To manage your company account and provide B2B services</li>
            <li>To communicate with you about your enquiries, orders, and account status</li>
            <li>To improve our website, products, and services through analytics</li>
            <li>To measure the performance of our advertising campaigns</li>
            <li>To comply with legal and regulatory obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">6. Data Sharing</h2>
          <p className="mt-2">
            We may share your data with trusted third-party service providers who help us operate our platform,
            process payments, and deliver email communications. These include:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Paystack (payment processing)</li>
            <li>Resend (email delivery)</li>
            <li>Google Analytics, Google Ads, Meta (advertising &amp; analytics &mdash; with consent only)</li>
          </ul>
          <p className="mt-2">
            We do not sell your personal data to third parties.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">7. Data Retention</h2>
          <p className="mt-2">
            We retain your personal data for as long as your account is active or as needed to provide you with
            services. UTM and attribution data associated with your enquiries and orders is retained for marketing
            analysis and reporting purposes. You may request deletion of your data by contacting us.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">8. Your Rights</h2>
          <p className="mt-2">
            Depending on your jurisdiction, you may have the right to access, correct, delete, or port your personal
            data, as well as the right to withdraw consent for marketing cookies at any time. To exercise these rights,
            please contact our data protection team.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">9. Contact</h2>
          <p className="mt-2">
            If you have questions about this policy or wish to exercise your data rights, please contact us at:
          </p>
          <p className="mt-2">
            <strong>Email:</strong> privacy@balican.com<br />
            <strong>Bali-Can Limited</strong><br />
            Accra, Ghana
          </p>
        </section>
      </div>
    </div>
    </>
  );
}
