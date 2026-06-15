"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  Building, CreditCard, Coins, Bank, ShoppingBag,
  Cube, FileText, ArrowRight,
} from "@phosphor-icons/react";

export default function AccountBillingPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await api.customerGetBilling();
      setData(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load billing info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

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
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="mb-8 h-8 w-40 skeleton rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 h-64 skeleton rounded-xl" />
          <div className="lg:col-span-2 h-64 skeleton rounded-xl" />
        </div>
        <div className="mt-6 h-48 skeleton rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Cube size={48} className="mx-auto text-muted" weight="light" />
        <p className="mt-4 text-soft">Please login to view billing</p>
        <Link href="/auth/login" className="btn mt-4">Login</Link>
      </div>
    );
  }

  const billing = data?.billing || {};
  const credit = data?.credit || {};
  const orders = data?.orders || [];
  const bankTransfers = data?.bankTransfers || [];

  const available = Math.max(0, Number(credit.credit_limit || 0) - Number(credit.outstanding_balance || 0));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Billing</h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building size={20} className="text-muted" weight="duotone" />
              <h2 className="font-display text-base font-semibold text-ink">Billing Information</h2>
            </div>
            {billing ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted">Company</p>
                  <p className="font-medium text-ink">{billing.company_name || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-muted">Tax ID</p>
                  <p className="font-medium text-ink">{billing.tax_id || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-muted">Contact Name</p>
                  <p className="font-medium text-ink">{billing.first_name ? `${billing.first_name} ${billing.last_name}` : billing.contact_name || user.first_name ? `${user.first_name} ${user.last_name}` : "\u2014"}</p>
                </div>
                <div>
                  <p className="text-muted">Email</p>
                  <p className="font-medium text-ink">{billing.email || user.email}</p>
                </div>
                <div>
                  <p className="text-muted">Phone</p>
                  <p className="font-medium text-ink">{billing.phone || user.phone || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-muted">Address</p>
                  <p className="font-medium text-ink">{billing.address || "\u2014"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-soft">No billing information available.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={20} className="text-muted" weight="duotone" />
              <h2 className="font-display text-base font-semibold text-ink">Credit Summary</h2>
            </div>
            {credit ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Credit Approved</span>
                  <span className={`badge ${credit.is_credit_approved ? "badge-green" : "badge-gray"}`}>
                    {credit.is_credit_approved ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Credit Limit</span>
                  <span className="font-semibold text-ink">GH₵{Number(credit.credit_limit || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Outstanding</span>
                  <span className="font-semibold text-warn">GH₵{Number(credit.outstanding_balance || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Available Credit</span>
                  <span className="font-semibold text-emerald-600">GH₵{available.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted">Payment Terms</span>
                  <span className="font-semibold text-ink">{credit.payment_terms_days || 30} days</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-soft">No credit account yet.</p>
            )}
          </div>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-muted" weight="duotone" />
              <h2 className="font-display text-base font-semibold text-ink">Orders</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-3">Order #</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Paid</th>
                  <th className="px-6 py-3">Outstanding</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Due Date</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 font-medium">{o.order_number}</td>
                    <td className="px-6 py-3">GH₵{Number(o.total).toLocaleString()}</td>
                    <td className="px-6 py-3">GH₵{Number(o.amount_paid || 0).toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <span className={`font-medium ${Number(o.balance_due || 0) > 0 ? "text-warn" : "text-emerald-600"}`}>
                        GH₵{Number(o.balance_due || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-3"><span className="badge badge-blue">{o.payment_method || "\u2014"}</span></td>
                    <td className="px-6 py-3"><span className={`badge ${statusBadge(o.payment_status || o.status)}`}>{o.payment_status || o.status}</span></td>
                    <td className="px-6 py-3 text-muted">{o.due_date ? new Date(o.due_date).toLocaleDateString() : "\u2014"}</td>
                    <td className="px-6 py-3">
                      <Link href={`/account/orders/${o.id}/payment`} className="btn btn-sm btn-soft gap-1">
                        Pay <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bankTransfers.length > 0 && (
        <div className="card mt-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <Bank size={18} className="text-muted" weight="duotone" />
            <h2 className="font-display text-base font-semibold text-ink">Bank Transfers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {bankTransfers.map((bt: any, idx: number) => (
                  <tr key={bt.id || idx} className="border-b border-border/50 hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3 font-medium">{bt.transfer_reference || bt.reference || "\u2014"}</td>
                    <td className="px-6 py-3">GH₵{Number(bt.amount).toLocaleString()}</td>
                    <td className="px-6 py-3"><span className={`badge ${statusBadge(bt.status)}`}>{bt.status}</span></td>
                    <td className="px-6 py-3 text-muted">{new Date(bt.created_at || bt.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {orders.length === 0 && bankTransfers.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Cube size={48} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No billing activity yet</p>
        </div>
      )}
    </div>
  );
}
