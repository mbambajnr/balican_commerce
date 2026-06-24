"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Storefront, Wrench, MagnifyingGlass, Star, SealCheck,
  Buildings, MapPin, ArrowRight, ShoppingBag, FileText,
  Lightning, Sun, Plug, Gear, Drop, ShieldCheck, Broom,
  Cube, PaperPlaneTilt, CaretLeft, CaretRight,
} from "@phosphor-icons/react";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";

const PRODUCTS_PER_PAGE = 12;
const SERVICES_PER_PAGE = 12;

const PRODUCT_MICROCOPY: Record<string, { icon: React.ReactNode; desc: string }> = {
  "hvac":              { icon: <Lightning size={22} weight="duotone" />, desc: "AC units, chillers, spare parts" },
  "electrical":        { icon: <Plug size={22} weight="duotone" />, desc: "Cables, switchgear, transformers" },
  "solar":             { icon: <Sun size={22} weight="duotone" />, desc: "Panels, inverters, batteries" },
  "industrial-equipment": { icon: <Gear size={22} weight="duotone" />, desc: "Pumps, generators, tools" },
  "plumbing":          { icon: <Drop size={22} weight="duotone" />, desc: "Pipes, fittings, valves, fixtures" },
  "security":          { icon: <ShieldCheck size={22} weight="duotone" />, desc: "CCTV, alarms, access control" },
};

const SERVICE_MICROCOPY: Record<string, { icon: React.ReactNode; desc: string }> = {
  "hvac":              { icon: <Wrench size={22} weight="duotone" />, desc: "Installation, servicing, repairs" },
  "electrical":        { icon: <Plug size={22} weight="duotone" />, desc: "Wiring, panel work, maintenance" },
  "solar":             { icon: <Sun size={22} weight="duotone" />, desc: "System design, installation, support" },
  "industrial-equipment": { icon: <Gear size={22} weight="duotone" />, desc: "Equipment servicing, maintenance" },
  "plumbing":          { icon: <Drop size={22} weight="duotone" />, desc: "Installation, repairs, drainage" },
  "security":          { icon: <ShieldCheck size={22} weight="duotone" />, desc: "System setup, monitoring, support" },
  "facility-services": { icon: <Broom size={22} weight="duotone" />, desc: "Cleaning, carpentry, plumbing, maintenance" },
};

const FALLBACK_SERVICE_CATEGORIES = [
  { name: "HVAC Services",      slug: "hvac",              sub: "Installation, servicing, repairs" },
  { name: "Electrical Services", slug: "electrical",        sub: "Wiring, panel work, maintenance" },
  { name: "Solar Services",     slug: "solar",             sub: "System design, installation, support" },
  { name: "Facility Services",  slug: "facility-services", sub: "Cleaning, carpentry, plumbing" },
  { name: "Security Services",  slug: "security",          sub: "System setup, monitoring, support" },
  { name: "Industrial Services", slug: "industrial-equipment", sub: "Equipment servicing, maintenance" },
];

export default function MarketplacePageClient() {
  const [data, setData] = useState<{ categories: any[]; featuredProviders: any[] } | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [servicePage, setServicePage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    api
      .getMarketplaceCategories()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-navy">Marketplace unavailable</h1>
        <p className="mt-3 text-sm text-soft">
          We couldn&apos;t load the marketplace right now. Please check your connection and try again.
        </p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <div className="mx-auto max-w-7xl px-4 py-10"><PageSkeleton /></div>;

  const productCats = data.categories.filter((c: any) => c.type === "product" || c.type === "both");
  const serviceCats = data.categories.filter((c: any) => c.type === "service" || c.type === "both");

  const productTotalPages = Math.max(1, Math.ceil(productCats.length / PRODUCTS_PER_PAGE));
  const serviceTotalPages = Math.max(1, Math.ceil(
    (serviceCats.length > 0 ? serviceCats : FALLBACK_SERVICE_CATEGORIES).length / SERVICES_PER_PAGE,
  ));

  const visibleProductCats = productCats.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE);
  const fallbackProductCats = [
    { name: "HVAC & Refrigeration", slug: "hvac", icon: <Lightning size={20} weight="duotone" /> },
    { name: "Electrical & Power", slug: "electrical", icon: <Plug size={20} weight="duotone" /> },
    { name: "Solar & Renewable", slug: "solar", icon: <Sun size={20} weight="duotone" /> },
    { name: "Industrial Equipment", slug: "industrial-equipment", icon: <Gear size={20} weight="duotone" /> },
    { name: "Plumbing & Fixtures", slug: "plumbing", icon: <Drop size={20} weight="duotone" /> },
    { name: "Security & Safety", slug: "security", icon: <ShieldCheck size={20} weight="duotone" /> },
  ];
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-navy-dark via-navy to-accent p-8 sm:p-12 text-center text-white">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">B2B Marketplace</h1>
        <p className="mt-3 max-w-xl mx-auto text-sm text-white/70">
          Explore products, services, suppliers, and sourcing categories in one place. Browse the marketplace to find what your business needs, then use Scout when you need custom pricing or provider responses.
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

      {/* Quick-path comparison strip */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link href="/products"
          className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 transition hover:shadow-md group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Cube size={20} weight="duotone" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Need an item?</p>
            <p className="text-[11px] text-muted">Browse Products</p>
          </div>
          <ArrowRight size={16} className="ml-auto shrink-0 text-muted group-hover:text-accent transition-colors" />
        </Link>
        <Link href="/marketplace/services"
          className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 transition hover:shadow-md group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Wrench size={20} weight="duotone" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Need work done?</p>
            <p className="text-[11px] text-muted">Find Service Providers</p>
          </div>
          <ArrowRight size={16} className="ml-auto shrink-0 text-muted group-hover:text-amber-600 transition-colors" />
        </Link>
        <Link href="/scout"
          className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 transition hover:shadow-md group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <PaperPlaneTilt size={20} weight="duotone" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Need custom pricing?</p>
            <p className="text-[11px] text-muted">Start Scout RFQ</p>
          </div>
          <ArrowRight size={16} className="ml-auto shrink-0 text-muted group-hover:text-emerald-600 transition-colors" />
        </Link>
      </div>

      {/* Browse Product Categories */}
      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Browse Product Categories</h2>
            <p className="mt-0.5 text-xs text-muted">Source physical goods, industrial equipment, materials, and supplies from verified suppliers.</p>
          </div>
          <Link href="/products" className="text-xs font-medium text-accent hover:underline shrink-0 ml-4">View all products</Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {(productCats.length > 0 ? visibleProductCats : fallbackProductCats).map((cat: any) => {
            const micro = PRODUCT_MICROCOPY[cat.slug];
            return (
              <Link key={cat.id || cat.slug} href={`/products?category=${cat.slug}`}
                className="group card relative flex flex-col p-4 transition hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
                    {micro?.icon || cat.icon || <ShoppingBag size={18} weight="duotone" />}
                  </div>
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Product</span>
                </div>
                <p className="text-sm font-semibold text-ink truncate">{cat.name}</p>
                <p className="mt-0.5 text-[11px] text-soft leading-tight line-clamp-2">
                  {micro?.desc || `${cat.product_count || 0} items`}
                </p>
                <div className="mt-auto pt-2 text-[10px] font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                  Browse products &rarr;
                </div>
              </Link>
            );
          })}
        </div>

        {(productCats.length > PRODUCTS_PER_PAGE) && (
          <div className="mt-5 flex items-center justify-center gap-3 text-xs">
            <button
              onClick={() => setProductPage((p) => Math.max(1, p - 1))}
              disabled={productPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-30 disabled:pointer-events-none"
            >
              <CaretLeft size={12} weight="bold" /> Previous
            </button>
            <span className="text-muted">
              Page {productPage} of {productTotalPages}
            </span>
            <button
              onClick={() => setProductPage((p) => Math.min(productTotalPages, p + 1))}
              disabled={productPage >= productTotalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-30 disabled:pointer-events-none"
            >
              Next <CaretRight size={12} weight="bold" />
            </button>
          </div>
        )}
      </section>

      {/* Find Service Providers */}
      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Find Service Providers</h2>
            <p className="mt-0.5 text-xs text-muted">Hire verified providers for installation, repair, maintenance, and business support services.</p>
          </div>
          <Link href="/marketplace/services" className="text-xs font-medium text-accent hover:underline shrink-0 ml-4">View all services</Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {(serviceCats.length > 0 ? serviceCats : FALLBACK_SERVICE_CATEGORIES)
            .slice((servicePage - 1) * SERVICES_PER_PAGE, servicePage * SERVICES_PER_PAGE)
            .map((cat: any) => {
            const micro = SERVICE_MICROCOPY[cat.slug] || SERVICE_MICROCOPY["facility-services"];
            return (
              <Link key={cat.id || cat.slug} href={`/scout/new?requestType=service_sourcing&category=${encodeURIComponent(cat.slug)}&categoryName=${encodeURIComponent(cat.name)}`}
                className="group card relative flex flex-col border-l-2 border-l-amber-400 p-4 transition hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0">
                    {micro?.icon || <Wrench size={18} weight="duotone" />}
                  </div>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Service</span>
                </div>
                <p className="text-sm font-semibold text-ink truncate">{cat.name}</p>
                <p className="mt-0.5 text-[11px] text-soft leading-tight line-clamp-2">{cat.sub || micro?.desc || `Find providers`}</p>
                <div className="mt-auto pt-2 text-[10px] font-medium text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Request service quote &rarr;
                </div>
              </Link>
            );
          })}
        </div>

        {((serviceCats.length > 0 ? serviceCats : FALLBACK_SERVICE_CATEGORIES).length > SERVICES_PER_PAGE) && (
          <div className="mt-5 flex items-center justify-center gap-3 text-xs">
            <button
              onClick={() => setServicePage((p) => Math.max(1, p - 1))}
              disabled={servicePage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-amber-400 hover:text-amber-600 disabled:opacity-30 disabled:pointer-events-none"
            >
              <CaretLeft size={12} weight="bold" /> Previous
            </button>
            <span className="text-muted">
              Page {servicePage} of {serviceTotalPages}
            </span>
            <button
              onClick={() => setServicePage((p) => Math.min(serviceTotalPages, p + 1))}
              disabled={servicePage >= serviceTotalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-amber-400 hover:text-amber-600 disabled:opacity-30 disabled:pointer-events-none"
            >
              Next <CaretRight size={12} weight="bold" />
            </button>
          </div>
        )}
      </section>

      {/* Featured Providers */}
      {data.featuredProviders.length > 0 && (
        <section className="mt-14">
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
      <div className="mt-14 rounded-xl border border-accent/20 bg-accent/5 p-6 text-center">
        <Buildings size={24} className="mx-auto text-accent" weight="duotone" />
        <h3 className="mt-3 font-display text-base font-semibold text-ink">Are you a supplier or service provider?</h3>
        <p className="mt-1 text-sm text-soft">Register your company and start receiving procurement requests from verified buyers.</p>
        <Link href="/auth/register" className="btn btn-primary mt-4 inline-flex gap-1.5">Register as Provider <ArrowRight size={14} weight="bold" /></Link>
        <Link href="/marketplace/providers" className="btn mt-3 ml-2 inline-flex gap-1.5">Browse Marketplace</Link>
      </div>
    </div>
  );
}
