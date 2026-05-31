"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  MagnifyingGlass, Package, MapPin, CalendarBlank,
  CurrencyCircleDollar, ArrowRight, CheckCircle,
} from "@phosphor-icons/react";

export default function ScoutAvailablePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    if (!(user as any).is_provider) { router.push("/scout"); return; }
    load();
  }, [user, loading, search]);

  const load = () => {
    setFetching(true);
    api.getScoutAvailable({ search: search || undefined })
      .then((r) => setRequests(r.requests))
      .catch(() => {})
      .finally(() => setFetching(false));
  };

  if (loading || !user) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Open Scout Requests</h1>
        <p className="mt-1 text-sm text-muted">Browse open buyer requests and submit your best quote.</p>
      </div>

      {/* Search */}
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
      >
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9"
            placeholder="Search by title or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <div className="mt-6">
        {fetching ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center">
            <MagnifyingGlass size={48} className="mx-auto text-muted" weight="light" />
            <p className="mt-4 text-sm font-medium text-ink">No open requests right now</p>
            <p className="mt-1 text-sm text-muted">Check back soon — buyers post new requests regularly.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => (
              <Link
                key={r.id}
                href={`/scout/${r.id}/quote`}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-white p-5 transition-shadow hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{r.title}</p>
                    {r.my_quote_status === "pending" && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        <CheckCircle size={10} weight="fill" /> Quote submitted
                      </span>
                    )}
                    {r.my_quote_status === "accepted" && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        <CheckCircle size={10} weight="fill" /> Won
                      </span>
                    )}
                  </div>
                  {r.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{r.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
                    <span className="flex items-center gap-1">
                      <Package size={12} />
                      {r.quantity}{r.unit ? ` ${r.unit}` : ""}
                    </span>
                    {r.delivery_location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {r.delivery_location}
                      </span>
                    )}
                    {r.desired_delivery_date && (
                      <span className="flex items-center gap-1">
                        <CalendarBlank size={12} />
                        By {new Date(r.desired_delivery_date).toLocaleDateString()}
                      </span>
                    )}
                    {(r.budget_min || r.budget_max) && (
                      <span className="flex items-center gap-1">
                        <CurrencyCircleDollar size={12} />
                        Budget GH₵{r.budget_min?.toLocaleString() ?? "?"} – GH₵{r.budget_max?.toLocaleString() ?? "?"}
                      </span>
                    )}
                    <span className="text-[10px] text-muted">{r.quote_count} quote{r.quote_count !== 1 ? "s" : ""} so far</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                    {r.my_quote_status ? "View / Update" : "Submit Quote"}
                    <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
