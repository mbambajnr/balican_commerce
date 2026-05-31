"use client";

import Link from "next/link";
import { ArrowRight, ShoppingBag, FileText, CreditCard } from "@phosphor-icons/react";
import { Carousel } from "./carousel";

const slides = [
  {
    pill: "B2B Procurement Platform",
    pillIcon: ShoppingBag,
    title: "Submit requirements,",
    highlight: "get competitive quotes.",
    description: "Tell us what you need — we invite vetted suppliers to quote. Compare pricing, select the best offer, and convert to an order. No hidden prices, no guesswork.",
    cta: { label: "Submit a Request", href: "/procurement/requests/new" },
    ctaSecondary: { label: "Browse Catalog", href: "/products" },
  },
  {
    pill: "Vetted Supplier Network",
    pillIcon: FileText,
    title: "Credit-assessed suppliers",
    highlight: "you can trust.",
    description: "Every supplier on our platform goes through credit vetting. Premium, standard, and basic tiers give you visibility into supplier reliability before you commit.",
    cta: { label: "Find Suppliers", href: "/marketplace/providers" },
    ctaSecondary: { label: "Register Your Company", href: "/auth/register" },
  },
  {
    pill: "B2B Credit & Financing",
    pillIcon: CreditCard,
    title: "Approved companies",
    highlight: "buy on credit.",
    description: "Qualified businesses get company-level credit with flexible terms. Apply once, get approved, and purchase across the platform without upfront payment.",
    cta: { label: "Apply for Credit", href: "/auth/register" },
    ctaSecondary: { label: "How It Works", href: "/products" },
  },
];

export default function HeroCarousel() {
  return (
    <Carousel options={{ loop: true }} showArrows showDots={false} autoplay autoplayInterval={6000} className="min-h-[90dvh]">
      {slides.map((slide, i) => (
        <div key={i} className="noise-overlay relative min-w-0 flex-[0_0_100%] min-h-[90dvh] overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-dark via-navy to-navy-light" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(24,72,204,0.12)_0%,_transparent_60%),radial-gradient(ellipse_at_bottom_right,_rgba(24,72,204,0.08)_0%,_transparent_50%)]" />
          {/* Geometric lattice pattern */}
          <div className="absolute inset-0 opacity-[0.025]" style={{
            backgroundImage: `
              linear-gradient(rgba(24,72,204,1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(24,72,204,1) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
          }} />
           <div className="pointer-events-none absolute -right-40 -top-40 text-[30rem] font-display font-bold leading-none text-white/[0.015] select-none">BC</div>
           <div className="pointer-events-none absolute -left-20 top-1/3 text-[15rem] font-display font-bold leading-none text-white/[0.008] select-none rotate-12">BC</div>

          <div className="relative mx-auto flex min-h-[90dvh] max-w-7xl flex-col justify-center px-4 pb-28 pt-24 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <span className="animate-fade-up inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent">
                <slide.pillIcon size={14} weight="fill" />
                {slide.pill}
              </span>

              <h1 className="animate-fade-up animate-delay-100 mt-6 text-5xl font-semibold tracking-tighter text-white sm:text-6xl lg:text-7xl">
                {slide.title}
                <br />
                <span className="bg-gradient-to-r from-accent via-accent to-accent-bold bg-clip-text text-transparent">{slide.highlight}</span>
              </h1>

              <p className="animate-fade-up animate-delay-200 mt-4 max-w-xl text-base leading-relaxed text-zinc-400 sm:text-lg">
                {slide.description}
              </p>

              <div className="animate-fade-up animate-delay-300 mt-10 flex flex-wrap gap-4">
                <Link
                  href={slide.cta.href}
                  className="btn-shine btn-primary btn-lg"
                >
                  {slide.cta.label}
                  <ArrowRight size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link
                  href={slide.ctaSecondary.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-medium text-zinc-200 transition-all duration-300 hover:border-white/40 hover:bg-white/10 active:scale-[0.97]"
                >
                  {slide.ctaSecondary.label}
                </Link>
              </div>
            </div>
          </div>
        </div>
      ))}
    </Carousel>
  );
}
