"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  MagnifyingGlass, Plus, ArrowRight, ClockCountdown,
  CheckCircle, XCircle, Hourglass, SlidersHorizontal,
} from "@phosphor-icons/react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:      { label: "Open",      color: "bg-blue-50 text-blue-700" },
  awarded:   { label: "Awarded",   color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
  expired:   { label: "Expired",   color: "bg-amber-50 text-amber-700" },
};

export default function ScoutPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    load();
  }, [user, loading, filterStatus]);

  const load = () => {
    setFetching(true);
    api.getScoutRequests({ status: filterStatus || undefined })
      .then((r) => setRequests(r.requests))
      .catch(() => {})
      .finally(() => setFetching(false));
  };

  if (loading || !user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Scout Requests</h1>
          <p className="mt-1 text-sm text-muted">Request quotes from multiple suppliers for any product or service.</p>
        </div>
        <Link href="/scout/new" className="btn btn-primary gap-2">
          <Plus size={16} weight="bold" />
          New Scout Request
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SlidersHorizontal size={16} className="text-muted" />
        {["", "open", "awarded", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-accent text-white"
                : "bg-surface text-muted hover:bg-border hover:text-ink"
            }`}
          >
            {s === "" ? "All" : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="mt-6">
        {fetching ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center">
            <MagnifyingGlass size={48} className="mx-auto text-muted" weight="light" />
            <p className="mt-4 text-sm font-medium text-ink">No Scout requests yet</p>
            <p className="mt-1 text-sm text-muted">Create a request to start collecting supplier quotes.</p>
            <Link href="/scout/new" className="btn btn-primary mt-6 gap-2">
              <Plus size={16} weight="bold" />
              Create your first request
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r: any) => {
              const meta = STATUS_META[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-600" };
              return (
                <Link
                  key={r.id}
                  href={`/scout/${r.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink truncate">{r.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Qty {r.quantity}{r.unit ? ` ${r.unit}` : ""}
                      {r.delivery_location ? ` · ${r.delivery_location}` : ""}
                      {r.desired_delivery_date ? ` · By ${new Date(r.desired_delivery_date).toLocaleDateString()}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-soft">
                      {r.quote_count} quote{r.quote_count !== 1 ? "s" : ""} received
                      {" · "}
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <ArrowRight size={18} className="shrink-0 text-muted" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
