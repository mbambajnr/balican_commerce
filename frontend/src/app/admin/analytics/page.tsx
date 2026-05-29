"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MagnifyingGlass, Eye, TrendUp } from "@phosphor-icons/react";
import { CardSkeleton } from "@/components/admin/LoadingSkeleton";
import EmptyState from "@/components/admin/EmptyState";
import { formatDate } from "@/lib/format";

export default function AdminAnalyticsPage() {
  const [searches, setSearches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [volume, setVolume] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getPopularSearches().then((r) => setSearches(r.searches)).catch(() => {}),
      api.getPopularProducts().then((r) => setProducts(r.products)).catch(() => {}),
      api.getSearchVolume().then((r) => setVolume(r.volume)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <CardSkeleton count={3} />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Analytics</h1>
      <p className="mt-1 text-sm text-soft">Search and product view metrics</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-signal">
              <MagnifyingGlass size={20} weight="duotone" />
            </div>
            <h3 className="font-display text-base font-semibold text-ink">Popular Searches</h3>
          </div>
          {searches.length === 0 ? (
            <EmptyState icon="default" title="No search data yet" />
          ) : (
            <div className="mt-6 space-y-3">
              {searches.map((s: any) => (
                <div key={s.query} className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{s.query}</p>
                    <p className="text-xs text-muted">{s.lastSearched ? formatDate(s.lastSearched) : ""}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-signal">{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-accent-bold">
              <Eye size={20} weight="duotone" />
            </div>
            <h3 className="font-display text-base font-semibold text-ink">Most Viewed Products</h3>
          </div>
          {products.length === 0 ? (
            <EmptyState icon="products" title="No view data yet" />
          ) : (
            <div className="mt-6 space-y-3">
              {products.map((p: any) => (
                <div key={p.productId} className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
                  <p className="text-sm font-medium text-ink">{p.productName}</p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-accent-bold">{p.views} views</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-warn">
              <TrendUp size={20} weight="duotone" />
            </div>
            <h3 className="font-display text-base font-semibold text-ink">Daily Search Volume</h3>
          </div>
          {volume.length === 0 ? (
            <EmptyState icon="default" title="No volume data yet" />
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                    <th className="pb-3 pr-6">Date</th>
                    <th className="pb-3">Searches</th>
                  </tr>
                </thead>
                <tbody>
                  {volume.map((v: any) => (
                    <tr key={v.date} className="border-b border-border/50 text-sm">
                      <td className="py-2.5 pr-6 text-soft">{v.date}</td>
                      <td className="py-2.5 font-medium">{v.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
