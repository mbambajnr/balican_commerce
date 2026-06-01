"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  MagnifyingGlass, Package, MapPin, CalendarBlank,
  CurrencyCircleDollar, ArrowRight, CheckCircle, Wrench,
  FunnelSimple, X,
} from "@phosphor-icons/react";

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  product: { label: "Product", icon: <Package size={11} weight="fill" /> },
  service: { label: "Service", icon: <Wrench size={11} weight="fill" /> },
};

export default function ScoutAvailablePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [requests, setRequests] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string; depth: number }[]>([]);

  // Filters (applied on submit / change)
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [requestType, setRequestType] = useState("");
  const [deliveryDateBefore, setDeliveryDateBefore] = useState("");

  // Whether filter panel is expanded on mobile
  const [filtersOpen, setFiltersOpen] = useState(false);

  function flattenCategories(nodes: any[], depth = 0): { id: string; name: string; depth: number }[] {
    const out: { id: string; name: string; depth: number }[] = [];
    for (const n of nodes) {
      out.push({ id: n.id, name: n.name, depth });
      if (n.children?.length) out.push(...flattenCategories(n.children, depth + 1));
    }
    return out;
  }

  useEffect(() => {
    api.getCategories()
      .then((r) => setCategories(flattenCategories(r.categories)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    if (!(user as any).is_provider) { router.push("/scout"); return; }
    load();
  }, [user, loading, search, category, location, requestType, deliveryDateBefore]);

  const load = () => {
    setFetching(true);
    api.getScoutAvailable({
      search: search || undefined,
      category: category || undefined,
      location: location || undefined,
      requestType: requestType || undefined,
      deliveryDateBefore: deliveryDateBefore || undefined,
    })
      .then((r) => setRequests(r.requests))
      .catch(() => {})
      .finally(() => setFetching(false));
  };

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setLocation(locationInput);
  };

  const hasActiveFilters = category || location || requestType || deliveryDateBefore;

  const clearFilters = () => {
    setCategory("");
    setLocation("");
    setLocationInput("");
    setRequestType("");
    setDeliveryDateBefore("");
  };

  if (loading || !user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Open Scout Requests</h1>
        <p className="mt-1 text-sm text-muted">Browse open buyer requests and submit your best quote.</p>
      </div>

      {/* Search + filter toggle */}
      <form className="mt-6 flex gap-2" onSubmit={applySearch}>
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
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`btn gap-2 ${filtersOpen || hasActiveFilters ? "border-accent text-accent" : ""}`}
        >
          <FunnelSimple size={16} />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
              {[category, location, requestType, deliveryDateBefore].filter(Boolean).length}
            </span>
          )}
        </button>
      </form>

      {/* Expandable filter panel */}
      {filtersOpen && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Category */}
            <div>
              <label className="input-label">Category</label>
              <select
                className="input mt-1 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {"  ".repeat(cat.depth)}{cat.depth > 0 ? "↳ " : ""}{cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="input-label">Location</label>
              <input
                className="input mt-1 text-sm"
                placeholder="e.g. Accra, Kumasi…"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onBlur={() => setLocation(locationInput)}
                onKeyDown={(e) => e.key === "Enter" && setLocation(locationInput)}
              />
            </div>

            {/* Request type */}
            <div>
              <label className="input-label">Type</label>
              <div className="mt-1 flex gap-2">
                {[
                  { value: "", label: "All" },
                  { value: "product", label: "Product" },
                  { value: "service", label: "Service" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRequestType(opt.value)}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      requestType === opt.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border text-muted hover:border-accent/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Needed by */}
            <div>
              <label className="input-label">Needed by (before)</label>
              <input
                type="date"
                className="input mt-1 text-sm"
                value={deliveryDateBefore}
                onChange={(e) => setDeliveryDateBefore(e.target.value)}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <X size={12} /> Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Active filter chips */}
      {hasActiveFilters && !filtersOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {category && (
            <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              {categories.find((c) => c.id === category)?.name ?? "Category"}
              <button onClick={() => setCategory("")}><X size={10} /></button>
            </span>
          )}
          {location && (
            <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              📍 {location}
              <button onClick={() => { setLocation(""); setLocationInput(""); }}><X size={10} /></button>
            </span>
          )}
          {requestType && (
            <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent capitalize">
              {requestType}
              <button onClick={() => setRequestType("")}><X size={10} /></button>
            </span>
          )}
          {deliveryDateBefore && (
            <span className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              Before {new Date(deliveryDateBefore).toLocaleDateString()}
              <button onClick={() => setDeliveryDateBefore("")}><X size={10} /></button>
            </span>
          )}
        </div>
      )}

      {/* Results */}
      <div className="mt-6">
        {fetching ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center">
            <MagnifyingGlass size={48} className="mx-auto text-muted" weight="light" />
            <p className="mt-4 text-sm font-medium text-ink">
              {hasActiveFilters || search ? "No requests match your filters" : "No open requests right now"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {hasActiveFilters || search ? "Try adjusting or clearing your filters." : "Check back soon — buyers post new requests regularly."}
            </p>
            {(hasActiveFilters || search) && (
              <button
                onClick={() => { clearFilters(); setSearch(""); setSearchInput(""); }}
                className="btn mt-4"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => {
              const typeMeta = TYPE_META[r.request_type];
              return (
                <Link
                  key={r.id}
                  href={`/scout/${r.id}/quote`}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border bg-white p-5 transition-shadow hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{r.title}</p>

                      {/* Request type badge */}
                      {typeMeta && (
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          r.request_type === "service"
                            ? "bg-purple-50 text-purple-700"
                            : "bg-blue-50 text-blue-700"
                        }`}>
                          {typeMeta.icon}
                          {typeMeta.label}
                        </span>
                      )}

                      {/* Category badge */}
                      {r.category_name && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted border border-border">
                          {r.category_name}
                        </span>
                      )}

                      {/* Quote status */}
                      {r.my_quote_status === "pending" && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          <CheckCircle size={10} weight="fill" /> Quote submitted
                        </span>
                      )}
                      {r.my_quote_status === "accepted" && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
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
                          GH₵{r.budget_min?.toLocaleString() ?? "?"} – GH₵{r.budget_max?.toLocaleString() ?? "?"}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted">
                      <span>{r.quote_count} quote{r.quote_count !== 1 ? "s" : ""} so far</span>
                      {r.buyer_company_name && (
                        <>
                          <span>·</span>
                          <span>By {r.buyer_company_name}{r.buyer_city ? `, ${r.buyer_city}` : ""}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                      {r.my_quote_status ? "View / Update" : "Submit Quote"}
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
