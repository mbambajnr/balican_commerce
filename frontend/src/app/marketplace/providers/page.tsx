"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Storefront, Star, SealCheck, MapPin, ShoppingBag, Wrench, CaretDown,
} from "@phosphor-icons/react/dist/ssr";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "supplier", label: "Suppliers" },
  { value: "service_provider", label: "Service Providers" },
  { value: "both", label: "Both" },
];

export default function MarketplaceProvidersPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.getMarketplaceCategories("both")
      .then((res) => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  const fetchProviders = useCallback(() => {
    setLoading(true);
    const params: any = { page: String(page), limit: "12" };
    if (type) params.type = type;
    if (category) params.category = category;
    if (search) params.search = search;
    api.getMarketplaceProviders(params)
      .then((res) => {
        setProviders(res.providers);
        setPagination(res.pagination);
      })
      .catch(() => { setProviders([]); setPagination(null); })
      .finally(() => setLoading(false));
  }, [search, type, category, page]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    setPage(1);
  }, [search, type, category]);

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) || 1 : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link href="/" className="hover:text-ink transition-colors">Home</Link></li>
          <li>/</li>
          <li><Link href="/marketplace" className="hover:text-ink transition-colors">Marketplace</Link></li>
          <li>/</li>
          <li className="text-ink font-medium">Providers</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Providers</h1>
        <p className="text-sm text-soft">Browse verified suppliers and service providers on Bali-Can</p>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-4"
          />
        </div>
        <div className="relative w-full sm:w-48">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="input appearance-none"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <CaretDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" weight="bold" />
        </div>
        <div className="relative w-full sm:w-48">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input appearance-none"
          >
            <option value="">All Categories</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <CaretDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" weight="bold" />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="mt-8">
          <PageSkeleton />
        </div>
      ) : providers.length === 0 ? (
        <div className="mt-20 flex flex-col items-center gap-3 text-center">
          <Storefront size={44} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No providers found</p>
          <button
            onClick={() => { setSearch(""); setType(""); setCategory(""); }}
            className="btn btn-sm"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map((p: any) => (
              <Link
                key={p.id}
                href={`/marketplace/providers/${p.id}`}
                className="card p-5 transition hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent text-lg font-bold">
                    {p.name?.[0] || "P"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                      {p.verification_badge && (
                        <SealCheck size={15} className="text-accent shrink-0" weight="fill" />
                      )}
                    </div>
                    <p className="text-xs text-soft capitalize">
                      {p.provider_type === "both"
                        ? "Supplier & Service Provider"
                        : p.provider_type?.replace(/_/g, " ") || "Provider"}
                    </p>
                  </div>
                </div>

                {p.description && (
                  <p className="mt-3 text-xs text-soft line-clamp-2 leading-relaxed">{p.description}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
                  {p.rating_average > 0 && (
                    <span className="flex items-center gap-1">
                      <Star size={13} weight="fill" className="text-amber-500" />
                      {Number(p.rating_average).toFixed(1)}
                    </span>
                  )}
                  {p.city && (
                    <span className="flex items-center gap-1">
                      <MapPin size={13} />
                      {p.city}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-medium text-soft">
                  {p.product_count > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-accent">
                      <ShoppingBag size={11} weight="fill" />
                      {p.product_count} product{p.product_count !== 1 ? "s" : ""}
                    </span>
                  )}
                  {p.service_count > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">
                      <Wrench size={11} weight="fill" />
                      {p.service_count} service{p.service_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`btn btn-sm min-w-[2.25rem] ${
                    n === page ? "btn-primary" : ""
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
