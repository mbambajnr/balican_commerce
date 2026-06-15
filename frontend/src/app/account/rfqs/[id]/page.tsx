"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ArrowLeft, Coins, CheckCircle, XCircle, Eye,
  FileText, Cube, Clock
} from "@phosphor-icons/react";

export default function CustomerRfqDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();

  const [rfq, setRfq] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const rfqRes = await api.getRfq(id);
      setRfq(rfqRes.rfq);
      const quoRes = await api.customerGetQuotations();
      const myQuotations = quoRes.quotations.filter((q: any) => q.rfq_id === id);
      setQuotations(myQuotations);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const handleView = async (qId: string) => {
    try {
      await api.customerViewQuotation(qId);
      toast.success("Marked as viewed");
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleAccept = async (qId: string) => {
    if (!confirm("Accept this quotation? This will confirm your order.")) return;
    setActionLoading(true);
    try {
      await api.customerAcceptQuotation(qId);
      toast.success("Quotation accepted!");
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
    finally { setActionLoading(false); }
  };

  const handleReject = async (qId: string) => {
    setActionLoading(true);
    try {
      await api.customerRejectQuotation(qId, rejectReason || undefined);
      toast.success("Quotation rejected");
      setShowRejectForm(false);
      setRejectReason("");
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
    finally { setActionLoading(false); }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "badge-gray", sent: "badge-blue", viewed: "badge-blue",
      accepted: "badge-green", rejected: "badge-red", expired: "badge-yellow",
      converted_to_order: "badge-green", cancelled: "badge-red",
    };
    return map[s] || "badge-gray";
  };

  const rfqStatusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "badge-yellow", under_review: "badge-blue", quote_sent: "badge-blue",
      quoted: "badge-blue", accepted: "badge-green", rejected: "badge-red",
    };
    return map[s] || "badge-gray";
  };

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-10"><div className="h-96 skeleton" /></div>;
  if (!rfq) return <div className="mx-auto max-w-4xl px-4 py-10 text-center text-soft">RFQ not found</div>;

  const activeQuotation = quotations.find((q) => ["sent", "viewed"].includes(q.status));
  const historyQuotations = quotations.filter((q) => !["sent", "viewed"].includes(q.status));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <button onClick={() => router.push("/account/rfqs")} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back to RFQs
      </button>

      {/* RFQ Details */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">RFQ Details</h1>
          </div>
          <span className={`badge ${rfqStatusBadge(rfq.status)}`}>{rfq.status}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Product</p>
            <p className="mt-1 text-sm font-medium">{rfq.product_name || "\u2014"}</p>
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Quantity</p>
            <p className="mt-1 text-sm">{rfq.quantity}</p>
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Date</p>
            <p className="mt-1 text-sm">{new Date(rfq.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        {rfq.delivery_requirements && (
          <div className="mt-4">
            <p className="text-xs text-muted uppercase tracking-wider">Your Requirements</p>
            <p className="mt-1 text-sm text-soft">{rfq.delivery_requirements}</p>
          </div>
        )}
        {rfq.admin_notes && (
          <div className="mt-4 rounded-lg bg-blue-50 p-4">
            <p className="text-xs font-medium text-blue-700 uppercase tracking-wider">Seller Notes</p>
            <p className="mt-1 text-sm text-blue-800">{rfq.admin_notes}</p>
          </div>
        )}
      </div>

      {/* Active Quotation - Response Card */}
      {activeQuotation && (
        <div className="card mt-6 border-2 border-accent/20">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">Quotation Response</h2>
              <p className="text-xs text-muted">{activeQuotation.quotation_number}</p>
            </div>
            <span className={`badge ${statusBadge(activeQuotation.status)}`}>{activeQuotation.status}</span>
          </div>

          {activeQuotation.status === "sent" && (
            <div className="px-6 pt-4 pb-0">
              <button onClick={() => handleView(activeQuotation.id)} className="btn btn-sm gap-1">
                <Eye size={14} /> Mark as Viewed
              </button>
            </div>
          )}

          {/* Line Items */}
          <div className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted uppercase tracking-wider border-b border-border">
                  <th className="pb-2 pr-2">Item</th>
                  <th className="pb-2 px-2 text-right">Qty</th>
                  <th className="pb-2 px-2 text-right">Unit Price</th>
                  <th className="pb-2 pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {activeQuotation.items?.map((item: any) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-2">{item.description}</td>
                    <td className="py-2.5 px-2 text-right">{Number(item.quantity)}</td>
                    <td className="py-2.5 px-2 text-right">GH₵{Number(item.unit_price).toLocaleString()}</td>
                    <td className="py-2.5 pl-2 text-right font-medium">GH₵{Number(item.line_total).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>GH₵{Number(activeQuotation.subtotal).toLocaleString()}</span></div>
              {Number(activeQuotation.discount_amount) > 0 && (
                <div className="flex justify-between"><span className="text-muted">Discount</span><span className="text-red-500">-GH₵{Number(activeQuotation.discount_amount).toLocaleString()}</span></div>
              )}
              {Number(activeQuotation.tax_amount) > 0 && (
                <div className="flex justify-between"><span className="text-muted">Tax</span><span>+GH₵{Number(activeQuotation.tax_amount).toLocaleString()}</span></div>
              )}
              {Number(activeQuotation.service_fee) > 0 && (
                <div className="flex justify-between"><span className="text-muted">Service Fee</span><span>+GH₵{Number(activeQuotation.service_fee).toLocaleString()}</span></div>
              )}
              {Number(activeQuotation.delivery_fee) > 0 && (
                <div className="flex justify-between"><span className="text-muted">Delivery</span><span>+GH₵{Number(activeQuotation.delivery_fee).toLocaleString()}</span></div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1 border-t border-border">
                <span>Total</span>
                <span>GH₵{Number(activeQuotation.total_amount).toLocaleString()}</span>
              </div>
            </div>

            {/* Valid Until */}
            {activeQuotation.valid_until && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted">
                <Clock size={16} />
                Valid until {new Date(activeQuotation.valid_until).toLocaleDateString()}
              </div>
            )}

            {/* Terms */}
            {activeQuotation.terms && (
              <div className="mt-4 p-4 bg-zinc-50 rounded-lg">
                <p className="text-xs font-semibold text-ink uppercase tracking-wider">Terms</p>
                <p className="mt-1 text-sm text-soft whitespace-pre-wrap">{activeQuotation.terms}</p>
              </div>
            )}

            {activeQuotation.notes_to_customer && (
              <div className="mt-3 p-4 bg-zinc-50 rounded-lg">
                <p className="text-xs font-semibold text-ink uppercase tracking-wider">Notes</p>
                <p className="mt-1 text-sm text-soft">{activeQuotation.notes_to_customer}</p>
              </div>
            )}

            {/* Accept / Reject Actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => handleAccept(activeQuotation.id)}
                disabled={actionLoading}
                className="btn btn-primary gap-2"
              >
                <CheckCircle size={18} weight="bold" />
                {actionLoading ? "Processing..." : "Accept Quotation"}
              </button>
              <button
                onClick={() => setShowRejectForm(!showRejectForm)}
                className="btn gap-2"
              >
                <XCircle size={18} />
                Reject
              </button>
            </div>

            {showRejectForm && (
              <div className="mt-4 p-4 border border-red-200 rounded-lg space-y-3">
                <p className="text-sm font-medium text-red-700">Reason for rejection (optional)</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="input text-sm"
                  rows={2}
                  placeholder="Let us know why you're declining..."
                />
                <div className="flex gap-2">
                  <button onClick={() => handleReject(activeQuotation.id)} disabled={actionLoading} className="btn btn-danger btn-sm">
                    {actionLoading ? "Processing..." : "Confirm Rejection"}
                  </button>
                  <button onClick={() => { setShowRejectForm(false); setRejectReason(""); }} className="btn btn-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No quotation yet */}
      {quotations.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <FileText size={48} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No quotation received yet</p>
          <p className="text-xs text-muted">Your RFQ is being reviewed. We&apos;ll send a quotation soon.</p>
        </div>
      )}

      {/* Quotation History */}
      {historyQuotations.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-base font-semibold text-ink mb-4">Quotation History</h3>
          <div className="space-y-3">
            {historyQuotations.map((q: any) => (
              <div key={q.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{q.quotation_number}</p>
                    <p className="text-xs text-muted">Rev {q.revision_number} &middot; {new Date(q.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`badge ${statusBadge(q.status)}`}>{q.status}</span>
                </div>
                {q.rejection_reason && (
                  <p className="mt-2 text-xs text-red-600">Reason: {q.rejection_reason}</p>
                )}
                <div className="mt-2 text-sm">
                  <span className="text-muted">Total:</span> GH₵{Number(q.total_amount).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events timeline on latest quotation */}
      {activeQuotation?.events && activeQuotation.events.length > 0 && (
        <div className="mt-6 card p-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Timeline</p>
          <div className="space-y-2">
            {activeQuotation.events.map((ev: any) => (
              <div key={ev.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-zinc-300 mt-1.5 shrink-0" />
                <div>
                  <p className="text-soft">{ev.description}</p>
                  <p className="text-xs text-muted">{new Date(ev.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
