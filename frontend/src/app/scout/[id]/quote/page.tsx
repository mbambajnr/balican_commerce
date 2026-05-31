"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ArrowLeft, Package, MapPin, CalendarBlank, CurrencyCircleDollar,
  CheckCircle, PaperPlaneTilt, Warning,
} from "@phosphor-icons/react";

export default function SubmitScoutQuotePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [scoutRequest, setScoutRequest] = useState<any>(null);
  const [existingQuote, setExistingQuote] = useState<any>(null);
  const [fetching, setFetching] = useState(true);

  const [form, setForm] = useState({
    quotedPrice: "",
    deliveryDate: "",
    paymentTerms: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/auth/login"); return; }
    if (!(user as any).is_provider) {
      toast.error("Only supplier accounts can submit quotes");
      router.push("/scout/available");
      return;
    }
    api.getMyScoutQuote(id)
      .then((r) => {
        setScoutRequest(r.request);
        if (r.quote) {
          setExistingQuote(r.quote);
          setForm({
            quotedPrice: String(r.quote.quoted_price),
            deliveryDate: r.quote.delivery_date ? r.quote.delivery_date.split("T")[0] : "",
            paymentTerms: r.quote.payment_terms ?? "",
            notes: r.quote.notes ?? "",
          });
        }
      })
      .catch(() => toast.error("Failed to load request"))
      .finally(() => setFetching(false));
  }, [user, loading]);

  const set = (field: string, val: string) => setForm((p) => ({ ...p, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(form.quotedPrice);
    if (!price || price <= 0) { toast.error("Quoted price must be a positive number"); return; }

    setSubmitting(true);
    try {
      await api.submitScoutQuote(id, {
        quotedPrice: price,
        deliveryDate: form.deliveryDate || undefined,
        paymentTerms: form.paymentTerms.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success(existingQuote ? "Quote updated" : "Quote submitted successfully");
      router.push("/scout/available");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit quote");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-surface" />
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (!scoutRequest) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <p className="text-sm text-muted">Request not found or no longer open.</p>
        <Link href="/scout/available" className="btn mt-4">Back to Available Requests</Link>
      </div>
    );
  }

  if (scoutRequest.status !== "open") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <Warning size={40} className="mx-auto text-amber-500" weight="light" />
        <p className="mt-4 text-sm font-medium text-ink">This request is no longer accepting quotes</p>
        <p className="mt-1 text-sm text-muted capitalize">Status: {scoutRequest.status}</p>
        <Link href="/scout/available" className="btn mt-6">Browse Open Requests</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/scout/available" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Open Requests
      </Link>

      {/* Request summary card */}
      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scout Request</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">{scoutRequest.title}</h2>
        {scoutRequest.description && (
          <p className="mt-2 text-sm text-soft leading-relaxed">{scoutRequest.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Package size={12} />
            {scoutRequest.quantity}{scoutRequest.unit ? ` ${scoutRequest.unit}` : ""}
          </span>
          {scoutRequest.delivery_location && (
            <span className="flex items-center gap-1.5">
              <MapPin size={12} />
              {scoutRequest.delivery_location}
            </span>
          )}
          {scoutRequest.desired_delivery_date && (
            <span className="flex items-center gap-1.5">
              <CalendarBlank size={12} />
              Needed by {new Date(scoutRequest.desired_delivery_date).toLocaleDateString()}
            </span>
          )}
          {(scoutRequest.budget_min || scoutRequest.budget_max) && (
            <span className="flex items-center gap-1.5">
              <CurrencyCircleDollar size={12} />
              Budget GH₵{scoutRequest.budget_min?.toLocaleString() ?? "?"} – GH₵{scoutRequest.budget_max?.toLocaleString() ?? "?"}
            </span>
          )}
        </div>
        {scoutRequest.notes && (
          <p className="mt-2 text-xs text-muted italic">{scoutRequest.notes}</p>
        )}
      </div>

      {/* Accepted badge if already won */}
      {existingQuote?.status === "accepted" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle size={18} weight="fill" />
          Your quote was accepted by the buyer. An order has been created.
        </div>
      )}

      {/* Quote form */}
      <div className="mt-6">
        <h3 className="text-base font-semibold text-ink">
          {existingQuote ? "Update Your Quote" : "Submit Your Quote"}
        </h3>
        {existingQuote && existingQuote.status === "pending" && (
          <p className="mt-1 text-xs text-muted">Your quote is pending buyer review. You can update it while the request is open.</p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* Price */}
          <div>
            <label className="input-label">
              Unit Price (GH₵) <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-xs text-muted">
              Price per {scoutRequest.unit || "unit"}. Total will be × {scoutRequest.quantity}.
            </p>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">GH₵</span>
              <input
                type="number"
                min="0.01"
                step="any"
                className="input pl-12"
                placeholder="0.00"
                value={form.quotedPrice}
                onChange={(e) => set("quotedPrice", e.target.value)}
                required
              />
            </div>
            {form.quotedPrice && parseFloat(form.quotedPrice) > 0 && (
              <p className="mt-1 text-xs text-accent font-medium">
                Total: GH₵{(parseFloat(form.quotedPrice) * Number(scoutRequest.quantity)).toLocaleString()}
              </p>
            )}
          </div>

          {/* Delivery date */}
          <div>
            <label className="input-label">Estimated Delivery Date</label>
            <input
              type="date"
              className="input mt-1"
              value={form.deliveryDate}
              onChange={(e) => set("deliveryDate", e.target.value)}
            />
          </div>

          {/* Payment terms */}
          <div>
            <label className="input-label">Payment Terms</label>
            <input
              className="input mt-1"
              placeholder="e.g. 50% upfront, 50% on delivery"
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="input-label">Notes to Buyer</label>
            <textarea
              className="input mt-1 min-h-[90px] resize-y"
              placeholder="Availability, lead time, brand details, substitutions…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={submitting} className="btn btn-primary gap-2">
              <PaperPlaneTilt size={16} weight="bold" />
              {submitting ? "Submitting…" : existingQuote ? "Update Quote" : "Submit Quote"}
            </button>
            <Link href="/scout/available" className="btn">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
