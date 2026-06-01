import type { Metadata } from "next";
import Link from "next/link";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Terms of Service — Bali-Can Limited",
  description: "Bali-Can Limited terms and conditions for B2B procurement, company registration, RFQ submissions, company credit, and platform usage. Governing law: Ghana.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service — Bali-Can Limited",
    description: "Terms and conditions for using the Bali-Can B2B procurement platform.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service — Bali-Can Limited",
    description: "Terms and conditions for using the Bali-Can B2B procurement platform.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${siteUrl}/terms#webpage`,
      url: `${siteUrl}/terms`,
      name: "Terms of Service — Bali-Can Limited",
      isPartOf: { "@id": `${siteUrl}#website` },
      breadcrumb: { "@id": `${siteUrl}/terms#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${siteUrl}/terms#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Terms of Service", item: `${siteUrl}/terms` },
      ],
    },
  ],
};

export default function TermsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
            <li>/</li>
            <li className="text-ink font-medium">Terms of Service</li>
          </ol>
        </nav>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: June 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-ink/80">

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">1. Acceptance of Terms</h2>
            <p className="mt-2">
              By accessing or using the Bali-Can Limited platform (&ldquo;Platform&rdquo;), including browsing
              products, submitting RFQs, registering a company account, or placing orders, you agree to be bound by
              these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, do not use the Platform.
            </p>
            <p className="mt-2">
              These Terms constitute a legally binding agreement between you (and the entity you represent) and
              Bali-Can Limited (&ldquo;Bali-Can&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By registering a
              company account, you represent that you have the authority to bind that entity.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">2. Platform Description</h2>
            <p className="mt-2">
              Bali-Can operates a B2B procurement platform that connects industrial buyers with vetted suppliers.
              The Platform facilitates the submission of Requests for Quote (RFQs), competitive quoting, company
              credit management, and order fulfilment. Bali-Can acts as an intermediary and does not itself sell,
              resell, or take title to the products listed on the Platform unless expressly stated.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">3. Eligibility &amp; Registration</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Eligibility:</strong> The Platform is available to businesses, companies, and other legal
              entities. You must be at least 18 years old and have the legal capacity to enter into binding contracts.
              Consumer (B2C) purchases are not supported.</p>
              <p><strong>Registration:</strong> You must provide accurate, complete, and current information during
              registration. You are responsible for maintaining the confidentiality of your account credentials and
              for all activities that occur under your account.</p>
              <p><strong>Verification:</strong> Bali-Can reserves the right to verify company details, request
              supporting documentation, and reject or suspend any registration at its sole discretion.</p>
              <p><strong>Sub-users:</strong> Company account holders may create sub-user accounts with assigned roles
              (company_admin, buyer, finance, viewer). The primary account holder is responsible for all actions
              taken by sub-users.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">4. Quote-First Pricing Model</h2>
            <p className="mt-2">
              Bali-Can operates a quote-first pricing model. Product prices are not publicly displayed. Registered
              and approved B2B buyers may receive custom pricing based on company-specific or customer-group
              agreements. No prices displayed on the Platform constitute an offer to sell. All prices are indicative
              and subject to confirmation by the supplier through the quotation process.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">5. RFQs &amp; Quotations</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Submission:</strong> Submitting an RFQ is a request for a quote and does not constitute a
              binding order. Bali-Can does not guarantee that any supplier will respond to an RFQ.</p>
              <p><strong>Quotations:</strong> Quotes provided by suppliers are valid for the period stated in the
              quotation. Acceptance of a quotation creates a binding agreement between the buyer and the supplier.
              Bali-Can is not a party to that agreement.</p>
              <p><strong>Product Links:</strong> Quotations may include product links for reference. These links
              do not display pricing to unauthorised users and are provided for product identification only.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">6. Orders &amp; Fulfilment</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Order Placement:</strong> When you accept a quotation and place an order, a legally binding
              contract for the purchase of goods or services is formed directly between you and the supplier.</p>
              <p><strong>Order Management:</strong> Order status, tracking, and fulfilment are managed through the
              Platform. Bali-Can facilitates communication but does not guarantee delivery timelines set by
              suppliers.</p>
              <p><strong>Cancellation:</strong> Order cancellation is subject to the supplier&apos;s cancellation
              policy. Bali-Can may assist in cancellation requests but cannot compel a supplier to accept a
              cancellation.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">7. Company Credit</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Application:</strong> Registered companies may apply for credit. Credit approval is at
              Bali-Can&apos;s sole discretion and is subject to a separate credit assessment.</p>
              <p><strong>Terms:</strong> Approved credit is subject to the specific terms set at approval, including
              credit limit, payment terms, and review dates. Bali-Can may suspend or revoke credit at any time for
              breach of these Terms or for credit risk reasons.</p>
              <p><strong>Repayment:</strong> All credit amounts must be repaid in accordance with the agreed payment
              terms. Late payments may incur interest charges and suspension of credit facilities.</p>
              <p><strong>Set-off:</strong> Bali-Can reserves the right to set off any amounts owed by a company
              against any amounts owed to that company.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">8. Supplier Credit</h2>
            <p className="mt-2">
              Suppliers and service providers on the Platform may be assessed and assigned a credit tier
              (Premium, Standard, Basic, or Unrated). Credit tier information is provided for buyer reference
              only and does not constitute a guarantee of supplier performance. Bali-Can makes no representations
              or warranties regarding the accuracy of supplier credit assessments.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">9. Payment Terms</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Payment Methods:</strong> Payments may be made via Paystack (card, mobile money, bank
              transfer), company credit, or other methods made available on the Platform.</p>
              <p><strong>Invoicing:</strong> Invoices are generated upon order confirmation and are payable
              according to the terms specified on the invoice or in the applicable credit agreement.</p>
              <p><strong>Taxes:</strong> All prices are exclusive of applicable taxes unless stated otherwise.
              Buyers are responsible for all taxes, duties, and levies.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">10. Prohibited Conduct</h2>
            <p className="mt-2">You agree not to:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Use the Platform for any unlawful purpose or in violation of Ghanaian law</li>
              <li>Submit false or misleading information during registration or RFQ submission</li>
              <li>Attempt to access, manipulate, or extract data from the Platform without authorisation</li>
              <li>Interfere with the proper functioning of the Platform or any transactions conducted through it</li>
              <li>Circumvent pricing, credit, or access controls implemented on the Platform</li>
              <li>Create multiple accounts to abuse credit facilities or promotional offerings</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any entity</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">11. Intellectual Property</h2>
            <p className="mt-2">
              All content on the Platform, including text, graphics, logos, software, and data compilations, is
              the property of Bali-Can Limited or its licensors and is protected by Ghanaian and international
              intellectual property laws. You may not reproduce, distribute, modify, or create derivative works
              without our prior written consent.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">12. Limitation of Liability</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Platform as Intermediary:</strong> Bali-Can provides the Platform as an intermediary.
              We are not liable for the quality, safety, or legality of products offered by suppliers, nor for
              the accuracy of supplier-provided information.</p>
              <p><strong>No Warranties:</strong> The Platform is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo; without warranties of any kind, either express or implied.</p>
              <p><strong>Limitation:</strong> To the maximum extent permitted by law, Bali-Can&apos;s total
              liability for any claim arising from or relating to these Terms or the Platform shall not exceed
              the total fees paid by you to Bali-Can in the twelve (12) months preceding the claim.</p>
              <p><strong>Indirect Damages:</strong> Bali-Can shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, including lost profits, loss of data, or business
              interruption.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">13. Indemnification</h2>
            <p className="mt-2">
              You agree to indemnify, defend, and hold harmless Bali-Can Limited, its officers, directors,
              employees, and agents from and against any claims, liabilities, damages, losses, and expenses
              arising out of or in any way connected with your use of the Platform, your breach of these Terms,
              or your violation of any law or the rights of any third party.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">14. Termination</h2>
            <div className="mt-2 space-y-3">
              <p><strong>By You:</strong> You may terminate your account at any time by contacting us. Outstanding
              obligations (including unpaid invoices) will survive termination.</p>
              <p><strong>By Us:</strong> Bali-Can may suspend or terminate your account immediately, without
              notice, if you breach these Terms, if your company credit status is suspended, or if we determine
              that your use of the Platform poses a risk to us or other users.</p>
              <p><strong>Effect of Termination:</strong> Upon termination, your right to use the Platform ceases.
              Clauses regarding payment, intellectual property, limitation of liability, indemnification, and
              dispute resolution survive termination.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">15. Dispute Resolution &amp; Governing Law</h2>
            <div className="mt-2 space-y-3">
              <p><strong>Governing Law:</strong> These Terms are governed by and construed in accordance with the
              laws of the Republic of Ghana.</p>
              <p><strong>Negotiation:</strong> In the event of a dispute, the parties agree to first attempt to
              resolve the matter through informal negotiation within 30 days.</p>
              <p><strong>Arbitration:</strong> If negotiation fails, the dispute shall be resolved by binding
              arbitration in Accra, Ghana, in accordance with the rules of the Ghana Arbitration Centre. The
              decision of the arbitrator shall be final and binding.</p>
              <p><strong>Exceptions:</strong> Either party may seek injunctive or equitable relief from a court
              of competent jurisdiction to protect its intellectual property rights.</p>
            </div>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">16. Modifications</h2>
            <p className="mt-2">
              Bali-Can reserves the right to modify these Terms at any time. Material changes will be notified
              to registered users via email or through the Platform. Continued use of the Platform after changes
              take effect constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-ink">17. Contact</h2>
            <p className="mt-2">
              For questions about these Terms, please contact:
            </p>
            <p className="mt-2">
              <strong>Email:</strong> legal@balican.com<br />
              <strong>Bali-Can Limited</strong><br />
              Accra, Greater Accra<br />
              Ghana
            </p>
          </section>

        </div>
      </div>
    </>
  );
}
