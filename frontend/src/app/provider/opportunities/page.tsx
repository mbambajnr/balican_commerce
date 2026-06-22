"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import ProviderReadinessCard from "@/components/ProviderReadinessCard";
import {
  MagnifyingGlass, Funnel, MapPin, Calendar, Cube, Wrench,
  CurrencyCircleDollar, Clock, CaretLeft, CaretRight,
} from "@phosphor-icons/react";

const FILTER_DEBOUNCE = 400;

function closingSoon(d: string | null): boolean {
  if (!d) return false;
  const days = (new Date(d).getTime() - Date.now()) / 86400000;
  return days > 0 && days <= 7;
}

function deadlineLabel(d: string | null): string {
  if (!d) return "—";
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "Overdue";
  if (days === 1) return "1 day left";
  if (days <= 7) return `${days} days left`;
  return new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

export default function ProviderOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [businessProfile, setBusinessProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [requestType, setRequestType] = useState("");
  const [location, setLocation] = useState("");
  const [deadline, setDeadline] = useState("");
  const [page, setPage] = useState(1);

  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    api.getMarketplaceCategories().then(r => setCategories(r.categories)).catch(() => {});
    api.getCompanyProfile().then(r => setBusinessProfile(r.completion)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api.getProviderOpportunities({
        search: search || undefined,
        category: category || undefined,
        requestType: requestType || undefined,
        location: location || undefined,
        deadline: deadline || undefined,
        page: String(page),
        limit: "20",
      }).then(r => {
        setOpportunities(r.opportunities);
        setPagination(r.pagination);
        setInsights(r.insights);
      }).catch(() => {}).finally(() => setLoading(false));
    }, FILTER_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [search, category, requestType, location, deadline, page]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Procurement Opportunities</h1>
        <p className="mt-1 text-sm text-muted">
          Browse open procurement requests from buyers. Submit proposals to win business.
        </p>
      </div>

      <div className="mb-6"><ProviderReadinessCard insights={insights} businessProfile={businessProfile} /></div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="relative col-span-2 sm:col-span-1 lg:col-span-2">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input w-full pl-8 text-sm"
            placeholder="Search opportunities…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input text-sm" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All categories</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.slug || c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input text-sm" value={requestType} onChange={(e) => { setRequestType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          <option value="product">Product / Goods</option>
          <option value="service">Service / Works</option>
        </select>
        <input
          className="input text-sm"
          placeholder="Location…"
          value={location}
          onChange={(e) => { setLocation(e.target.value); setPage(1); }}
        />
        <select className="input text-sm" value={deadline} onChange={(e) => { setDeadline(e.target.value); setPage(1); }}>
          <option value="">Any deadline</option>
          <option value="closing_soon">Closing soon</option>
          <option value="open">Still open</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-xl bg-white skeleton" />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white px-5 py-10 text-center sm:p-12">
          <Funnel size={32} className="mx-auto text-soft" />
          <p className="mt-3 font-medium text-ink">{insights?.hasCategories ? "No matching open requests right now" : "Choose what you supply to unlock matching"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{insights?.hasCategories ? "New buyer requests are posted regularly. Clear the filters or keep your profile verified so you can be contacted first." : "Add your supply categories and we will surface the buyer requests most relevant to your business."}</p>
          {insights?.hasCategories
            ? <button type="button" onClick={() => { setSearch(""); setCategory(""); setRequestType(""); setLocation(""); setDeadline(""); setPage(1); }} className="btn mt-5 min-h-11">Clear filters</button>
            : <Link href="/provider/profile" className="btn btn-primary mt-5 min-h-11">Select supply categories</Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp: any) => {
            const isClosingSoon = closingSoon(opp.desired_delivery_date);
            const hasProposed = !!opp.my_proposal_status;
            return (
              <Link
                key={opp.id}
                href={`/provider/opportunities/${opp.id}`}
                className={`block rounded-xl border bg-white p-4 transition hover:shadow-md ${
                  isClosingSoon ? "border-l-4 border-l-amber-400" : "border-border"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-ink">{opp.title}</h3>
                      {opp.request_type === "service" ? (
                        <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Service</span>
                      ) : (
                        <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Product</span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-soft">{opp.description || opp.notes || "No description"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      {opp.category_name && (
                        <span className="inline-flex items-center gap-1">
                          <Cube size={12} /> {opp.category_name}
                        </span>
                      )}
                      {opp.delivery_location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} /> {opp.delivery_location}
                        </span>
                      )}
                      {opp.quantity && (
                        <span className="inline-flex items-center gap-1">
                          {opp.quantity}{opp.unit ? ` ${opp.unit}` : ""}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        {deadlineLabel(opp.desired_delivery_date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-xs text-muted">
                      {opp.proposal_count} proposal{opp.proposal_count !== 1 ? "s" : ""}
                    </span>
                    {hasProposed ? (
                      <span className="rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                        Proposal sent
                      </span>
                    ) : (
                      <span className="rounded bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        Send proposal
                      </span>
                    )}
                    {isClosingSoon && (
                      <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                        Closing soon
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-xs">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-30 disabled:pointer-events-none"
          >
            <CaretLeft size={12} weight="bold" /> Previous
          </button>
          <span className="text-muted">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
            disabled={page >= pagination.pages}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-muted transition hover:border-accent hover:text-accent disabled:opacity-30 disabled:pointer-events-none"
          >
            Next <CaretRight size={12} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
