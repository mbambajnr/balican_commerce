"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  MagnifyingGlass, Plus, ArrowRight, CheckCircle,
  XCircle, Clock, Warning, Package, Wrench,
} from "@phosphor-icons/react";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: {
    label: "Open",
    color: "bg-blue-50 text-blue-700",
    icon: <Clock size={12} weight="fill" />,
  },
  awarded: {
    label: "Awarded",
    color: "bg-emerald-50 text-emerald-700",
    icon: <CheckCircle size={12} weight="fill" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-gray-100 text-gray-500",
    icon: <XCircle size={12} weight="fill" />,
  },
  expired: {
    label: "Expired",
    color: "bg-amber-50 text-amber-700",
    icon: <Warning size={12} weight="fill" />,
  },
};

function RequestCard({ r }: { r: any }) {
  const meta = STATUS_META[r.status] ?? { label: r.status, color: "bg-gray-100 text-gray-600", icon: null };
  const quoteCount = Number(r.quote_count);

  return (
    <Link
      href={`/scout/${r.id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-sm"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-ink truncate">{r.title}</p>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
            {meta.icon}
            {meta.label}
          </span>
          {r.request_type === "service" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
              <Wrench size={10} weight="fill" /> Service
            </span>
          )}
          {r.category_name && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted border border-border">
              {r.category_name}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Qty {r.quantity}{r.unit ? ` ${r.unit}` : ""}
          {r.delivery_location ? ` · ${r.delivery_location}` : ""}
          {r.desired_delivery_date ? ` · By ${new Date(r.desired_delivery_date).toLocaleDateString()}` : ""}
        </p>
        <p className="mt-1 text-xs text-soft">
          {quoteCount === 0 ? "No quotes yet" : `${quoteCount} quote${quoteCount !== 1 ? "s" : ""} received`}
          {" · "}
          {new Date(r.created_at).toLocaleDateString()}
        </p>
      </div>
      <ArrowRight size={18} className="shrink-0 text-muted" />
    </Link>
  );
}

function Section({
  title, description, requests, emptyIcon, emptyTitle, emptyBody,
}: {
  title: string;
  description?: string;
  requests: any[];
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (requests.length === 0 && !emptyTitle) return null;
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {requests.length > 0 && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted border border-border">
            {requests.length}
          </span>
        )}
        {description && <p className="ml-auto text-xs text-muted">{description}</p>}
      </div>
      {requests.length === 0 && emptyTitle ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-8 text-center">
          {emptyIcon && <div className="mx-auto mb-2 text-muted">{emptyIcon}</div>}
          <p className="text-sm font-medium text-ink">{emptyTitle}</p>
          {emptyBody && <p className="mt-0.5 text-xs text-muted">{emptyBody}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => <RequestCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

export default function ScoutDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    load();
  }, [user, loading]);

  const load = () => {
    setFetching(true);
    api.getScoutRequests({ limit: "100" })
      .then((r) => setRequests(r.requests))
      .catch(() => {})
      .finally(() => setFetching(false));
  };

  if (loading || !user) return null;

  const openWithQuotes   = requests.filter((r) => r.status === "open" && Number(r.quote_count) > 0);
  const openNoQuotes     = requests.filter((r) => r.status === "open" && Number(r.quote_count) === 0);
  const awarded          = requests.filter((r) => r.status === "awarded");
  const closed           = requests.filter((r) => r.status === "cancelled" || r.status === "expired");

  const activeCount = openWithQuotes.length + openNoQuotes.length;
  const totalCount  = requests.length;

  const showActive  = filterStatus === "active" || filterStatus === "";
  const showClosed  = filterStatus === "closed" || filterStatus === "";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
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

      <div className="mt-6 flex items-center gap-2">
        {[
          { key: "active", label: `Active (${activeCount})` },
          { key: "awarded", label: `Awarded (${awarded.length})` },
          { key: "closed", label: `Closed (${closed.length})` },
          { key: "", label: "All" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === key
                ? "bg-accent text-white"
                : "bg-surface text-muted hover:bg-border hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-8">
        {fetching ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-20 text-center">
            <MagnifyingGlass size={48} className="mx-auto text-muted" weight="light" />
            <p className="mt-4 text-sm font-medium text-ink">No Scout requests yet</p>
            <p className="mt-1 text-sm text-muted">Post a request and let verified suppliers compete for your business.</p>
            <Link href="/scout/new" className="btn btn-primary mt-6 gap-2">
              <Plus size={16} weight="bold" />
              Create your first request
            </Link>
          </div>
        ) : (
          <>
            {(showActive || filterStatus === "active") && openWithQuotes.length > 0 && (
              <Section
                title="Quotes ready to review"
                description="These requests have supplier quotes waiting for your decision."
                requests={openWithQuotes}
              />
            )}

            {(showActive || filterStatus === "active") && (
              <Section
                title="Waiting for quotes"
                requests={openNoQuotes}
                emptyTitle={filterStatus === "active" ? "All open requests have quotes" : undefined}
                emptyBody="Check the 'Quotes ready' section above."
              />
            )}

            {(filterStatus === "awarded" || filterStatus === "") && (
              <Section
                title="Awarded"
                description="Quote accepted — order created."
                requests={awarded}
                emptyTitle={filterStatus === "awarded" ? "No awarded requests yet" : undefined}
                emptyBody="Accept a quote from an open request to convert it into an order."
              />
            )}

            {showClosed && (
              <Section
                title="Closed"
                description="Cancelled or expired requests."
                requests={closed}
                emptyTitle={filterStatus === "closed" ? "No closed requests" : undefined}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
