"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { CurrencyNgn, Wrench, ShoppingBag, Stack } from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import DataTable from "@/components/admin/DataTable";
import type { Column } from "@/components/admin/DataTable";
import { formatCurrency, formatDate } from "@/lib/format";

type OrderTab = "all" | "sales" | "service" | "mixed";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [tab, setTab] = useState<OrderTab>("all");
  const [payModal, setPayModal] = useState<{ id: string; total: number; balance: number } | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "bank_transfer", reference: "", notes: "" });

  const load = () => {
    const params: Record<string, string> = {};
    if (tab !== "all") params.orderType = tab;
    api.getOrders(params).then((res) => setOrders(res.orders)).catch(() => {});
  };
  useEffect(() => { load(); }, [tab]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.updateOrderStatus(id, status);
      toast.success(`Order ${status}`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    try {
      await api.recordPayment(payModal.id, {
        amount: Number(payForm.amount),
        method: payForm.method,
        reference: payForm.reference || undefined,
        notes: payForm.notes || undefined,
      });
      toast.success("Payment recorded");
      setPayModal(null);
      setPayForm({ amount: "", method: "bank_transfer", reference: "", notes: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    }
  };

  const OrderTypeBadge = ({ type }: { type: string }) => {
    if (type === "service") return <span className="badge badge-purple flex items-center gap-1"><Wrench size={12} weight="bold" /> Service</span>;
    if (type === "mixed") return <span className="badge badge-amber flex items-center gap-1"><Stack size={12} weight="bold" /> Mixed</span>;
    return <span className="badge badge-green flex items-center gap-1"><ShoppingBag size={12} weight="bold" /> Sales</span>;
  };

  const columns: Column<any>[] = [
    {
      key: "order_number",
      label: "Order",
      render: (o) => <span className="font-medium">{o.order_number}</span>,
    },
    {
      key: "order_type",
      label: "Type",
      render: (o) => <OrderTypeBadge type={o.order_type || "sales"} />,
    },
    {
      key: "items",
      label: "Items",
      render: (o) => <span className="text-muted">{(o.items || []).length}</span>,
    },
    {
      key: "total",
      label: "Total",
      render: (o) => o.order_type === "service" ? <span className="text-muted">\u2014</span> : <span className="font-medium">{formatCurrency(o.total)}</span>,
    },
    {
      key: "order_source",
      label: "Source",
      render: (o) => <span className="text-xs text-muted capitalize">{o.order_source || "\u2014"}</span>,
    },
    {
      key: "payment_method",
      label: "Payment",
      render: (o) => o.order_type === "service" ? <span className="text-muted">\u2014</span> : (
        <span className={`badge ${o.payment_method === "credit" ? "badge-blue" : "badge-green"}`}>
          {o.payment_method || "paystack"}
        </span>
      ),
    },
    {
      key: "service_status",
      label: "Service Status",
      render: (o) => o.order_type === "service" ? <StatusBadge status={o.service_status || "requested"} /> : null,
    },
    {
      key: "status",
      label: "Status",
      render: (o) => <StatusBadge status={o.status} />,
    },
    {
      key: "created_at",
      label: "Date",
      render: (o) => <span className="text-muted whitespace-nowrap">{formatDate(o.created_at)}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (o) => (
        <div className="flex gap-1 flex-wrap">
          {o.order_type === "service" ? (
            <>
              {o.service_status === "requested" && (
                <button onClick={() => api.post(`/orders/${o.id}/status`, { serviceStatus: "scheduled" }).then(load).catch(() => {})} className="btn btn-sm btn-primary">Schedule</button>
              )}
              {o.service_status === "scheduled" && (
                <button onClick={() => api.post(`/orders/${o.id}/status`, { serviceStatus: "in_progress" }).then(load).catch(() => {})} className="btn btn-sm btn-primary">Start</button>
              )}
              {o.service_status === "in_progress" && (
                <button onClick={() => api.post(`/orders/${o.id}/status`, { serviceStatus: "completed" }).then(load).catch(() => {})} className="btn btn-sm btn-primary">Complete</button>
              )}
              {(o.service_status && !["completed", "cancelled"].includes(o.service_status)) && (
                <button onClick={() => api.post(`/orders/${o.id}/status`, { serviceStatus: "cancelled" }).then(load).catch(() => {})} className="btn btn-sm btn-danger">Cancel</button>
              )}
            </>
          ) : (
            <>
              {o.status === "pending" && (
                <>
                  <button onClick={() => updateStatus(o.id, "processing")} className="btn btn-sm">Process</button>
                  <button onClick={() => updateStatus(o.id, "cancelled")} className="btn btn-sm btn-danger">Cancel</button>
                </>
              )}
              {o.status === "processing" && (
                <button onClick={() => updateStatus(o.id, "completed")} className="btn btn-sm btn-primary">Complete</button>
              )}
              {o.payment_method === "credit" && Number(o.balance_due) > 0 && (
                <button
                  onClick={() => setPayModal({ id: o.id, total: Number(o.total), balance: Number(o.balance_due) })}
                  className="btn btn-sm btn-soft gap-1"
                >
                  <CurrencyNgn size={14} weight="bold" />
                  Record Payment
                </button>
              )}
              {o.status !== "cancelled" && o.status !== "completed" && o.status !== "pending" && (
                <button onClick={() => updateStatus(o.id, "cancelled")} className="btn btn-sm btn-danger">Cancel</button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const tabs: { key: OrderTab; label: string; icon: any }[] = [
    { key: "all", label: "All Orders", icon: null },
    { key: "sales", label: "Sales Orders", icon: ShoppingBag },
    { key: "service", label: "Service Orders", icon: Wrench },
    { key: "mixed", label: "Mixed Orders", icon: Stack },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Orders</h1>

      <div className="mt-6 flex gap-1 border-b border-border pb-px">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                active ? "bg-white text-ink border-x border-t border-border -mb-px" : "text-muted hover:text-ink"
              }`}
            >
              {Icon && <Icon size={14} weight="bold" />}
              {t.label}
            </button>
          );
        })}
      </div>

      <DataTable columns={columns} data={orders} emptyIcon="orders" emptyTitle="No orders" />

      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPayModal(null)}>
          <div className="card mx-4 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Record Payment</h2>
            <p className="mt-1 text-sm text-soft">Balance due: {formatCurrency(payModal.balance)}</p>
            <form onSubmit={recordPayment} className="mt-6 space-y-4">
              <div>
                <label className="input-label">Amount (GH₵)</label>
                <input type="number" step="0.01" max={payModal.balance} value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  className="input" required />
              </div>
              <div>
                <label className="input-label">Method</label>
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} className="input">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="paystack">Paystack</option>
                  <option value="mobile_money">Mobile Money</option>
                </select>
              </div>
              <div>
                <label className="input-label">Reference (optional)</label>
                <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="input" />
              </div>
              <div>
                <label className="input-label">Notes (optional)</label>
                <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="input" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn btn-primary flex-1">Record Payment</button>
                <button type="button" onClick={() => setPayModal(null)} className="btn flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
