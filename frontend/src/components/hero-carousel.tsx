"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  ClipboardText,
  CreditCard,
  MapPin,
  ShieldCheck,
  Users,
} from "@phosphor-icons/react";

const dealSteps = [
  {
    icon: ClipboardText,
    label: "Buyer posts",
    detail: "Products, services, quantity, location, and delivery timeline.",
  },
  {
    icon: Users,
    label: "Suppliers respond",
    detail: "Verified providers submit comparable proposals and terms.",
  },
  {
    icon: CreditCard,
    label: "Deal closes",
    detail: "The buyer accepts an offer and proceeds on approved credit terms.",
  },
];

export default function HeroCarousel() {
  return (
    <section className="noise-overlay relative min-h-[88dvh] overflow-hidden border-b border-white/10 bg-navy-dark">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,_rgba(36,91,255,0.22),_transparent_34%),radial-gradient(circle_at_82%_75%,_rgba(212,175,55,0.09),_transparent_28%)]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="pointer-events-none absolute -right-24 -top-36 select-none font-display text-[26rem] font-bold leading-none text-white/[0.018]">
        BC
      </div>

      <div className="relative mx-auto grid min-h-[88dvh] max-w-7xl items-center gap-14 px-4 pb-20 pt-24 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        <div className="max-w-3xl">
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">
            <MapPin size={14} weight="fill" />
            Built for business sourcing across Ghana
          </span>

          <h1 className="animate-fade-up animate-delay-100 mt-7 font-display text-5xl font-semibold tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
            Post one request.
            <span className="mt-1 block bg-gradient-to-r from-blue-300 via-white to-amber-200 bg-clip-text text-transparent">
              Let verified suppliers compete.
            </span>
          </h1>

          <p className="animate-fade-up animate-delay-200 mt-6 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
            Source products and services from verified suppliers in Accra, Tema, and across Ghana.
            Compare proposals, agree delivery terms, and close eligible purchases on approved business credit.
          </p>

          <div className="animate-fade-up animate-delay-300 mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/scout/new" className="btn-shine btn-primary btn-lg justify-center">
              Post a Sourcing Request
              <ArrowRight size={16} weight="bold" />
            </Link>
            <Link
              href="/auth/register?companyType=supplier"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:border-amber-300/50 hover:bg-white/10 active:scale-[0.98]"
            >
              <ShieldCheck size={18} weight="duotone" />
              Become a Verified Supplier
            </Link>
          </div>

          <div className="animate-fade-up animate-delay-300 mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
            {["No public price guessing", "Comparable supplier proposals", "GH₵ credit terms for approved buyers"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <CheckCircle size={15} className="text-emerald-400" weight="fill" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="animate-fade-up animate-delay-200 relative lg:pl-8">
          <div className="absolute -inset-5 rounded-[2rem] bg-accent/10 blur-2xl" />
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-white/[0.07] p-5 shadow-2xl backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">The Balican deal loop</p>
                <p className="mt-1 text-sm text-zinc-400">From requirement to fulfilled order</p>
              </div>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                Credit-ready
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {dealSteps.map((step, index) => (
                <div key={step.label} className="group flex gap-4 rounded-2xl border border-white/10 bg-navy/60 p-4 transition-colors hover:border-accent/40">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-blue-200">
                    <step.icon size={21} weight="duotone" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">0{index + 1}</span>
                      <h2 className="font-display text-base font-semibold text-white">{step.label}</h2>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-zinc-400">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Example request</p>
              <p className="mt-2 font-display text-base font-semibold text-white">Supply and install 12 commercial AC units</p>
              <p className="mt-1 text-sm text-zinc-400">Tema, Greater Accra · Delivery proposals requested</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
