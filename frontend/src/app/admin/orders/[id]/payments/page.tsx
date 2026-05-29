"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ShoppingBag, Bank, CreditCard, ArrowLeft,
  FileText, Plus,
} from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import DataTable from "@/components/admin/DataTable";
import type { Column } from "@/components/admin/DataTable";
import { CardSkeleton, TableSkeleton } from "@/components/admin/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AdminOrderPaymentsPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", method: "bank_transfer", reference: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getOrder(params.id as string);
      setOrder(res.order);
    } catch (err: any) {
      toast.error(err.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [params.id]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSubmitting(true);
    try {
      await api.adminRecordPayment(order.id, {
        amount: Number(form.amount),
        method: form.method,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Payment recorded");
      setShowForm(false);
      setForm({ amount: "", method: "bank_transfer", reference: "", notes: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <CardSkeleton count={1} />
        <div className="mt-6"><TableSkeleton rows={4} cols={5} /></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <p className="text-soft">Order not found</p>
      </div>
    );
  }

  const outstanding = Number(order.balance_due || order.total) - Number(order.amount_paid || 0);
  const payments = order.payments || [];
  const bankTransfers = order.bank_transfers || [];

  const paymentColumns: Column<any>[] = [
    {
      key: "created_at",
      label: "Date",
      render: (p) => <span className="text-muted">{formatDate(p.created_at || p.createdAt || p.date)}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      render: (p) => <span className="font-medium">{formatCurrency(p.amount)}</span>,
    },
    {
      key: "method",
      label: "Method",
      render: (p) => <span className="badge badge-blue">{p.method || p.payment_method}</span>,
    },
    {
      key: "reference",
      label: "Reference",
      render: (p) => <span className="text-muted">{p.reference || p.transaction_reference || "\u2014"}</span>,
    },
    {
      key: "recorded_by",
      label: "Recorded By",
      render: (p) => <span className="text-muted">{p.recorded_by || p.admin_name || "\u2014"}</span>,
    },
  ];

  const bankTransferColumns: Column<any>[] = [
    {
      key: "created_at",
      label: "Date",
      render: (bt) => <span className="text-muted">{formatDate(bt.created_at || bt.createdAt)}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      render: (bt) => <span className="font-medium">{formatCurrency(bt.amount)}</span>,
    },
    {
      key: "bank_name",
      label: "Bank",
      render: (bt) => <span>{bt.bank_name || "\u2014"}</span>,
    },
    {
      key: "reference",
      label: "Reference",
      render: (bt) => <span className="text-muted">{bt.transfer_reference || bt.reference || "\u2014"}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (bt) => <StatusBadge status={bt.status} />,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <ShoppingBag size={24} weight="duotone" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold text-ink">{order.order_number}</h1>
              <p className="text-sm text-muted">
                {order.first_name ? `${order.first_name} ${order.last_name}` : order.user?.first_name ? `${order.user.first_name} ${order.user.last_name}` : "\u2014"}
              </p>
            </div>
          </div>
          <StatusBadge status={order.payment_status || order.status} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Total</p>
            <p className="text-lg font-bold text-ink">{formatCurrency(order.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Amount Paid</p>
            <p className="text-lg font-bold text-emerald-600">{formatCurrency(order.amount_paid || 0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Outstanding</p>
            <p className="text-lg font-bold text-warn">{formatCurrency(Math.max(0, outstanding))}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Payment Method</p>
            <p className="text-sm font-medium text-ink capitalize">{order.payment_method || "\u2014"}</p>
          </div>
        </div>
      </div>

      {/* Attribution */}
      {(order.utm_source || order.order_source) && (
        <div className="card mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag size={16} className="text-muted" weight="duotone" />
            <h2 className="font-display text-sm font-semibold text-ink uppercase tracking-wider">Marketing Source</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            {order.utm_source && <div><span className="text-muted">Source:</span> {order.utm_source}</div>}
            {order.utm_campaign && <div><span className="text-muted">Campaign:</span> {order.utm_campaign}</div>}
            {order.utm_medium && <div><span className="text-muted">Medium:</span> {order.utm_medium}</div>}
            {order.order_source && <div><span className="text-muted">Order Source:</span> <span className="badge badge-blue capitalize">{order.order_source}</span></div>}
          </div>
        </div>
      )}

      {order.invoice && (
        <div className="card mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={18} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Invoice</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-muted">Invoice #</p>
              <p className="font-medium text-ink">{order.invoice.invoice_number || "\u2014"}</p>
            </div>
            <div>
              <p className="text-muted">Status</p>
              <StatusBadge status={order.invoice.status || "pending"} />
            </div>
            <div>
              <p className="text-muted">Issued</p>
              <p className="font-medium text-ink">{order.invoice.issued_date ? formatDate(order.invoice.issued_date) : "\u2014"}</p>
            </div>
            <div>
              <p className="text-muted">Due</p>
              <p className="font-medium text-ink">{order.invoice.due_date ? formatDate(order.invoice.due_date) : "\u2014"}</p>
            </div>
          </div>
          {(order.invoice.status === "issued" || order.invoice.status === "sent" || order.invoice.status === "overdue") && (
            <div className="mt-4 pt-4 border-t border-light">
              <button
                onClick={async () => {
                  try {
                    await api.adminSendInvoice(order.invoice.id);
                    toast.success("Invoice resent successfully");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to send invoice");
                  }
                }}
                className="btn btn-primary btn-sm gap-1.5"
              >
                <FileText size={14} /> Resend Invoice
              </button>
            </div>
          )}
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Payment History</h2>
          </div>
          <DataTable columns={paymentColumns} data={payments} />
        </div>
      )}

      {bankTransfers.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Bank size={18} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Bank Transfers</h2>
          </div>
          <DataTable columns={bankTransferColumns} data={bankTransfers} />
        </div>
      )}

      {outstanding > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary gap-1.5"
          >
            <Plus size={16} weight="bold" /> Record Payment
          </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="card mx-4 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Record Payment</h2>
            <p className="mt-1 text-sm text-soft">Outstanding: {formatCurrency(Math.max(0, outstanding))}</p>
            <form onSubmit={handleRecordPayment} className="mt-6 space-y-4">
              <div>
                <label className="input-label">Amount (GH₵)</label>
                <input type="number" step="0.01" min="0" max={Math.max(0, outstanding)}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input" required />
              </div>
              <div>
                <label className="input-label">Method</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input">
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="paystack">Paystack</option>
                  <option value="credit_note">Credit Note</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="input-label">Reference (optional)</label>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input" />
              </div>
              <div>
                <label className="input-label">Notes (optional)</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="textarea" rows={2} />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={submitting} className="btn btn-primary flex-1 disabled:opacity-50">
                  {submitting ? "Recording..." : "Record Payment"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
