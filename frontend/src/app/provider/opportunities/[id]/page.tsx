"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import WhatsAppShareLink from "@/components/WhatsAppShareLink";
import {
  ArrowLeft, MapPin, Calendar, Cube, Wrench,
  Clock, CurrencyCircleDollar, PaperPlaneTilt, CaretLeft,
} from "@phosphor-icons/react";

function deadlineLabel(d: string | null): string {
  if (!d) return "—";
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (days <= 0) return "Overdue";
  if (days === 1) return "1 day left";
  if (days <= 7) return `${days} days left`;
  return new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short" });
}

export default function OpportunityDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [opportunity, setOpportunity] = useState<any>(null);
  const [myProposal, setMyProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    amount: "",
    deliveryDate: "",
    creditTerms: "",
    availabilityStatus: "",
    proposalText: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getProviderOpportunity(params.id),
      api.getProviderMyProposal(params.id),
    ]).then(([oppRes, propRes]) => {
      setOpportunity(oppRes.opportunity);
      setMyProposal(propRes.proposal);
      if (propRes.proposal) {
        setForm({
          amount: propRes.proposal.amount || "",
          deliveryDate: propRes.proposal.deliveryDate || "",
          creditTerms: propRes.proposal.creditTerms || "",
          availabilityStatus: "",
          proposalText: propRes.proposal.proposalText || "",
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [params.id]);

  const set = (field: string, val: string) => setForm(p => ({ ...p, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.proposalText.trim()) { toast.error("Proposal message is required"); return; }

    setSubmitting(true);
    try {
      const res = await api.submitProviderProposal(params.id, {
        amount: form.amount ? parseFloat(form.amount) : undefined,
        deliveryDate: form.deliveryDate.trim() || undefined,
        creditTerms: form.creditTerms.trim() || undefined,
        availabilityStatus: form.availabilityStatus.trim() || undefined,
        proposalText: form.proposalText.trim(),
      });
      setMyProposal(res.proposal);
      setShowForm(false);
      toast.success("Proposal submitted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit proposal");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 skeleton" />
        <div className="h-48 skeleton" />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted">Opportunity not found.</p>
        <Link href="/provider/opportunities" className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline">
          <CaretLeft size={14} /> Back to opportunities
        </Link>
      </div>
    );
  }

  const isClosingSoon = opportunity.desiredDeliveryDate &&
    Math.ceil((new Date(opportunity.desiredDeliveryDate).getTime() - Date.now()) / 86400000) > 0 &&
    Math.ceil((new Date(opportunity.desiredDeliveryDate).getTime() - Date.now()) / 86400000) <= 7;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/provider/opportunities" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back to opportunities</Link>
        <WhatsAppShareLink title={`Procurement opportunity: ${opportunity.title}`} />
      </div>

      {/* Opportunity detail card */}
      <div className="mt-4 rounded-xl border border-border bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-semibold text-ink">{opportunity.title}</h1>
              {opportunity.requestType === "service" ? (
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Service</span>
              ) : (
                <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Product</span>
              )}
              {isClosingSoon && (
                <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Closing soon</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">{opportunity.buyerLabel}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted">{opportunity.proposalCount} proposal{opportunity.proposalCount !== 1 ? "s" : ""}</p>
            {myProposal && (
              <p className="mt-1 text-xs font-medium text-green-700">You have submitted a proposal</p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 min-[380px]:grid-cols-2 sm:grid-cols-4">
          {opportunity.categoryName && (
            <div>
              <p className="text-[11px] text-muted">Category</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{opportunity.categoryName}</p>
            </div>
          )}
          {opportunity.deliveryLocation && (
            <div>
              <p className="text-[11px] text-muted">Location</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-ink">
                <MapPin size={14} className="shrink-0 text-soft" /> {opportunity.deliveryLocation}
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] text-muted">Quantity</p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {opportunity.quantity}{opportunity.unit ? ` ${opportunity.unit}` : ""}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Deadline</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-ink">
              <Calendar size={14} className="shrink-0 text-soft" />
              {deadlineLabel(opportunity.desiredDeliveryDate)}
            </p>
          </div>
          {(opportunity.budgetMin || opportunity.budgetMax) && (
            <div>
              <p className="text-[11px] text-muted">Budget</p>
              <p className="mt-0.5 text-sm font-medium text-ink">
                {opportunity.budgetMin ? `GH₵${opportunity.budgetMin}` : ""}
                {opportunity.budgetMin && opportunity.budgetMax ? " – " : ""}
                {opportunity.budgetMax ? `GH₵${opportunity.budgetMax}` : ""}
              </p>
            </div>
          )}
        </div>

        {(opportunity.description || opportunity.notes) && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-[11px] text-muted">Description</p>
            <p className="mt-1 text-sm text-ink whitespace-pre-wrap">{opportunity.description || opportunity.notes}</p>
          </div>
        )}
      </div>

      {/* Proposal section */}
      {opportunity.status !== "open" ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-white p-6 text-center">
          <p className="text-sm text-muted">This opportunity is no longer accepting proposals.</p>
        </div>
      ) : myProposal && !showForm ? (
        <div className="mt-6 rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Your Proposal</h2>
              <p className="text-xs text-muted">Submitted — you can update your proposal at any time.</p>
            </div>
            <button onClick={() => setShowForm(true)} className="btn btn-sm">Edit proposal</button>
          </div>
          <div className="mt-4 grid gap-4 min-[380px]:grid-cols-2 sm:grid-cols-4">
            {myProposal.amount && (
              <div>
                <p className="text-[11px] text-muted">Amount</p>
                <p className="mt-0.5 text-sm font-medium text-ink">GH₵{myProposal.amount}</p>
              </div>
            )}
            {myProposal.deliveryDate && (
              <div>
                <p className="text-[11px] text-muted">Delivery date</p>
                <p className="mt-0.5 text-sm font-medium text-ink">{new Date(myProposal.deliveryDate).toLocaleDateString("en-GH", { day: "numeric", month: "short" })}</p>
              </div>
            )}
            {myProposal.creditTerms && (
              <div>
                <p className="text-[11px] text-muted">Terms</p>
                <p className="mt-0.5 text-sm font-medium text-ink">{myProposal.creditTerms}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] text-muted">Status</p>
              <p className="mt-0.5 text-sm font-medium capitalize text-ink">{myProposal.status}</p>
            </div>
          </div>
          {myProposal.proposalText && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-[11px] text-muted">Message</p>
              <p className="mt-1 text-sm text-ink whitespace-pre-wrap">{myProposal.proposalText}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h2 className="font-semibold text-ink">
              {myProposal ? "Update Your Proposal" : "Send a Proposal"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Include price, delivery timing, availability, warranty/support, and credit terms if applicable.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="input-label">Proposal amount (GH₵) — Optional</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input mt-1"
                  placeholder="e.g. 15000"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Delivery date — Optional</label>
                <input
                  type="date"
                  className="input mt-1"
                  value={form.deliveryDate}
                  onChange={(e) => set("deliveryDate", e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Credit terms — Optional</label>
                <input
                  className="input mt-1"
                  placeholder="e.g. 30 days net"
                  value={form.creditTerms}
                  onChange={(e) => set("creditTerms", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="input-label">Message / Proposal notes <span className="text-red-500">*</span></label>
              <textarea
                className="input mt-1 min-h-[120px] resize-y"
                placeholder="Describe your offer, availability, scope, and any relevant details..."
                value={form.proposalText}
                onChange={(e) => set("proposalText", e.target.value)}
                required
              />
            </div>

            <div className="grid gap-3 sm:flex sm:items-center">
              <button type="submit" disabled={submitting} className="btn btn-primary w-full gap-2 sm:w-auto">
                <PaperPlaneTilt size={16} weight="bold" />
                {submitting ? "Submitting…" : myProposal ? "Update proposal" : "Submit proposal"}
              </button>
              {myProposal && (
                <button type="button" onClick={() => setShowForm(false)} className="btn w-full sm:w-auto">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
