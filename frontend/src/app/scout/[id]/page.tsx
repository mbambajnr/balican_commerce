"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import WhatsAppShareLink from "@/components/WhatsAppShareLink";
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
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [showRecs, setShowRecs] = useState(false);
  const [recLoading, setRecLoading] = useState(false);

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
    if (!confirm("Accept this proposal and create an agreement?")) return;
    setAccepting(quoteId);
    try {
      const res = await api.acceptProposal(quoteId);
      toast.success("Proposal accepted — Agreement created");
      router.push(`/agreements/${res.agreement.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to accept proposal");
      setAccepting(null);
    }
  };

  const loadRecommendations = async () => {
    setRecLoading(true);
    try {
      const res = await api.getScoutRequestRecommendations(id);
      setRecommendations(res.recommendations);
    } catch { toast.error("Failed to load recommendations"); }
    finally { setRecLoading(false); }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/scout" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back to Scout</Link>
        <WhatsAppShareLink title={`Sourcing request: ${scoutRequest.title}`} />
      </div>

      {/* Request header */}
      <div className="mt-4 rounded-xl border border-border bg-white p-5 sm:p-6">
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
              className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-red-500 hover:bg-red-50"
            >
              {cancelling ? "Cancelling…" : "Cancel request"}
            </button>
          )}
        </div>
      </div>

      {/* Recommended Providers */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">
            Recommended Providers
            {recommendations.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted">({recommendations.length})</span>
            )}
          </h2>
          <button
            onClick={() => { if (!showRecs) loadRecommendations(); setShowRecs(!showRecs); }}
            className="text-sm font-medium text-accent hover:underline"
          >
            {showRecs ? "Hide" : "See recommendations"}
          </button>
        </div>

        {showRecs && (
          <div className="mt-4">
            {recLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-surface" />
                ))}
              </div>
            ) : recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-10 text-center">
                <p className="text-sm text-muted">No recommendations available yet.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {recommendations.map((rec: any) => (
                  <div key={rec.providerCompanyId} className="rounded-xl border border-border bg-white p-5 transition-shadow hover:shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
                        {rec.providerName?.charAt(0) ?? "P"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink truncate">{rec.providerName}</p>
                        <p className="text-xs text-muted">{rec.providerType?.replace(/_/g, " ") || "Provider"}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        rec.finalScore >= 80 ? "bg-green-50 text-green-700" :
                        rec.finalScore >= 50 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {rec.finalScore}%
                      </span>
                    </div>
                    {rec.matchReasons?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {rec.matchReasons.map((r: any, i: number) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-muted">
                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/40" />
                            {r.reason || r}
                          </li>
                        ))}
                      </ul>
                    )}
                    {rec.offeringName && (
                      <p className="mt-2 text-xs text-accent">Offering: {rec.offeringName}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quote comparison */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
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
                          Accept &amp; Create Agreement
                        </>
                      )}
                    </button>
                  )}

                  {q.status === "accepted" && (
                    <Link
                      href={`/agreements/${q.agreement_id || q.request_id}`}
                      className="btn mt-4 w-full gap-2 justify-center"
                    >
                      View Agreement <ArrowRight size={14} />
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
