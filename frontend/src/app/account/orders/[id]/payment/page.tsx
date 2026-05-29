"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ShoppingBag, CurrencyNgn, Bank, CreditCard, ArrowLeft,
  FileText, Cube, ArrowSquareOut, CheckCircle,
} from "@phosphor-icons/react";

export default function AccountOrderPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [btForm, setBtForm] = useState({ amount: "", bankName: "", accountName: "", transferReference: "" });
  const [submittingBt, setSubmittingBt] = useState(false);
  const [paystackLoading, setPaystackLoading] = useState(false);

  const load = async () => {
    if (!user) return;
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
    if (user) load();
  }, [user, params.id]);

  const handleBankTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setSubmittingBt(true);
    try {
      await api.customerSubmitBankTransfer(order.id, {
        amount: Number(btForm.amount),
        bankName: btForm.bankName || undefined,
        accountName: btForm.accountName || undefined,
        transferReference: btForm.transferReference,
      });
      toast.success("Bank transfer submitted for verification");
      setBtForm({ amount: "", bankName: "", accountName: "", transferReference: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit transfer");
    } finally {
      setSubmittingBt(false);
    }
  };

  const handlePaystack = async () => {
    if (!order || !user) return;
    setPaystackLoading(true);
    try {
      const res = await api.initPaystack(order.id, user.email);
      window.location.href = res.authorizationUrl;
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize payment");
    } finally {
      setPaystackLoading(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      paid: "badge-green", completed: "badge-green",
      processing: "badge-blue", pending: "badge-yellow",
      cancelled: "badge-red", overdue: "badge-red",
      pending_verification: "badge-yellow",
      successful: "badge-green", rejected: "badge-red",
    };
    return map[s] || "badge-gray";
  };

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6 h-6 w-32 skeleton rounded-lg" />
        <div className="mb-6 h-44 skeleton rounded-xl" />
        <div className="h-52 skeleton rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Cube size={48} className="mx-auto text-muted" weight="light" />
        <p className="mt-4 text-soft">Please login to view payment details</p>
        <button onClick={() => router.push("/auth/login")} className="btn mt-4">Login</button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Cube size={48} className="mx-auto text-muted" weight="light" />
        <p className="mt-4 text-soft">Order not found</p>
        <button onClick={() => router.push("/account/orders")} className="btn mt-4">Back to Orders</button>
      </div>
    );
  }

  const outstanding = Math.max(0, Number(order.balance_due || order.total) - Number(order.amount_paid || 0));
  const payments = order.payments || [];
  const isFullyPaid = outstanding <= 0;
  const showBankTransfer = order.payment_method === "bank_transfer" && !isFullyPaid;
  const showPaystack = order.payment_method === "paystack" && !isFullyPaid;
  const isCreditOrder = order.payment_method === "credit";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ShoppingBag size={24} weight="duotone" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">{order.order_number}</h1>
            <p className="text-sm text-muted">
              {(order.items || []).length} item(s) &middot; <span className={`badge ${statusBadge(order.payment_status || order.status)}`}>{order.payment_status || order.status}</span>
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted">Total</p>
            <p className="text-lg font-bold text-ink">GH₵{Number(order.total).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Paid</p>
            <p className="text-lg font-bold text-emerald-600">GH₵{Number(order.amount_paid || 0).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Outstanding</p>
            <p className="text-lg font-bold text-warn">GH₵{outstanding.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Method</p>
            <p className="text-sm font-medium text-ink capitalize">{order.payment_method || "\u2014"}</p>
          </div>
        </div>
      </div>

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
              <span className={`badge ${statusBadge(order.invoice.status || "pending")}`}>{order.invoice.status || "pending"}</span>
            </div>
            <div>
              <p className="text-muted">Due Date</p>
              <p className="font-medium text-ink">{order.invoice.due_date ? new Date(order.invoice.due_date).toLocaleDateString() : "\u2014"}</p>
            </div>
            <div>
              <p className="text-muted">Terms</p>
              <p className="font-medium text-ink">{order.payment_terms || "\u2014"}</p>
            </div>
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <CreditCard size={18} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Payment History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any, idx: number) => (
                  <tr key={p.id || idx} className="border-b border-border/50 hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 text-muted">{new Date(p.created_at || p.createdAt || p.date).toLocaleDateString()}</td>
                    <td className="px-6 py-3 font-medium">GH₵{Number(p.amount).toLocaleString()}</td>
                    <td className="px-6 py-3"><span className="badge badge-blue">{p.method || p.payment_method}</span></td>
                    <td className="px-6 py-3 text-muted">{p.reference || p.transaction_reference || "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isCreditOrder && (
        <div className="card mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-blue-500" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Credit Order</h2>
          </div>
          <p className="mt-2 text-sm text-muted">
            This order is on credit with payment terms of {order.payment_terms_days || order.payment_terms || "30"} days.
            Outstanding balance: GH₵{outstanding.toLocaleString()}.
          </p>
        </div>
      )}

      {showBankTransfer && (
        <div className="card mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bank size={20} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Submit Bank Transfer</h2>
          </div>
          <p className="text-sm text-muted mb-4">
            Make a transfer to our bank account and submit the details below for verification.
          </p>
          <form onSubmit={handleBankTransfer} className="space-y-4">
            <div>
              <label className="input-label">Amount (GH₵)</label>
              <input type="number" step="0.01" min="0" max={outstanding}
                value={btForm.amount}
                onChange={(e) => setBtForm({ ...btForm, amount: e.target.value })}
                className="input" required />
            </div>
            <div>
              <label className="input-label">Bank Name</label>
              <input type="text" value={btForm.bankName}
                onChange={(e) => setBtForm({ ...btForm, bankName: e.target.value })}
                className="input" placeholder="e.g. GTBank" />
            </div>
            <div>
              <label className="input-label">Account Name</label>
              <input type="text" value={btForm.accountName}
                onChange={(e) => setBtForm({ ...btForm, accountName: e.target.value })}
                className="input" placeholder="Name on account" />
            </div>
            <div>
              <label className="input-label">Transfer Reference</label>
              <input type="text" value={btForm.transferReference}
                onChange={(e) => setBtForm({ ...btForm, transferReference: e.target.value })}
                className="input" placeholder="Bank transfer reference" required />
            </div>
            <button type="submit" disabled={submittingBt} className="btn btn-primary gap-1.5 disabled:opacity-50">
              {submittingBt ? "Submitting..." : "Submit Transfer Details"}
            </button>
          </form>
        </div>
      )}

      {showPaystack && (
        <div className="card mt-6 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CurrencyNgn size={20} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Pay Online</h2>
          </div>
          <p className="text-sm text-muted mb-4">
            Pay the outstanding balance of GH₵{outstanding.toLocaleString()} securely via Paystack.
          </p>
          <button
            onClick={handlePaystack}
            disabled={paystackLoading}
            className="btn btn-primary gap-1.5 disabled:opacity-50"
          >
            {paystackLoading ? "Redirecting..." : "Pay with Paystack"}
            <ArrowSquareOut size={16} weight="bold" />
          </button>
        </div>
      )}

      {!showBankTransfer && !showPaystack && !isCreditOrder && isFullyPaid && (
        <div className="card mt-6 p-5 sm:p-6 bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle size={20} className="text-emerald-600" weight="fill" />
            <h2 className="font-display text-base font-semibold text-emerald-700">Paid in Full</h2>
          </div>
          <p className="mt-1 text-sm text-emerald-600">This order has been fully paid.</p>
        </div>
      )}
    </div>
  );
}
