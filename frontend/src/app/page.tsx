import Link from "next/link";
import { ArrowRight, ClipboardText, ShieldCheck, Users, ShoppingBag, CreditCard, Gear, Truck } from "@phosphor-icons/react/dist/ssr";
import { Reveal, Counter } from "@/lib/reveal";
import HeroCarousel from "@/components/hero-carousel";
import FeaturedProductCarousel from "@/components/featured-products";
import TestimonialCarousel from "@/components/testimonial-carousel";
import type { Metadata } from "next";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://balican.com";

export const metadata: Metadata = {
  title: "Bali-Can Limited — B2B Procurement Platform",
  description: "Ghana's B2B procurement platform for industrial products and services. Submit RFQs, receive competitive quotes from vetted suppliers, manage company credit, and fulfill orders — HVAC, electrical, solar, and more.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Bali-Can Limited — B2B Procurement Platform",
    description: "Submit RFQs, receive competitive quotes from vetted suppliers, manage company credit, and fulfill orders — HVAC, electrical, solar, and more.",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bali-Can Limited — B2B Procurement Platform",
    description: "Ghana's B2B procurement platform. RFQs, competitive quotes, vetted suppliers, company credit.",
  },
};

const faqSchema = {
  "@type": "FAQPage",
  "@id": `${siteUrl}#faq`,
  mainEntity: [
    { "@type": "Question", name: "What is Bali-Can?", acceptedAnswer: { "@type": "Answer", text: "Bali-Can Limited is Ghana's B2B procurement platform connecting industrial buyers with vetted suppliers. We serve the HVAC, electrical, solar, and appliance sectors with a quote-first sourcing model." } },
    { "@type": "Question", name: "How does B2B procurement work on Bali-Can?", acceptedAnswer: { "@type": "Answer", text: "Buyers submit RFQs describing their requirements. Vetted suppliers respond with competitive quotes. Buyers compare offers by price, credit tier, and supplier rating, then accept the best fit and convert to an order." } },
    { "@type": "Question", name: "Why don't I see prices on products?", acceptedAnswer: { "@type": "Answer", text: "Bali-Can operates a quote-first model. Product prices are not publicly listed. Registered B2B buyers receive custom pricing based on their company or group agreements after submitting an RFQ." } },
    { "@type": "Question", name: "How do I submit a request for quote?", acceptedAnswer: { "@type": "Answer", text: "Register your company, then submit a procurement request specifying products, quantities, and delivery timeline. You can invite specific suppliers or open the request to all vetted providers." } },
    { "@type": "Question", name: "Are suppliers on Bali-Can vetted?", acceptedAnswer: { "@type": "Answer", text: "Yes. Every supplier is assessed for reliability with a tiered credit system: Premium, Standard, and Basic. Buyers can see supplier trust scores, response rates, and credit tiers before selecting a provider." } },
    { "@type": "Question", name: "Does Bali-Can offer company credit?", acceptedAnswer: { "@type": "Answer", text: "Yes. Registered companies can apply for credit. Once approved, buyers can place orders on payment terms without upfront payment. Credit limits are set per company based on vetting." } },
    { "@type": "Question", name: "What industries does Bali-Can serve?", acceptedAnswer: { "@type": "Answer", text: "We serve industrial procurement across HVAC, electrical, solar energy, appliances, and related B2B sectors in Ghana. Our platform covers all 16 regions." } },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}#organization`,
      name: "Bali-Can Limited",
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      description: "B2B procurement platform for industrial products and services across Ghana.",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Accra",
        addressRegion: "Greater Accra",
        addressCountry: "GH",
      },
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
      sameAs: [],
    },
    {
      "@type": "LocalBusiness",
      "@id": `${siteUrl}#localbusiness`,
      name: "Bali-Can Limited",
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      description: "B2B procurement platform for industrial products and services across Ghana. HVAC, electricals, appliances, solar, RFQs, quotes, and company credit.",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Accra",
        addressRegion: "Greater Accra",
        addressCountry: "GH",
      },
      telephone: "+233-XXX-XXX-XXXX",
      email: "info@balican.com",
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" },
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "09:00", closes: "13:00" },
      ],
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}#website`,
      url: siteUrl,
      name: "Bali-Can Limited",
      description: "B2B procurement platform for industrial products and services across Ghana.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/products?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    faqSchema,
  ],
};

async function getProducts() {
  try {
    const res = await fetch(`${API}/products?limit=10`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.products || [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div>
        <HeroCarousel />

        <section className="noise-overlay border-b border-white/10 bg-navy">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {[
                { end: 2500, label: "Products", icon: ShoppingBag },
                { end: 50, label: "Categories", icon: Gear },
                { end: 500, label: "Clients Served", icon: Users },
                { end: 12, label: "Years in Operation", icon: Truck },
              ].map((stat, i) => (
                <Reveal key={stat.label} animation="animate-fade-up" className={`animate-delay-${(i + 1) * 100}`}>
                  <div className="text-center">
                    <stat.icon size={24} className="mx-auto text-accent" weight="duotone" />
                    <p className="mt-3 font-display text-4xl font-semibold tracking-tight text-white">
                      <Counter end={stat.end} suffix="+" duration={2500} />
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-14 flex items-end justify-between">
              <div>
                <span className="section-label text-accent">
                  <span className="accent-diamond" />
                  Product Catalog
                </span>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Browse, request, or negotiate</h2>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-soft">
                  Explore our catalog, then submit a procurement request for competitive quotes from vetted suppliers. No hidden pricing.
                </p>
              </div>
              <Link href="/products" className="hidden items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-bold transition-colors sm:flex">
                View All <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </Reveal>

          <Reveal animation="animate-fade-up">
            <FeaturedProductCarousel products={products} />
            <div className="mt-8 text-center sm:hidden">
              <Link href="/products" className="btn btn-ghost gap-2">
                View All Products <ArrowRight size={14} weight="bold" />
              </Link>
            </div>
          </Reveal>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mb-14 max-w-2xl">
                <span className="section-label text-accent">
                  <span className="accent-diamond" />
                  How It Works
                </span>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Source smarter, not harder</h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">From submitting requirements to fulfillment — a single platform for the entire procurement lifecycle.</p>
              </div>
            </Reveal>

            <div className="grid gap-6 lg:grid-cols-3">
              {[
                {
                  icon: ClipboardText, title: "1. Submit Requirements", desc: "Describe what you need — products, quantities, delivery timeline. Invite specific suppliers or open to all vetted providers.",
                  color: "bg-accent-soft text-accent-bold", href: "/procurement/requests/new", label: "Start a Request",
                },
                {
                  icon: Users, title: "2. Compare Quotes", desc: "Vetted suppliers respond with competitive quotes. Review pricing, credit tiers, and supplier profiles side by side.",
                  color: "bg-accent-soft text-accent-bold", href: "/marketplace/providers", label: "Browse Suppliers",
                },
                {
                  icon: ShoppingBag, title: "3. Accept & Fulfill", desc: "Select your preferred quote, convert to an order, and track fulfillment. Approved credit? Pay on terms.",
                  color: "bg-accent-soft text-accent-bold", href: "/auth/register", label: "Register Your Company",
                },
              ].map((svc, i) => (
                <Reveal key={svc.title} animation="animate-fade-up" className={`animate-delay-${(i + 1) * 100}`}>
                  <Link href={svc.href} className="group card block p-8 text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                    <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${svc.color} transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                      <svc.icon size={30} weight="duotone" />
                    </div>
                    <h3 className="mt-5 font-display text-lg font-semibold text-ink">{svc.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-soft">{svc.desc}</p>
                    <div className="mt-6 flex items-center justify-center gap-1.5 text-sm font-medium text-accent">
                      {svc.label} <ArrowRight size={14} weight="bold" className="transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
          <Reveal>
            <div className="mb-14 text-center">
              <span className="section-label justify-center text-accent mb-4">
                <span className="accent-diamond" />
                <span className="mx-2">Trusted by Industry</span>
                <span className="accent-diamond" />
              </span>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">What our clients say</h2>
            </div>
          </Reveal>

          <Reveal animation="animate-fade-up">
            <TestimonialCarousel />
          </Reveal>
        </section>

        <section className="noise-overlay border-t border-white/10 bg-navy">
          <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
            <Reveal>
              <div className="mb-14 text-center">
                <span className="section-label justify-center text-accent mb-4">
                  <span className="accent-diamond" />
                  Why Bali-Can
                </span>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Built for B2B procurement</h2>
                <p className="mt-3 max-w-xl mx-auto text-sm leading-relaxed text-zinc-400">A purpose-built platform for industrial buyers and suppliers — not a retail marketplace.</p>
              </div>
            </Reveal>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: ClipboardText, title: "Quote-First Sourcing", desc: "Submit RFQs instead of guessing prices. Get competitive quotes from multiple vetted suppliers in one place." },
                { icon: ShieldCheck, title: "Credit-Vetted Suppliers", desc: "Every supplier assessed for reliability. Premium, standard, and basic tiers — know who you are dealing with." },
                { icon: CreditCard, title: "Company Credit", desc: "Apply for company-level credit. Approved businesses buy on terms without upfront payment." },
                { icon: Users, title: "Dedicated Account Management", desc: "Account managers assigned to every B2B client for personalized support from RFQ to fulfillment." },
              ].map((item, i) => (
                <Reveal key={item.title} animation="animate-fade-up" className={`animate-delay-${(i + 1) * 100}`}>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center transition-all duration-300 hover:border-accent/30 hover:bg-white/[0.06] hover:shadow-lg hover:-translate-y-0.5">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <item.icon size={22} weight="duotone" />
                    </div>
                    <h3 className="mt-4 font-display text-base font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-zinc-400">{item.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="noise-overlay relative overflow-hidden bg-navy-dark">
          <div className="absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `
              linear-gradient(rgba(24,72,204,1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(24,72,204,1) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }} />
           <div className="pointer-events-none absolute -left-40 -bottom-40 text-[25rem] font-display font-bold leading-none text-white/[0.008] select-none">BC</div>
           <div className="pointer-events-none absolute -right-20 top-1/2 text-[12rem] font-display font-bold leading-none text-white/[0.006] select-none -rotate-12">BC</div>
          <div className="relative mx-auto max-w-7xl px-4 py-28 text-center sm:px-6 lg:px-8">
            <Reveal animation="animate-scale-in">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <ShieldCheck size={32} className="text-accent" weight="duotone" />
              </div>
              <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">Ready to transform your procurement?</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
                Register your company to submit RFQs, receive competitive quotes, apply for credit, and manage orders — all in one platform.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <Link href="/auth/register" className="btn-shine btn-primary btn-lg">
                  Register Your Company <ArrowRight size={16} weight="bold" />
                </Link>
                <Link href="/procurement/requests/new" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-medium text-zinc-200 transition-all duration-300 hover:border-white/40 hover:bg-white/10 active:scale-[0.97]">
                  Submit a Request
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>
    </>
  );
}
