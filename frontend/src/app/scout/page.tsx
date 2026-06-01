"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Plus, ArrowRight, CheckCircle, Clock, FileText,
  Storefront, Users, SealCheck, Lightning, ChartBar,
} from "@phosphor-icons/react";

const STEPS = [
  {
    icon: <FileText size={28} weight="duotone" />,
    title: "1. Submit your request",
    desc: "Tell us what you need — product, quantity, delivery location, and timeline. No account required to start.",
  },
  {
    icon: <Users size={28} weight="duotone" />,
    title: "2. Receive supplier quotes",
    desc: "Verified suppliers in your category review your request and submit competitive quotes with pricing and delivery estimates.",
  },
  {
    icon: <CheckCircle size={28} weight="duotone" />,
    title: "3. Compare & accept",
    desc: "Review all quotes side-by-side, check supplier profiles, and accept the best offer. We handle the rest.",
  },
  {
    icon: <Lightning size={28} weight="duotone" />,
    title: "4. Fulfilled",
    desc: "Your accepted quote is converted into an order. Track fulfillment and manage delivery from your dashboard.",
  },
];

const CATEGORIES = [
  { name: "HVAC Equipment", slug: "hvac", color: "from-blue-500 to-cyan-500" },
  { name: "Electrical Supplies", slug: "electrical", color: "from-amber-500 to-orange-500" },
  { name: "Solar Energy", slug: "solar", color: "from-yellow-400 to-amber-500" },
  { name: "Industrial Equipment", slug: "industrial", color: "from-slate-600 to-slate-800" },
  { name: "Plumbing", slug: "plumbing", color: "from-teal-500 to-emerald-500" },
  { name: "Security Systems", slug: "security", color: "from-red-500 to-rose-500" },
];

export default function ScoutLandingPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-dark via-navy to-accent py-20 sm:py-28">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />
        <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
            <SealCheck size={12} /> B2B Procurement Platform
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Source smarter with
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gold to-amber-300">Scout</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/70">
            Post a single request and let multiple verified suppliers compete for your business.
            Compare quotes, check credentials, and choose the best offer — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {session?.user ? (
              <Link href="/scout/new" className="btn inline-flex items-center gap-2 border border-white/30 bg-white text-navy hover:bg-white/90">
                <Plus size={16} weight="bold" />
                New Scout Request
              </Link>
            ) : (
              <Link href="/rfq/new" className="btn inline-flex items-center gap-2 border border-white/30 bg-white text-navy hover:bg-white/90">
                <FileText size={16} weight="bold" />
                Submit a Request
              </Link>
            )}
            <Link href="/marketplace" className="btn inline-flex items-center gap-2 border border-white/20 text-white hover:bg-white/10">
              <Storefront size={16} />
              Browse Marketplace
            </Link>
          </div>
          {session?.user && (
            <Link href="/scout/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
              View my dashboard <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">How Scout works</h2>
          <p className="mt-2 text-sm text-muted">From request to fulfillment in four simple steps</p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.title} className="relative rounded-xl border border-border bg-surface/50 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
                {s.icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-xs text-muted leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Browse by Category */}
      <section className="bg-surface/50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink">Source by category</h2>
            <p className="mt-2 text-sm text-muted">Find suppliers for your specific industry needs</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/scout/new?category=${cat.slug}`}
                className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${cat.color} p-5 text-white transition hover:shadow-lg hover:-translate-y-0.5`}
              >
                <p className="relative text-sm font-semibold">{cat.name}</p>
                <p className="relative mt-1 text-[10px] text-white/70">Source now &rarr;</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Scout */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="rounded-xl border border-border p-6">
            <ChartBar size={24} className="text-accent" weight="duotone" />
            <h3 className="mt-3 text-sm font-semibold text-ink">Competitive pricing</h3>
            <p className="mt-1 text-xs text-muted">Multiple suppliers bid on your request, ensuring you get the best market rate.</p>
          </div>
          <div className="rounded-xl border border-border p-6">
            <SealCheck size={24} className="text-accent" weight="duotone" />
            <h3 className="mt-3 text-sm font-semibold text-ink">Verified suppliers</h3>
            <p className="mt-1 text-xs text-muted">All suppliers are vetted with active company accounts and credit assessments.</p>
          </div>
          <div className="rounded-xl border border-border p-6">
            <Clock size={24} className="text-accent" weight="duotone" />
            <h3 className="mt-3 text-sm font-semibold text-ink">Save time</h3>
            <p className="mt-1 text-xs text-muted">One request reaches dozens of suppliers. No more cold calling or emailing individually.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-navy py-16 text-center">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">Ready to start sourcing?</h2>
          <p className="mt-2 text-sm text-white/60">Join thousands of Ghanaian businesses using Bali-Can to find the best suppliers.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/rfq/new" className="btn inline-flex items-center gap-2 bg-white text-navy hover:bg-white/90">
              Submit a Request <ArrowRight size={14} weight="bold" />
            </Link>
            <Link href="/products" className="btn inline-flex items-center gap-2 border border-white/20 text-white hover:bg-white/10">
              Browse Products
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
