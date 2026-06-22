import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Privacy & Data Protection Policy — Bali-Can Limited",
  description: "Bali-Can Limited privacy policy, data protection practices, and cookie usage. Covers Ghana Data Protection Act compliance, security measures, data subject rights, and DPO contact.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy & Data Protection Policy — Bali-Can Limited",
    description: "Bali-Can Limited privacy policy, data protection, and cookie usage.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy & Data Protection Policy — Bali-Can Limited",
    description: "Bali-Can Limited data protection and privacy policy.",
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
            privacy and personal data. This policy explains how we collect, use, share, and safeguard your personal
            data when you visit our website, submit enquiries, register a company, place orders, or interact with our
            services.
          </p>
          <p className="mt-2">
            We comply with the <strong>Data Protection Act, 2012 (Act 843)</strong> of the Republic of Ghana and,
            where applicable, the <strong>General Data Protection Regulation (GDPR)</strong> of the European Union.
            This policy forms part of our broader legal framework alongside our{" "}
            <Link href="/terms" className="text-accent hover:underline">Terms of Service</Link> and{" "}
            <Link href="/legal" className="text-accent hover:underline">Legal Notice</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">2. Data Controller</h2>
          <p className="mt-2">
            The data controller responsible for your personal data is:
          </p>
          <p className="mt-2">
            <strong>Bali-Can Limited</strong><br />
            Accra, Greater Accra, Ghana<br />
            <strong>Email:</strong> privacy@balican.com
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">3. Information We Collect</h2>
          <div className="mt-2 space-y-3">
            <p><strong>Information you provide:</strong> Name, email address, phone number, company name, business
            details, billing address, TIN (GRA), company registration documents, and any details you submit
            through RFQ forms, registration, credit applications, or order placement.</p>
            <p><strong>Account &amp; transactional data:</strong> Order history, quotation history, credit
            applications, credit limit, payment history, and communication preferences.</p>
            <p><strong>Technical information:</strong> IP address, browser type and version, device information,
            operating system, pages visited, referring URLs, and session duration.</p>
            <p><strong>Marketing &amp; advertising data:</strong> UTM parameters (<code>utm_source</code>,
            <code>utm_campaign</code>, <code>utm_medium</code>, <code>utm_content</code>, <code>utm_term</code>),
            GCLID (Google Click Identifier), FBCLID (Facebook Click Identifier), and other click identifiers from
            search engines and social media platforms. This data may be linked to your enquiries and orders to
            measure advertising effectiveness.</p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">4. Legal Basis for Processing</h2>
          <p className="mt-2">We process your personal data on the following lawful bases:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Contract performance:</strong> To process RFQs, quotations, orders, and manage your company account.</li>
            <li><strong>Legal obligation:</strong> To comply with tax, accounting, anti-money laundering, and regulatory requirements under Ghanaian law.</li>
            <li><strong>Legitimate interests:</strong> To improve our platform, prevent fraud, enforce our Terms of Service, and measure advertising performance. We balance these interests against your rights and freedoms.</li>
            <li><strong>Consent:</strong> For analytics cookies, marketing cookies, and marketing communications. You may withdraw consent at any time.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">5. How We Use Your Data</h2>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>To process and respond to your quote requests and orders</li>
            <li>To manage your company account, credit applications, and B2B services</li>
            <li>To communicate with you about enquiries, orders, account status, and policy updates</li>
            <li>To assess and verify company creditworthiness (where credit is applied for)</li>
            <li>To detect, prevent, and investigate fraudulent or prohibited activity</li>
            <li>To improve our website, products, and services through analytics</li>
            <li>To measure the performance of our advertising campaigns (with consent)</li>
            <li>To comply with legal and regulatory obligations under Ghanaian law</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">6. Cookies</h2>
          <p className="mt-2">Our website uses the following categories of cookies:</p>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-zinc-50 p-4">
              <h3 className="font-semibold text-ink">Essential Cookies</h3>
              <p className="mt-1 text-soft">Required for the website to function properly. These include session tokens,
              authentication cookies, and security measures. Legal basis: legitimate interest. You cannot opt out of
              essential cookies while using our platform.</p>
            </div>
            <div className="rounded-lg border border-border bg-zinc-50 p-4">
              <h3 className="font-semibold text-ink">Analytics Cookies</h3>
              <p className="mt-1 text-soft">Help us understand how visitors interact with our website. We use Google
              Analytics 4 to collect aggregated data about page views, traffic sources, and user behaviour. IP addresses
              are anonymised. These cookies are only loaded with your consent.</p>
            </div>
            <div className="rounded-lg border border-border bg-zinc-50 p-4">
              <h3 className="font-semibold text-ink">Marketing &amp; Advertising Cookies</h3>
              <p className="mt-1 text-soft">Used to deliver relevant ads and measure ad campaign performance. We use
              Google Tag Manager, Google Ads, and Meta Pixel (Facebook). These cookies may track your visit across
              websites and build a profile of your interests. They are only loaded with your explicit consent.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">7. Consent Choices</h2>
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
            through your browser settings. Withdrawal of consent does not affect the lawfulness of processing carried
            out before withdrawal.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">8. Data Sharing &amp; Processors</h2>
          <p className="mt-2">
            We share your personal data with trusted third-party service processors who help us operate our platform.
            All processors are contractually bound to process data only on our instructions and to implement appropriate
            technical and organisational security measures.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Paystack</strong> &mdash; payment processing (card, mobile money, bank transfer)</li>
            <li><strong>Resend</strong> &mdash; email delivery and communications</li>
            <li><strong>Google Analytics, Google Ads, Meta</strong> &mdash; advertising and analytics (with consent only)</li>
          </ul>
          <p className="mt-2">
            We do not sell your personal data to third parties. Where we share data with suppliers to fulfil orders,
            such sharing is limited to what is necessary for the transaction.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">9. International Data Transfers</h2>
          <p className="mt-2">
            Your personal data may be transferred to and processed in countries outside Ghana, including the United
            States (where our cloud service providers, analytics tools, and email processors are based). Where such
            transfers occur, we ensure appropriate safeguards are in place, including:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Standard contractual clauses (where applicable under GDPR)</li>
            <li>Data processing agreements with all third-party processors</li>
            <li>Verification of adequacy decisions for the recipient country</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">10. Data Retention</h2>
          <p className="mt-2">
            We retain your personal data only for as long as necessary to fulfil the purposes for which it was
            collected, including for legal, accounting, and tax compliance purposes.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Account data:</strong> Retained for the duration of your active account plus 6 years after closure (Ghanaian tax/statutory requirements).</li>
            <li><strong>Transaction data:</strong> Retained for 6 years from the date of the transaction.</li>
            <li><strong>Marketing attribution data (UTM, GCLID, FBCLID):</strong> Retained for 2 years from collection for advertising analysis.</li>
            <li><strong>Cookie consent records:</strong> Retained for 1 year after your last visit.</li>
          </ul>
          <p className="mt-2">
            You may request earlier deletion of your data, subject to our legal retention obligations.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">11. Security Measures</h2>
          <p className="mt-2">
            We implement appropriate technical and organisational measures to protect your personal data against
            unauthorised access, alteration, disclosure, or destruction:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Encryption:</strong> All data transmitted between your browser and our servers is encrypted using TLS 1.3. Sensitive data at rest is encrypted using AES-256.</li>
            <li><strong>Access controls:</strong> Strict role-based access controls (RBAC) limit data access to authorised personnel only. Authentication uses hashed passwords (argon2) and JWT tokens.</li>
            <li><strong>Audit logging:</strong> All access to personal data and account actions are logged for security monitoring.</li>
            <li><strong>Regular backups:</strong> Encrypted backups are performed regularly and tested for restoration.</li>
            <li><strong>Vulnerability management:</strong> Dependencies are regularly audited and patched.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">12. Data Breach Notification</h2>
          <p className="mt-2">
            In the event of a data breach that is likely to result in a risk to your rights and freedoms, we will:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Notify the <strong>Data Protection Commission (DPC)</strong> of Ghana within 72 hours of becoming aware of the breach.</li>
            <li>Notify affected data subjects without undue delay if the breach poses a high risk to their rights.</li>
            <li>Document all breaches, including their facts, effects, and remedial actions taken.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">13. Automated Decision-Making</h2>
          <p className="mt-2">
            We use automated credit vetting heuristics to assess company creditworthiness. These assessments are
            advisory and do not constitute final credit decisions. All credit approvals, rejections, and limit
            determinations are made or reviewed by human personnel. You have the right to request human review of
            any automated assessment that affects you.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">14. Your Rights</h2>
          <p className="mt-2">
            Under the Data Protection Act, 2012 (Act 843) and, where applicable, the GDPR, you have the following
            rights:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li><strong>Right of access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Right to rectification:</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong>Right to erasure (&ldquo;right to be forgotten&rdquo;):</strong> Request deletion of your personal data, subject to legal retention obligations.</li>
            <li><strong>Right to restrict processing:</strong> Request limitation of how we use your data.</li>
            <li><strong>Right to data portability:</strong> Request transfer of your data to another service provider in a structured, machine-readable format.</li>
            <li><strong>Right to object:</strong> Object to processing based on legitimate interests, including direct marketing.</li>
            <li><strong>Right to withdraw consent:</strong> Withdraw consent for analytics/marketing cookies at any time.</li>
            <li><strong>Right to lodge a complaint:</strong> Lodge a complaint with the Data Protection Commission (DPC) of Ghana if you believe your rights have been violated.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">15. Children&apos;s Privacy</h2>
          <p className="mt-2">
            Our platform is intended for business-to-business use and is not directed at individuals under the age of
            18. We do not knowingly collect personal data from minors. If we become aware that a minor has provided us
            with personal data, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">16. Data Protection Officer</h2>
          <p className="mt-2">
            We have appointed a Data Protection Officer (DPO) who is responsible for overseeing our data protection
            strategy and compliance. You may contact our DPO at:
          </p>
          <p className="mt-2">
            <strong>Email:</strong> dpo@balican.com<br />
            <strong>Bali-Can Limited</strong><br />
            Accra, Greater Accra, Ghana
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">17. Complaints &amp; Regulator</h2>
          <p className="mt-2">
            If you are unsatisfied with our response to a data protection concern, you have the right to lodge a
            complaint with the supervisory authority:
          </p>
          <p className="mt-2">
            <strong>Data Protection Commission (DPC), Ghana</strong><br />
            P.O. Box CT 5096, Cantonments, Accra<br />
            <strong>Website:</strong> www.dpc.gov.gh<br />
            <strong>Email:</strong> info@dpc.gov.gh
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">18. Changes to This Policy</h2>
          <p className="mt-2">
            We may update this policy from time to time. Material changes will be notified to registered users via
            email or through the Platform. The &ldquo;Last updated&rdquo; date at the top of this page indicates when
            the policy was last revised. Continued use of the Platform after changes take effect constitutes
            acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink">19. Contact</h2>
          <p className="mt-2">
            If you have questions about this policy, wish to exercise your data rights, or report a data protection
            concern, please contact:
          </p>
          <p className="mt-2">
            <strong>Data Protection Officer:</strong> dpo@balican.com<br />
            <strong>Privacy enquiries:</strong> privacy@balican.com<br />
            <strong>Bali-Can Limited</strong><br />
            Accra, Greater Accra, Ghana
          </p>
        </section>

      </div>
    </div>
    </>
  );
}
