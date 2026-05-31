"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, Check, X, CurrencyCircleDollar, FileText, Warning, ShieldCheck, Prohibit, CaretRight } from "@phosphor-icons/react";
import Link from "next/link";

const statusLabels: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", in_review: "In Review",
  accepted: "Accepted", cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-600",
  in_review: "bg-amber-50 text-amber-600",
  accepted: "bg-green-50 text-green-600",
  cancelled: "bg-red-50 text-red-600",
};

const providerStatusColors: Record<string, string> = {
  invited: "bg-gray-100 text-gray-500",
  viewed: "bg-blue-50 text-blue-600",
  interested: "bg-green-50 text-green-600",
  declined: "bg-red-50 text-red-600",
  quoted: "bg-amber-50 text-amber-600",
  selected: "bg-emerald-50 text-emerald-600",
};

export default function ProcurementRequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingProvider, setAcceptingProvider] = useState<string | null>(null);
  const [creditWarning, setCreditWarning] = useState<string | null>(null);
  const [creditRejected, setCreditRejected] = useState<string | null>(null);
  const [acceptedSuccess, setAcceptedSuccess] = useState<string | null>(null);
  const [convertingOrder, setConvertingOrder] = useState(false);
  const [orderConversionResult, setOrderConversionResult] = useState<{ orderNumber?: string; orderId?: string } | null>(null);

  const convertToOrder = async () => {
    setConvertingOrder(true);
    setOrderConversionResult(null);
    try {
      const res = await api.convertProcurementToOrder(requestId);
      setOrderConversionResult({ orderNumber: res.order.order_number, orderId: res.order.id });
      toast.success("Order created successfully");
      load();
    } catch (err: any) {
      if (err?.status === 409) {
        const orderNumber = err?.details?.order_number;
        if (orderNumber) {
          setOrderConversionResult({ orderNumber });
          toast("This request was already converted to an order.", { icon: "📋" });
        } else {
          toast.error("This request was already converted to an order.");
        }
      } else {
        toast.error(err?.message || "Failed to convert to order");
      }
    }
    finally { setConvertingOrder(false); }
  };

  const selectedProvider = request?.providers?.find((p: any) => p.status === "selected") || null;

  const load = () => {
    setAcceptedSuccess(null);
    setCreditWarning(null);
    setCreditRejected(null);
    api.getProcurementRequest(requestId)
      .then(r => setRequest(r.request))
      .catch(() => toast.error("Failed to load request"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [requestId]);

  const submitRequest = async () => {
    setSubmitting(true);
    try {
      await api.updateProcurementRequestStatus(requestId, "submitted");
      toast.success("Request submitted");
      load();
    } catch { toast.error("Failed to submit"); }
    finally { setSubmitting(false); }
  };

  const cancelRequest = async () => {
    setSubmitting(true);
    try {
      await api.updateProcurementRequestStatus(requestId, "cancelled");
      toast.success("Request cancelled");
      load();
    } catch { toast.error("Failed to cancel"); }
    finally { setSubmitting(false); }
  };

  const acceptProvider = async (providerCompanyId: string, adminOverride = false) => {
    setAcceptingProvider(providerCompanyId);
    setCreditWarning(null);
    setCreditRejected(null);
    try {
      const res = await api.acceptProviderQuote(requestId, providerCompanyId, adminOverride);
      if (res.supplierCreditWarning) {
        setAcceptedSuccess(`${res.supplierCreditWarning} Quote accepted.`);
      } else {
        toast.success("Provider selected successfully");
      }
      load();
    } catch (err: any) {
      if (err?.code === 409) {
        setCreditWarning(providerCompanyId);
      } else if (err?.code === 400 && typeof err?.message === "string" && err.message.toLowerCase().includes("rejected")) {
        setCreditRejected(providerCompanyId);
        toast.error(err.message);
      } else if (err?.code === 400) {
        toast.error(err.message || "Cannot accept this provider at this time");
      } else {
        toast.error("Failed to accept provider");
      }
    }
    finally { setAcceptingProvider(null); }
  };

  if (loading) {
    return <div className="h-60 animate-pulse rounded-xl bg-gray-100" />;
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Request not found</p>
        <Link href="/procurement/requests" className="text-accent hover:underline mt-2 block">Back to requests</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/procurement/requests" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-ink">{request.title}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[request.status] || ""}`}>
              {statusLabels[request.status] || request.status}
            </span>
            {request.is_urgent && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">Urgent</span>}
          </div>
          <p className="mt-1 text-sm text-muted capitalize">{request.request_type?.replace(/_/g, " ")}</p>
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
            <h2 className="text-lg font-semibold text-ink mb-4">Items ({request.items?.length || 0})</h2>
            <div className="space-y-3">
              {(request.items || []).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {item.product_name || item.service_description || "Item"}
                    </p>
                    {item.product_sku && <p className="text-xs text-muted">SKU: {item.product_sku}</p>}
                    {item.notes && <p className="text-xs text-muted mt-1">{item.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink">{item.quantity}</p>
                    <p className="text-xs text-muted">{item.unit || "pcs"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink mb-4">Provider Responses</h2>

            {/* Selected provider banner */}
            {request.status === "accepted" && selectedProvider && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Provider Selected</p>
                    <p className="mt-1 text-sm text-emerald-700">
                      <span className="font-medium">{selectedProvider.company_name}</span> was selected
                      {selectedProvider.quote_amount && <> with a quote of GH₵{parseFloat(selectedProvider.quote_amount).toLocaleString()}</>}.
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600">
                      All other quoted providers have been automatically declined.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(request.providers || []).length === 0 ? (
              <p className="text-sm text-muted">No providers invited yet.</p>
            ) : (
              <div className="space-y-3">
                {(request.providers || []).map((p: any) => {
                  const isSelected = p.status === "selected";
                  return (
                  <div key={p.id} className={`rounded-lg border px-4 py-3 ${
                    isSelected ? "border-emerald-200 bg-emerald-50/30" : "border-border/50 bg-white"
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSelected && <CaretRight size={14} className="text-emerald-600" />}
                        <div>
                          <p className={`text-sm font-medium ${isSelected ? "text-emerald-800" : "text-ink"}`}>
                            {p.company_name || "Unknown Provider"}
                            {isSelected && <span className="ml-2 text-xs text-emerald-600 font-semibold">(Selected)</span>}
                          </p>
                          {p.response_notes && <p className="text-xs text-muted mt-1">{p.response_notes}</p>}
                          {p.quote_amount && (
                            <p className="text-xs font-medium text-accent mt-1">Quote: GH₵{parseFloat(p.quote_amount).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${providerStatusColors[p.status] || ""}`}>
                          {p.status}
                        </span>
                        {p.responded_at && <p className="text-xs text-muted">{new Date(p.responded_at).toLocaleDateString()}</p>}
                      </div>
                    </div>

                    {/* Accept Quote button (in_review + quoted) */}
                    {request.status === "in_review" && p.status === "quoted" && (
                      <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
                        <button onClick={() => acceptProvider(p.provider_company_id)}
                          disabled={acceptingProvider === p.provider_company_id}
                          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors">
                          <ShieldCheck size={14} />
                          {acceptingProvider === p.provider_company_id ? "Accepting..." : "Accept Quote"}
                        </button>
                        {acceptedSuccess && <span className="text-xs text-green-600">{acceptedSuccess}</span>}
                      </div>
                    )}

                    {/* Credit warning dialog (pending/unrated override) */}
                    {creditWarning === p.provider_company_id && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-start gap-2">
                          <Warning size={18} className="mt-0.5 shrink-0 text-amber-600" />
                          <div className="text-xs text-amber-800">
                            <p className="font-medium">Supplier credit not assessed</p>
                            <p className="mt-1">This supplier has not been credit-vetted. Proceed only if you accept the risk.</p>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => acceptProvider(p.provider_company_id, true)}
                                disabled={acceptingProvider === p.provider_company_id}
                                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                                Proceed with Override
                              </button>
                              <button onClick={() => setCreditWarning(null)}
                                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Credit rejected block (inline red alert) */}
                    {creditRejected === p.provider_company_id && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                        <div className="flex items-start gap-2">
                          <Prohibit size={18} className="mt-0.5 shrink-0 text-red-600" />
                          <div className="text-xs text-red-800">
                            <p className="font-medium">Supplier credit rejected</p>
                            <p className="mt-1">This supplier's credit has been rejected by admin. They cannot be selected for procurement requests.</p>
                            <button onClick={() => setCreditRejected(null)}
                              className="mt-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-ink">Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted">Created</p>
                <p className="text-ink">{new Date(request.created_at).toLocaleDateString()}</p>
              </div>
              {request.delivery_location && (
                <div>
                  <p className="text-xs text-muted">Delivery Location</p>
                  <p className="text-ink">{request.delivery_location}</p>
                </div>
              )}
              {request.preferred_timeline && (
                <div>
                  <p className="text-xs text-muted">Timeline</p>
                  <p className="text-ink">{request.preferred_timeline}</p>
                </div>
              )}
              {request.estimated_budget && (
                <div>
                  <p className="text-xs text-muted">Budget</p>
                  <p className="text-lg font-bold text-ink">GH₵{parseFloat(request.estimated_budget).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {request.status === "accepted" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6 space-y-3">
              <h2 className="text-lg font-semibold text-emerald-800 flex items-center gap-2">
                <ShieldCheck size={20} /> Request Accepted
              </h2>
              {selectedProvider && (
                <div className="text-sm text-emerald-700 space-y-1">
                  <p><span className="font-medium">Selected:</span> {selectedProvider.company_name}</p>
                  {selectedProvider.quote_amount && (
                    <p><span className="font-medium">Quote:</span> GH₵{parseFloat(selectedProvider.quote_amount).toLocaleString()}</p>
                  )}
                </div>
              )}
              <button onClick={cancelRequest} disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                <X size={18} /> Cancel Request
              </button>

              <div className="border-t border-emerald-200 pt-3">
                <button onClick={convertToOrder} disabled={convertingOrder}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors">
                  <FileText size={18} />
                  {convertingOrder ? "Converting..." : "Convert to Order"}
                </button>

                {orderConversionResult && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-center">
                    <p className="text-xs text-emerald-700 font-medium">Order Created</p>
                    <p className="text-sm font-bold text-emerald-900 mt-0.5">{orderConversionResult.orderNumber}</p>
                    {orderConversionResult.orderId ? (
                      <Link href={`/orders/${orderConversionResult.orderId}/confirm`}
                        className="mt-2 inline-block text-xs text-accent hover:underline">
                        View Order Details &rarr;
                      </Link>
                    ) : (
                      <p className="mt-1 text-xs text-muted">This request was previously converted.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {(request.status === "draft" || request.status === "submitted" || request.status === "in_review") && (
            <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-3">
              <h2 className="text-lg font-semibold text-ink">Actions</h2>
              {request.status === "draft" && (
                <button onClick={submitRequest} disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors">
                  <Check size={18} /> Submit Request
                </button>
              )}
              <button onClick={cancelRequest} disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                <X size={18} /> Cancel Request
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
