"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ArrowLeft, Package, CheckCircle, Truck, ClockCountdown,
  XCircle, ArrowRight, Warning, Cube, HourglassHigh,
} from "@phosphor-icons/react";

/* ─── Status definitions ─── */

const STATUS_ORDER = [
  "pending", "confirmed", "processing", "ready_or_shipped", "delivered", "completed",
] as const;

const STATUS_META: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode; description: string }> = {
  pending:          { label: "Pending",           color: "text-amber-700",   bgColor: "bg-amber-50",    icon: <ClockCountdown size={20} weight="fill" />, description: "Awaiting supplier confirmation" },
  confirmed:       { label: "Confirmed",         color: "text-blue-700",    bgColor: "bg-blue-50",     icon: <CheckCircle size={20} weight="fill" />,    description: "Supplier confirmed the order" },
  processing:      { label: "Processing",        color: "text-indigo-700",  bgColor: "bg-indigo-50",   icon: <HourglassHigh size={20} weight="fill" />,  description: "Supplier is preparing the order" },
  ready_or_shipped:{ label: "Ready / Shipped",   color: "text-purple-700",  bgColor: "bg-purple-50",   icon: <Truck size={20} weight="fill" />,          description: "Ready for pickup or shipped" },
  delivered:       { label: "Delivered",          color: "text-teal-700",    bgColor: "bg-teal-50",     icon: <Package size={20} weight="fill" />,        description: "Delivered to buyer" },
  completed:       { label: "Completed",         color: "text-emerald-700", bgColor: "bg-emerald-50",  icon: <CheckCircle size={20} weight="fill" />,    description: "Order completed successfully" },
  cancelled:       { label: "Cancelled",         color: "text-gray-500",    bgColor: "bg-gray-100",    icon: <XCircle size={20} weight="fill" />,        description: "Order was cancelled" },
  paid:            { label: "Paid",              color: "text-green-700",   bgColor: "bg-green-50",    icon: <CheckCircle size={20} weight="fill" />,    description: "Payment confirmed" },
};

function getStatusIndex(status: string) {
  const idx = STATUS_ORDER.indexOf(status as any);
  return idx >= 0 ? idx : -1;
}

export default function OrderLifecyclePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [order, setOrder] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelNote, setCancelNote] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/auth/login"); return; }
    loadData();
  }, [user, authLoading]);

  const loadData = async () => {
    setFetching(true);
    try {
      const [orderRes, historyRes] = await Promise.all([
        api.getOrder(id),
        api.getOrderHistory(id),
      ]);
      setOrder(orderRes.order);
      setHistory(historyRes.history);
    } catch {
      toast.error("Failed to load order");
    } finally {
      setFetching(false);
    }
  };

  const isProvider = (user as any)?.is_provider;
  const isBuyer = order?.user_id === (user as any)?.id;
  const isSupplier = isProvider && !isBuyer;

  // Determine available actions
  const getActions = () => {
    if (!order) return [];
    const status = order.status;
    const actions: { key: string; label: string; description: string; variant: string }[] = [];

    if (isSupplier || (user as any)?.role === "admin" || (user as any)?.role === "super_admin") {
      const nextStatus = (({ pending: "confirmed", confirmed: "processing", processing: "ready_or_shipped", ready_or_shipped: "delivered" }) as any)[status];
      if (nextStatus) {
        const nextMeta = STATUS_META[nextStatus];
        actions.push({
          key: "advance",
          label: `Mark as ${nextMeta?.label || nextStatus}`,
          description: nextMeta?.description || "",
          variant: "primary",
        });
      }
      if (["pending", "confirmed", "processing"].includes(status)) {
        actions.push({
          key: "cancel",
          label: "Cancel Order",
          description: "Cancel with a reason",
          variant: "danger",
        });
      }
    }

    if (isBuyer) {
      if (status === "delivered") {
        actions.push({
          key: "complete",
          label: "Confirm Received & Complete",
          description: "Mark as completed — confirms delivery was satisfactory",
          variant: "primary",
        });
      }
      if (status === "pending") {
        actions.push({
          key: "cancel",
          label: "Cancel Order",
          description: "Cancel before supplier confirms",
          variant: "danger",
        });
      }
    }

    return actions;
  };

  const handleAction = async (actionKey: string, note?: string) => {
    setActionLoading(true);
    try {
      const action = actionKey as "advance" | "complete" | "cancel";
      const res = await api.orderLifecycle(id, { action, note: note || undefined });
      toast.success(`Order moved to "${STATUS_META[res.transition.to]?.label || res.transition.to}"`);
      setShowCancelForm(false);
      setCancelNote("");
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update order");
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || fetching) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-surface" />
        <div className="h-48 animate-pulse rounded-xl bg-surface" />
        <div className="h-64 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Cube size={48} className="mx-auto text-muted" weight="light" />
        <p className="mt-4 text-sm text-muted">Order not found</p>
        <Link href="/account/orders" className="btn mt-6">View Orders</Link>
      </div>
    );
  }

  const meta = STATUS_META[order.status] || STATUS_META.pending;
  const currentIndex = getStatusIndex(order.status);
  const actions = getActions();
  const isFinal = order.status === "completed" || order.status === "cancelled";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/account/orders" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Orders
      </Link>

      {/* Order header */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {order.order_number}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Created {new Date(order.created_at).toLocaleDateString()} · GH₵{Number(order.total).toLocaleString()}
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${meta.bgColor} ${meta.color}`}>
          {meta.icon}
          {meta.label}
        </div>
      </div>

      {/* Progress tracker (non-cancelled) */}
      {order.status !== "cancelled" && (
        <div className="mt-8 rounded-xl border border-border bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">Fulfillment Progress</h2>
          <div className="flex items-center gap-1">
            {STATUS_ORDER.map((status, idx) => {
              const stepMeta = STATUS_META[status];
              const isActive = idx === currentIndex;
              const isPast = idx < currentIndex || order.status === "completed";
              return (
                <div key={status} className="flex flex-1 flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      isPast
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? `${stepMeta.bgColor} ${stepMeta.color} ring-2 ring-current`
                        : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isPast ? <CheckCircle size={16} weight="bold" /> : idx + 1}
                  </div>
                  <p className={`mt-1.5 text-center text-[10px] font-medium ${
                    isPast || isActive ? "text-ink" : "text-muted"
                  }`}>
                    {stepMeta.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {order.status === "cancelled" && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <XCircle size={20} weight="fill" />
          <div>
            <p className="font-medium">This order has been cancelled.</p>
            {history.filter(h => h.to_status === "cancelled")[0]?.note && (
              <p className="mt-0.5 text-xs text-red-600">
                Reason: {history.filter(h => h.to_status === "cancelled")[0].note}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isFinal && actions.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Available Actions</h2>
          <div className="space-y-3">
            {actions.filter(a => a.key !== "cancel").map((a) => (
              <button
                key={a.key}
                disabled={actionLoading}
                onClick={() => handleAction(a.key)}
                className="btn btn-primary w-full justify-between gap-2"
              >
                <span>{a.label}</span>
                <ArrowRight size={16} />
              </button>
            ))}

            {/* Cancel action */}
            {actions.some(a => a.key === "cancel") && !showCancelForm && (
              <button
                onClick={() => setShowCancelForm(true)}
                className="btn w-full justify-center border-red-200 text-red-600 hover:bg-red-50"
              >
                Cancel Order
              </button>
            )}

            {showCancelForm && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                <p className="text-sm font-medium text-red-700 mb-2">Cancel this order?</p>
                <textarea
                  className="input min-h-[60px] resize-y text-sm"
                  placeholder="Reason for cancellation (required)…"
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={actionLoading || !cancelNote.trim()}
                    onClick={() => handleAction("cancel", cancelNote)}
                    className="btn border-red-300 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {actionLoading ? "Cancelling…" : "Confirm Cancel"}
                  </button>
                  <button
                    onClick={() => { setShowCancelForm(false); setCancelNote(""); }}
                    className="btn"
                  >
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Order items summary */}
      <div className="mt-6 rounded-xl border border-border bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Order Items</h2>
        <div className="space-y-2">
          {(typeof order.items === "string" ? JSON.parse(order.items) : order.items || []).map((item: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-4 rounded-lg bg-surface px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink">{item.name || item.description}</p>
                <p className="text-xs text-muted">
                  Qty: {item.quantity}{item.unit ? ` ${item.unit}` : ""}
                  {item.supplierName ? ` · Supplier: ${item.supplierName}` : ""}
                </p>
              </div>
              <p className="font-medium text-ink whitespace-nowrap">
                GH₵{(Number(item.price) * Number(item.quantity)).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end border-t border-border pt-3">
          <p className="text-sm font-semibold text-ink">Total: GH₵{Number(order.total).toLocaleString()}</p>
        </div>
      </div>

      {/* Status History Timeline */}
      <div className="mt-6 rounded-xl border border-border bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-4">Status History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No status changes recorded yet.</p>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
            <div className="space-y-4">
              {history.map((h, idx) => {
                const toMeta = STATUS_META[h.to_status] || STATUS_META.pending;
                return (
                  <div key={h.id || idx} className="relative flex gap-3 pl-0">
                    <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${toMeta.bgColor}`}>
                      <div className={`h-2.5 w-2.5 rounded-full ${toMeta.color.replace("text-", "bg-")}`} />
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <p className="text-sm font-medium text-ink">{toMeta.label}</p>
                        <span className="text-[10px] text-muted">
                          {new Date(h.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {h.role === "buyer" ? "Buyer" : h.role === "supplier" ? "Supplier" : "Admin"}
                        {h.first_name ? ` (${h.first_name} ${h.last_name})` : ""}
                        {h.company_name ? ` · ${h.company_name}` : ""}
                      </p>
                      {h.note && (
                        <p className="mt-0.5 text-xs text-soft italic">"{h.note}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
