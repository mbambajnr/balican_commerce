"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ArrowLeft, CheckCircle, XCircle, Hourglass, Trophy,
  CurrencyCircleDollar, CalendarBlank, ClockCountdown,
  Package, MapPin, Warning, ArrowRight,
} from "@phosphor-icons/react";

const QUOTE_STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: "Pending",  color: "bg-blue-50 text-blue-700",    icon: Hourglass },
  accepted: { label: "Accepted", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle },
  declined: { label: "Declined", color: "bg-gray-100 text-gray-500",   icon: XCircle },
  expired:  { label: "Expired",  color: "bg-amber-50 text-amber-700",  icon: ClockCountdown },
};

const REQUEST_STATUS_META: Record<string, { label: string; color: string }> = {
  open:      { label: "Open",      color: "bg-blue-50 text-blue-700" },
  awarded:   { label: "Awarded",   color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
  expired:   { label: "Expired",   color: "bg-amber-50 text-amber-700" },
};

export default function ScoutRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [scoutRequest, setScoutRequest] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    load();
  }, [user, loading]);

  const load = () => {
    setFetching(true);
    api.getScoutRequest(id)
      .then((r) => { setScoutRequest(r.request); setQuotes(r.quotes); })
      .catch(() => toast.error("Failed to load Scout request"))
      .finally(() => setFetching(false));
  };

  const handleAccept = async (quoteId: string) => {
    if (!confirm("Accept this quote and convert it to an order?")) return;
    setAccepting(quoteId);
    try {
      const res = await api.acceptScoutQuote(id, quoteId);
      toast.success(`Quote accepted — Order ${res.order.order_number} created`);
      router.push(`/account/orders/${res.order.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to accept quote");
      setAccepting(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this Scout request?")) return;
    setCancelling(true);
    try {
      await api.cancelScoutRequest(id);
      toast.success("Request cancelled");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-surface" />
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-surface" />)}
        </div>
      </div>
    );
  }

  if (!scoutRequest) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <p className="text-sm text-muted">Scout request not found.</p>
        <Link href="/scout" className="btn mt-4">Back to Scout</Link>
      </div>
    );
  }

  const statusMeta = REQUEST_STATUS_META[scoutRequest.status] ?? { label: scoutRequest.status, color: "bg-gray-100 text-gray-600" };
  const lowestQuote = quotes.filter((q) => q.status === "pending").sort((a, b) => a.quoted_price - b.quoted_price)[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/scout" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Scout
      </Link>

      {/* Request header */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-ink">{scoutRequest.title}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusMeta.color}`}>
                {statusMeta.label}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Package size={15} />
                {scoutRequest.quantity}{scoutRequest.unit ? ` ${scoutRequest.unit}` : ""}
              </span>
              {scoutRequest.delivery_location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} />
                  {scoutRequest.delivery_location}
                </span>
              )}
              {scoutRequest.desired_delivery_date && (
                <span className="flex items-center gap-1.5">
                  <CalendarBlank size={15} />
                  By {new Date(scoutRequest.desired_delivery_date).toLocaleDateString()}
                </span>
              )}
              {(scoutRequest.budget_min || scoutRequest.budget_max) && (
                <span className="flex items-center gap-1.5">
                  <CurrencyCircleDollar size={15} />
                  Budget: GH₵{scoutRequest.budget_min?.toLocaleString() ?? "—"} – GH₵{scoutRequest.budget_max?.toLocaleString() ?? "—"}
                </span>
              )}
            </div>
            {scoutRequest.description && (
              <p className="mt-3 text-sm text-soft leading-relaxed">{scoutRequest.description}</p>
            )}
            {scoutRequest.notes && (
              <p className="mt-2 text-xs text-muted italic">{scoutRequest.notes}</p>
            )}
          </div>

          {scoutRequest.status === "open" && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="shrink-0 text-sm text-red-500 hover:underline"
            >
              {cancelling ? "Cancelling…" : "Cancel request"}
            </button>
          )}
        </div>
      </div>

      {/* Quote comparison */}
      <div className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">
            Quotes Received
            <span className="ml-2 text-sm font-normal text-muted">({quotes.length})</span>
          </h2>
          {scoutRequest.status === "open" && quotes.filter((q) => q.status === "pending").length === 0 && (
            <p className="text-sm text-muted">Waiting for suppliers to submit quotes…</p>
          )}
        </div>

        {quotes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border py-16 text-center">
            <Hourglass size={40} className="mx-auto text-muted" weight="light" />
            <p className="mt-3 text-sm font-medium text-ink">No quotes yet</p>
            <p className="mt-1 text-sm text-muted">Suppliers will start submitting quotes shortly.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {quotes.map((q: any) => {
              const qMeta = QUOTE_STATUS_META[q.status] ?? { label: q.status, color: "bg-gray-100 text-gray-600", icon: Hourglass };
              const Icon = qMeta.icon;
              const isBest = lowestQuote?.id === q.id;
              const totalPrice = Number(q.quoted_price) * Number(scoutRequest.quantity);

              return (
                <div
                  key={q.id}
                  className={`relative rounded-xl border bg-white p-5 transition-shadow ${
                    q.status === "accepted"
                      ? "border-emerald-300 ring-1 ring-emerald-200"
                      : isBest && scoutRequest.status === "open"
                      ? "border-accent/30 ring-1 ring-accent/20"
                      : "border-border"
                  }`}
                >
                  {isBest && scoutRequest.status === "open" && (
                    <div className="absolute -top-2.5 left-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold text-white">
                      Lowest Price
                    </div>
                  )}
                  {q.status === "accepted" && (
                    <div className="absolute -top-2.5 left-4 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-semibold text-white flex items-center gap-1">
                      <Trophy size={10} weight="fill" /> Accepted
                    </div>
                  )}

                  {/* Provider */}
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-sm font-bold text-ink">
                      {q.provider_logo ? (
                        <img src={q.provider_logo} alt={q.provider_name} className="h-9 w-9 rounded-lg object-cover" />
                      ) : (
                        q.provider_name?.charAt(0) ?? "S"
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{q.provider_name}</p>
                      {q.provider_city && <p className="text-xs text-muted">{q.provider_city}</p>}
                    </div>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${qMeta.color}`}>
                      <Icon size={10} weight="fill" /> {qMeta.label}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="mt-4 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted">Unit price</p>
                      <p className="text-2xl font-bold text-ink">
                        GH₵{Number(q.quoted_price).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted">Total ({scoutRequest.quantity}{scoutRequest.unit ? ` ${scoutRequest.unit}` : ""})</p>
                      <p className="text-base font-semibold text-accent">GH₵{totalPrice.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
                    {q.delivery_date && (
                      <p className="flex items-center gap-1.5">
                        <CalendarBlank size={12} />
                        Deliver by {new Date(q.delivery_date).toLocaleDateString()}
                      </p>
                    )}
                    {q.payment_terms && (
                      <p className="flex items-center gap-1.5">
                        <CurrencyCircleDollar size={12} />
                        {q.payment_terms}
                      </p>
                    )}
                    {q.notes && <p className="italic text-soft">{q.notes}</p>}
                    <p className="text-[10px] text-soft">
                      Submitted {new Date(q.created_at).toLocaleDateString()}
                      {q.updated_at !== q.created_at ? " (updated)" : ""}
                    </p>
                  </div>

                  {/* Accept CTA */}
                  {scoutRequest.status === "open" && q.status === "pending" && (
                    <button
                      onClick={() => handleAccept(q.id)}
                      disabled={accepting !== null}
                      className="btn btn-primary mt-4 w-full gap-2"
                    >
                      {accepting === q.id ? "Processing…" : (
                        <>
                          <CheckCircle size={16} weight="bold" />
                          Accept &amp; Convert to Order
                        </>
                      )}
                    </button>
                  )}

                  {q.status === "accepted" && q.order_id && (
                    <Link
                      href={`/account/orders/${q.order_id}`}
                      className="btn mt-4 w-full gap-2 justify-center"
                    >
                      View Order <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
