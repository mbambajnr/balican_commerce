"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, Check, X, CurrencyCircleDollar, Eye } from "@phosphor-icons/react";
import Link from "next/link";

const statusLabels: Record<string, string> = {
  invited: "New", viewed: "Viewed", interested: "Interested",
  declined: "Declined", quoted: "Quoted", selected: "Selected",
};

const statusColors: Record<string, string> = {
  invited: "bg-blue-50 text-blue-600",
  viewed: "bg-gray-100 text-gray-600",
  interested: "bg-green-50 text-green-600",
  declined: "bg-red-50 text-red-600",
  quoted: "bg-amber-50 text-amber-600",
  selected: "bg-emerald-50 text-emerald-600",
};

export default function ProviderProcurementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;
  const [request, setRequest] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [otherProviders, setOtherProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [respondMode, setRespondMode] = useState<string | null>(null);
  const [responseNotes, setResponseNotes] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");

  const load = () => {
    Promise.all([
      api.getProviderProcurementRequest(requestId),
      api.markProviderProcurementRequestViewed(requestId).catch(() => {}),
    ]).then(([res]) => {
      setRequest(res.request);
      setItems(res.items || []);
      setOtherProviders(res.otherProviders || []);
    }).catch(() => toast.error("Failed to load request"))
    .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [requestId]);

  const handleRespond = async (action: string) => {
    if (action === "interested" || action === "declined") {
      setActionLoading(true);
      try {
        await api.respondToProviderProcurementRequest(requestId, { response: action, notes: responseNotes || undefined });
        toast.success(action === "interested" ? "Interest registered" : "Request declined");
        setRespondMode(null);
        setResponseNotes("");
        load();
      } catch (e: any) { toast.error(e.message || "Failed to respond"); }
      finally { setActionLoading(false); }
    } else if (action === "quote") {
      if (!quoteAmount) return toast.error("Enter a quote amount");
      setActionLoading(true);
      try {
        await api.respondToProviderProcurementRequest(requestId, {
          response: "quote", notes: responseNotes || undefined,
          quoteAmount: parseFloat(quoteAmount),
        });
        toast.success("Quote submitted");
        setRespondMode(null);
        setResponseNotes("");
        setQuoteAmount("");
        load();
      } catch (e: any) { toast.error(e.message || "Failed to submit quote"); }
      finally { setActionLoading(false); }
    }
  };

  if (loading) {
    return <div className="h-60 animate-pulse rounded-xl bg-gray-100" />;
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Request not found</p>
        <Link href="/provider/procurement" className="text-accent hover:underline mt-2 block">Back</Link>
      </div>
    );
  }

  const canRespond = ["invited", "viewed", "interested"].includes(request.response_status);
  const hasResponded = ["declined", "quoted", "selected"].includes(request.response_status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/provider/procurement" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-ink">{request.title}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[request.response_status] || ""}`}>
              {statusLabels[request.response_status] || request.response_status}
            </span>
            {request.is_urgent && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">Urgent</span>}
          </div>
          <p className="mt-1 text-sm text-muted">
            From: {request.company_name || "Unknown Buyer"}
            {request.estimated_budget && <span className="ml-3">Budget: GH₵{parseFloat(request.estimated_budget).toLocaleString()}</span>}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {request.description && (
            <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink mb-3">Description</h2>
              <p className="text-sm text-muted whitespace-pre-wrap">{request.description}</p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink mb-4">Requested Items ({items.length})</h2>
            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-muted">No items listed.</p>
              ) : (
                items.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink">{item.product_name || item.service_description || "Item"}</p>
                      {item.product_sku && <p className="text-xs text-muted">SKU: {item.product_sku}</p>}
                      {item.notes && <p className="text-xs text-muted mt-1">{item.notes}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-ink">{item.quantity}</p>
                      <p className="text-xs text-muted">{item.unit || "pcs"}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {otherProviders.length > 0 && (
            <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink mb-4">Other Invited Providers</h2>
              <div className="space-y-2">
                {otherProviders.filter((p: any) => p.provider_company_id !== request.provider_company_id).map((p: any) => (
                  <div key={p.provider_company_id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-2">
                    <span className="text-sm text-ink">{p.company_name || "Unknown"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status] || ""}`}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-ink">Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted">Received</p>
                <p className="text-ink">{new Date(request.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Buyer</p>
                <p className="text-ink">{request.company_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Type</p>
                <p className="text-ink capitalize">{request.request_type?.replace(/_/g, " ")}</p>
              </div>
              {request.delivery_location && (
                <div><p className="text-xs text-muted">Delivery</p><p className="text-ink">{request.delivery_location}</p></div>
              )}
              {request.preferred_timeline && (
                <div><p className="text-xs text-muted">Timeline</p><p className="text-ink">{request.preferred_timeline}</p></div>
              )}
              {request.estimated_budget && (
                <div><p className="text-xs text-muted">Budget</p><p className="text-lg font-bold text-ink">GH₵{parseFloat(request.estimated_budget).toLocaleString()}</p></div>
              )}
            </div>
          </div>

          {canRespond && !respondMode && !hasResponded && (
            <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-3">
              <h2 className="text-lg font-semibold text-ink">Respond</h2>
              <button onClick={() => setRespondMode("interested")}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors">
                <Check size={18} /> I&apos;m Interested
              </button>
              <button onClick={() => setRespondMode("quote")}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold transition-colors">
                <CurrencyCircleDollar size={18} /> Submit Quote
              </button>
              <button onClick={() => setRespondMode("declined")}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                <X size={18} /> Decline
              </button>
            </div>
          )}

          {respondMode && (
            <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-4">
              <h2 className="text-lg font-semibold text-ink">
                {respondMode === "interested" ? "Confirm Interest" :
                 respondMode === "quote" ? "Submit Quote" : "Confirm Decline"}
              </h2>
              {respondMode === "quote" && (
                <div>
                  <label className="block text-sm font-medium text-ink">Quote Amount (GH₵) *</label>
                  <input type="number" min="0" step="0.01" value={quoteAmount}
                    onChange={e => setQuoteAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink">Notes</label>
                <textarea value={responseNotes}
                  onChange={e => setResponseNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  placeholder="Any comments for the buyer..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleRespond(respondMode)} disabled={actionLoading}
                  className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors">
                  {actionLoading ? "Sending..." : "Confirm"}
                </button>
                <button onClick={() => setRespondMode(null)} disabled={actionLoading}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surface transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {hasResponded && request.response_notes && (
            <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink mb-2">Your Response</h2>
              <p className="text-sm text-muted">{request.response_notes}</p>
              {request.quote_amount && (
                <p className="text-sm font-semibold text-accent mt-2">Quote: GH₵{parseFloat(request.quote_amount).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
