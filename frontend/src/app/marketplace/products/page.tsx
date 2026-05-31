"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  ShoppingBag, MagnifyingGlass, Star, SealCheck, CreditCard, CaretDown, CurrencyDollar,
} from "@phosphor-icons/react/dist/ssr";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import Pagination from "@/components/admin/Pagination";
import EmptyState from "@/components/admin/EmptyState";

export default function MarketplaceProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [credit, setCredit] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCat, setShowCat] = useState(false);
  const [showSort, setShowSort] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.getMarketplaceProducts({ search: search || undefined, category: category || undefined, credit: credit || undefined, page: String(page), limit: "20" }),
        api.getMarketplaceCategories("product"),
      ]);
      setProducts(prodRes.products);
      setPagination(prodRes.pagination);
      setCategories(catRes.categories);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const handleFilter = () => { setPage(1); load(); };

  if (loading && products.length === 0) return <div className="mx-auto max-w-7xl px-4 py-10"><PageSkeleton /></div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-6">
        <Link href="/marketplace" className="text-xs text-accent hover:underline">&larr; Back to Marketplace</Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Products</h1>
        <p className="text-sm text-soft">Browse products from verified suppliers</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFilter(); }}
            placeholder="Search products..." className="input pl-9 w-full text-sm" />
        </div>

        <div className="relative">
          <button onClick={() => setShowCat(!showCat)} className="input flex items-center gap-2 text-sm min-w-[160px] justify-between">
            <span className={category ? "text-ink" : "text-muted"}>{categories.find((c: any) => c.id === category)?.name || "All Categories"}</span>
            <CaretDown size={14} className="text-muted" />
          </button>
          {showCat && (
            <div className="absolute top-full left-0 z-20 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
              <button onClick={() => { setCategory(""); setShowCat(false); handleFilter(); }} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">All Categories</button>
              {categories.map((c: any) => (
                <button key={c.id} onClick={() => { setCategory(c.id); setShowCat(false); handleFilter(); }} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">{c.name}</button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => { setCredit(credit === "true" ? "" : "true"); handleFilter(); }}
          className={`btn btn-sm gap-1.5 ${credit === "true" ? "btn-primary" : ""}`}>
          <CreditCard size={14} /> Credit Available
        </button>
      </div>

      {products.length === 0 ? (
        <EmptyState icon="default" title="No products found" description="Try adjusting your search or filters" />
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">{pagination?.total || products.length} product{pagination?.total !== 1 ? "s" : ""} found</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p: any) => (
              <Link key={p.id} href={`/products/${p.slug}`} className="card p-4 transition hover:shadow-md">
                <div className="flex aspect-square items-center justify-center rounded-lg bg-zinc-50 text-zinc-300">
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain rounded-lg" />
                  ) : (
                    <ShoppingBag size={32} />
                  )}
                </div>
                <p className="mt-3 text-sm font-medium text-ink truncate">{p.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-soft truncate">{p.provider_name}</span>
                  {p.verification_badge && <SealCheck size={10} className="text-accent shrink-0" weight="fill" />}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {p.price_visibility === "public" && p.price != null ? (
                    <span className="text-sm font-semibold text-emerald-700">GH₵{Number(p.price).toLocaleString()}</span>
                  ) : (
                    <span className="text-[10px] text-accent font-medium">Request Price</span>
                  )}
                  {p.credit_eligible && <CreditCard size={13} className="text-accent" weight="fill" />}
                </div>
                {p.provider_rating > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                    <Star size={10} weight="fill" className="text-amber-500" />
                    {Number(p.provider_rating).toFixed(1)}
                  </div>
                )}
              </Link>
            ))}
          </div>
          {pagination && pagination.pages > 1 && (
            <div className="mt-6">
              <Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
