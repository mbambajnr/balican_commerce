"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Storefront, Wrench, MagnifyingGlass, Star, SealCheck,
  Buildings, MapPin, ArrowRight, ShoppingBag, FileText,
  Lightning, Sun, Plug, Gear,
} from "@phosphor-icons/react";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";

export default function MarketplacePage() {
  const [data, setData] = useState<{ categories: any[]; featuredProviders: any[] } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getMarketplaceCategories().then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="mx-auto max-w-7xl px-4 py-10"><PageSkeleton /></div>;

  const productCats = data.categories.filter((c: any) => c.type === "product" || c.type === "both");
  const serviceCats = data.categories.filter((c: any) => c.type === "service" || c.type === "both");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-navy-dark via-navy to-accent p-8 sm:p-12 text-center text-white">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">B2B Marketplace</h1>
        <p className="mt-3 max-w-xl mx-auto text-sm text-white/70">
          Browse verified suppliers and service providers. Request quotes, compare offerings, and procure with confidence.
        </p>
        <div className="mt-6 mx-auto max-w-md relative">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers, products, services..."
            className="w-full rounded-xl bg-white/10 border border-white/20 pl-11 pr-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
            onKeyDown={(e) => { if (e.key === "Enter" && search) window.location.href = `/marketplace/providers?search=${encodeURIComponent(search)}`; }}
          />
        </div>
      </div>

      {/* Quick entry */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/marketplace/providers" className="card flex items-center gap-4 p-5 transition hover:shadow-md group">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
            <Storefront size={24} weight="duotone" />
          </div>
          <div>
            <p className="font-semibold text-ink">Browse Suppliers</p>
            <p className="text-xs text-soft">Find verified product suppliers for your business</p>
          </div>
          <ArrowRight size={18} className="ml-auto text-muted group-hover:text-accent transition-colors" weight="bold" />
        </Link>
        <Link href="/marketplace/services" className="card flex items-center gap-4 p-5 transition hover:shadow-md group">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
            <Wrench size={24} weight="duotone" />
          </div>
          <div>
            <p className="font-semibold text-ink">Find Service Providers</p>
            <p className="text-xs text-soft">Hire verified business service providers</p>
          </div>
          <ArrowRight size={18} className="ml-auto text-muted group-hover:text-amber-600 transition-colors" weight="bold" />
        </Link>
      </div>

      {/* Category sourcing hub */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Source by category</h2>
          <Link href="/scout/new" className="text-xs text-accent hover:underline">Post a sourcing request</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[
            { name: "HVAC Equipment", slug: "hvac", icon: <Lightning size={22} weight="duotone" />, cls: "bg-blue-600" },
            { name: "Electrical Supplies", slug: "electrical", icon: <Plug size={22} weight="duotone" />, cls: "bg-amber-600" },
            { name: "Solar Energy", slug: "solar", icon: <Sun size={22} weight="duotone" />, cls: "bg-amber-500" },
            { name: "Industrial Equipment", slug: "industrial-equipment", icon: <Gear size={22} weight="duotone" />, cls: "bg-slate-700" },
            { name: "All Categories", slug: "", icon: <MagnifyingGlass size={22} weight="duotone" />, cls: "bg-accent" },
          ].map((cat) => (
            <Link
              key={cat.name}
              href={cat.slug ? `/products?category=${cat.slug}` : "/products"}
              className={`${cat.cls} group relative overflow-hidden rounded-xl p-5 text-white transition hover:shadow-lg hover:-translate-y-0.5`}
            >
              <div>{cat.icon}</div>
              <p className="mt-2 text-sm font-semibold">{cat.name}</p>
              <p className="mt-0.5 text-[10px] text-white/70">Browse &rarr;</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Product Categories */}
      {productCats.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-ink">Product Categories</h2>
            <Link href="/marketplace/products" className="text-xs text-accent hover:underline">View all products</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {productCats.map((cat: any) => (
              <Link key={cat.id} href={`/marketplace/products?category=${cat.id}`}
                className="card p-4 text-center transition hover:shadow-md">
                <ShoppingBag size={22} className="mx-auto text-accent" weight="duotone" />
                <p className="mt-2 text-xs font-medium text-ink truncate">{cat.name}</p>
                <p className="text-[10px] text-soft">{cat.product_count} items</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Service Categories */}
      {serviceCats.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-ink">Service Categories</h2>
            <Link href="/marketplace/services" className="text-xs text-accent hover:underline">View all services</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {serviceCats.map((cat: any) => (
              <Link key={cat.id} href={`/marketplace/services?category=${cat.id}`}
                className="card p-4 text-center transition hover:shadow-md">
                <Wrench size={22} className="mx-auto text-amber-600" weight="duotone" />
                <p className="mt-2 text-xs font-medium text-ink truncate">{cat.name}</p>
                <p className="text-[10px] text-soft">{cat.service_count} services</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Providers */}
      {data.featuredProviders.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-ink">Featured Providers</h2>
            <Link href="/marketplace/providers" className="text-xs text-accent hover:underline">View all</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.featuredProviders.map((p: any) => (
              <Link key={p.id} href={`/marketplace/providers/${p.id}`}
                className="card p-4 transition hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent text-sm font-bold shrink-0">
                    {p.name?.[0] || "P"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                      {p.verification_badge && <SealCheck size={14} className="text-accent shrink-0" weight="fill" />}
                    </div>
                    <p className="text-xs text-soft capitalize">{p.provider_type?.replace(/_/g, " ") || "Provider"}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                  {p.rating_average > 0 && (
                    <span className="flex items-center gap-1"><Star size={12} weight="fill" className="text-amber-500" />{Number(p.rating_average).toFixed(1)}</span>
                  )}
                  {p.city && <span className="flex items-center gap-1"><MapPin size={12} />{p.city}</span>}
                </div>
                <div className="mt-2 flex gap-2 text-[10px] text-soft">
                  {p.product_count > 0 && <span>{p.product_count} products</span>}
                  {p.service_count > 0 && <span>{p.service_count} services</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Info banner */}
      <div className="mt-12 rounded-xl border border-accent/20 bg-accent/5 p-6 text-center">
        <Buildings size={24} className="mx-auto text-accent" weight="duotone" />
        <h3 className="mt-3 font-display text-base font-semibold text-ink">Are you a supplier or service provider?</h3>
        <p className="mt-1 text-sm text-soft">Register your company and start receiving procurement requests from verified buyers.</p>
        <Link href="/auth/register" className="btn btn-primary mt-4 inline-flex gap-1.5">Register as Provider <ArrowRight size={14} weight="bold" /></Link>
        <Link href="/marketplace/providers" className="btn mt-3 ml-2 inline-flex gap-1.5">Browse Marketplace</Link>
      </div>
    </div>
  );
}
