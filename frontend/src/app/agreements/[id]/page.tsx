"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ArrowLeft, CheckCircle, Circle, XCircle,
  CurrencyCircleDollar, CalendarBlank, MapPin, Package,
  Building, User, FileText, ArrowRight, Warning,
  DotsThree, ClockAfternoon, Prohibit, SealCheck,
} from "@phosphor-icons/react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  active:    { label: "Active",    color: "bg-blue-50 text-blue-700" },
  completed: { label: "Completed", color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500" },
};

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [agreement, setAgreement] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [converting, setConverting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    load();
  }, [user, loading]);

  const load = () => {
    setFetching(true);
    api.getAgreement(id)
      .then((r) => setAgreement(r.agreement))
      .catch(() => toast.error("Failed to load agreement"))
      .finally(() => setFetching(false));
  };

  const handleConvert = async () => {
    if (!confirm("Convert this agreement to an order? The order will be created with status 'pending'.")) return;
    setConverting(true);
    try {
      const res = await api.convertAgreementToOrder(id);
      toast.success(`Order ${res.order.order_number} created`);
      router.push(`/account/orders/${res.order.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to convert to order");
      setConverting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this agreement? This will reopen the Scout request.")) return;
    setCancelling(true);
    try {
      await api.updateAgreementStatus(id, { status: "cancelled", reason: "Cancelled by buyer" });
      toast.success("Agreement cancelled");
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
        <div className="h-6 w-48 animate-pulse rounded bg-surface" />
        <div className="h-48 animate-pulse rounded-xl bg-surface" />
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <p className="text-sm text-muted">Agreement not found.</p>
        <Link href="/agreements" className="btn mt-4">Back to Agreements</Link>
      </div>
    );
  }

  const sm = STATUS_META[agreement.status] ?? { label: agreement.status, color: "bg-gray-100 text-gray-600" };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/agreements" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Agreements
      </Link>

      {/* Header */}
      <div className="mt-6 rounded-xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold text-ink">{agreement.requestTitle}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sm.color}`}>
                {sm.label}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Package size={15} />
                {agreement.quantity}{agreement.unit ? ` ${agreement.unit}` : ""}
              </span>
              {agreement.deliveryLocation && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} />
                  {agreement.deliveryLocation}
                </span>
              )}
              {agreement.agreedDeliveryDate && (
                <span className="flex items-center gap-1.5">
                  <CalendarBlank size={15} />
                  Due {new Date(agreement.agreedDeliveryDate).toLocaleDateString()}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CurrencyCircleDollar size={15} />
                GH₵{Number(agreement.agreedPrice).toLocaleString()}
              </span>
            </div>
            {agreement.requestDescription && (
              <p className="mt-3 text-sm text-soft leading-relaxed">{agreement.requestDescription}</p>
            )}
          </div>
        </div>
      </div>

      {/* Provider info */}
      <div className="mt-6 rounded-xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Building size={16} /> Provider
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-lg font-bold text-ink">
            {agreement.providerLogo ? (
              <img src={agreement.providerLogo} alt={agreement.providerCompanyName} className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              agreement.providerCompanyName?.charAt(0) ?? "S"
            )}
          </div>
          <div>
            <p className="font-semibold text-ink">{agreement.providerCompanyName}</p>
            <p className="text-xs text-muted">
              {agreement.providerCity}
              {agreement.providerCompanyEmail && ` · ${agreement.providerCompanyEmail}`}
            </p>
          </div>
        </div>
      </div>

      {/* Quote details */}
      <div className="mt-6 rounded-xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileText size={16} /> Proposal Details
        </h2>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Agreed Price</span>
            <span className="font-semibold text-ink">GH₵{Number(agreement.agreedPrice).toLocaleString()}</span>
          </div>
          {agreement.paymentTerms && (
            <div className="flex justify-between">
              <span className="text-muted">Payment Terms</span>
              <span className="text-ink">{agreement.paymentTerms}</span>
            </div>
          )}
          {agreement.quoteDeliveryDate && (
            <div className="flex justify-between">
              <span className="text-muted">Delivery Timeline</span>
              <span className="text-ink">{new Date(agreement.quoteDeliveryDate).toLocaleDateString()}</span>
            </div>
          )}
          {agreement.quoteNotes && (
            <p className="mt-2 italic text-soft">{agreement.quoteNotes}</p>
          )}
        </div>
      </div>

      {/* Agreement Timeline */}
      {agreement.timeline && agreement.timeline.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-white p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink mb-4">
            <ClockAfternoon size={16} /> Agreement Timeline
          </h2>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-1 bottom-1 w-0.5 bg-border" />
            <div className="space-y-0">
              {agreement.timeline.map((item: any, idx: number) => {
                const isLast = idx === agreement.timeline.length - 1;

                const dotColor = item.status === "completed" ? "border-emerald-500 bg-emerald-100"
                  : item.status === "current" ? "border-accent bg-accent/10"
                  : item.status === "cancelled" ? "border-red-400 bg-red-50"
                  : "border-gray-300 bg-gray-50";

                const dotIcon = item.status === "completed" ? <CheckCircle size={10} weight="fill" className="text-emerald-600" />
                  : item.status === "current" ? <Circle size={10} weight="fill" className="text-accent" />
                  : item.status === "cancelled" ? <XCircle size={10} weight="fill" className="text-red-400" />
                  : <Circle size={10} className="text-gray-300" />;

                const titleColor = item.status === "cancelled" ? "text-red-600"
                  : item.status === "pending" ? "text-muted"
                  : "text-ink";

                const descColor = item.status === "pending" ? "text-muted/60"
                  : item.status === "cancelled" ? "text-red-500/70"
                  : "text-muted";

                return (
                  <div key={item.type} className="relative flex gap-4 pb-5">
                    {/* Dot */}
                    <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${dotColor}`}>
                      {dotIcon}
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm font-semibold ${titleColor}`}>{item.title}</p>
                        {item.status === "current" && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                            Current
                          </span>
                        )}
                        {item.status === "pending" && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                            Pending
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className={`text-xs ${descColor}`}>{item.description}</p>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted/60">
                        {item.timestamp && (
                          <span>{new Date(item.timestamp).toLocaleString()}</span>
                        )}
                        {item.actorLabel && (
                          <span>— {item.actorLabel}</span>
                        )}
                      </div>
                      {item.href && (
                        <a
                          href={item.href}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                        >
                          View details <ArrowRight size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Order info if converted */}
      {agreement.order && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle size={16} weight="fill" /> Converted to Order
              </h2>
              <p className="mt-1 text-xs text-emerald-700">
                Order {agreement.order.orderNumber} · {agreement.order.status}
              </p>
            </div>
            <Link
              href={`/account/orders/${agreement.order.id}`}
              className="btn gap-2 text-sm"
            >
              View Order <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        {agreement.status === "active" && (
          <>
            <button
              onClick={handleConvert}
              disabled={converting}
              className="btn btn-primary gap-2"
            >
              {converting ? "Converting…" : (
                <><CheckCircle size={16} weight="bold" /> Convert to Order</>
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="btn gap-2 text-red-600 border-red-200 hover:bg-red-50"
            >
              {cancelling ? "Cancelling…" : (
                <><XCircle size={16} /> Cancel Agreement</>
              )}
            </button>
          </>
        )}
        {agreement.status === "cancelled" && (
          <Link href={`/scout/${agreement.scoutRequestId}`} className="btn gap-2">
            <ArrowLeft size={16} /> Return to Scout Request
          </Link>
        )}
        {agreement.status === "completed" && agreement.order && (
          <Link href={`/account/orders/${agreement.order.id}`} className="btn btn-primary gap-2">
            <ArrowRight size={16} /> View Order
          </Link>
        )}
      </div>
    </div>
  );
}
