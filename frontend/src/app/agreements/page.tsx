"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import {
  FileText, CheckCircle, Circle, XCircle,
  CurrencyCircleDollar, CalendarBlank, ArrowRight, Funnel,
} from "@phosphor-icons/react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  active:    { label: "Active",    color: "bg-blue-50 text-blue-700" },
  completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
};

export default function AgreementsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [agreements, setAgreements] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const load = () => {
    setFetching(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusFilter) params.status = statusFilter;
    api.getAgreements(params)
      .then((r) => { setAgreements(r.agreements); setPagination(r.pagination); })
      .catch(() => toast.error("Failed to load agreements"))
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    load();
  }, [user, loading, page, statusFilter]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Agreements</h1>
          <p className="mt-1 text-sm text-muted">Manage accepted proposals and supplier agreements.</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6 flex items-center gap-2">
        <Funnel size={16} className="text-muted" />
        {["", "active", "completed", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === s
                ? "bg-accent text-white"
                : "bg-surface text-muted hover:text-ink"
            }`}
          >
            {s ? STATUS_META[s]?.label ?? s : "All"}
          </button>
        ))}
      </div>

      {fetching ? (
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : agreements.length === 0 ? (
        <div className="mt-16 text-center">
          <FileText size={48} className="mx-auto text-muted" weight="light" />
          <p className="mt-3 text-sm font-medium text-ink">No agreements found</p>
          <p className="mt-1 text-sm text-muted">Accepted proposals will appear here.</p>
          <Link href="/scout" className="btn mt-4">Browse Scout Requests</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {agreements.map((a: any) => {
            const sm = STATUS_META[a.status] ?? { label: a.status, color: "bg-gray-100 text-gray-600" };
            return (
              <Link
                key={a.id}
                href={`/agreements/${a.id}`}
                className="block rounded-xl border border-border bg-white p-5 transition hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ink truncate">{a.requestTitle}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${sm.color}`}>
                        {sm.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {a.buyerCompanyName} &rarr; {a.providerCompanyName}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <CurrencyCircleDollar size={13} />
                        GH₵{Number(a.agreedPrice).toLocaleString()}
                      </span>
                      {a.agreedDeliveryDate && (
                        <span className="flex items-center gap-1">
                          <CalendarBlank size={13} />
                          Due {new Date(a.agreedDeliveryDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={18} className="mt-1 shrink-0 text-muted" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`h-8 w-8 rounded-lg text-xs font-medium ${
                page === i + 1 ? "bg-accent text-white" : "bg-surface text-muted hover:text-ink"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
