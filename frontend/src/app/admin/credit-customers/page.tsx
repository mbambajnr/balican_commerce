"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  Users, Eye, PencilSimple, X,
} from "@phosphor-icons/react";
import { CardSkeleton } from "@/components/admin/LoadingSkeleton";
import EmptyState from "@/components/admin/EmptyState";
import StatusBadge from "@/components/admin/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AdminCreditCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [creditData, setCreditData] = useState<any>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [edit, setEdit] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getCustomers();
      setCustomers(res.customers);
    } catch (err: any) {
      toast.error(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreditSummary = async (customerId: string) => {
    setSelected(customerId);
    setCreditLoading(true);
    setEdit(null);
    try {
      const res = await api.adminGetCreditSummary(customerId);
      setCreditData(res);
    } catch (err: any) {
      toast.error(err.message || "Failed to load credit summary");
      setSelected(null);
    } finally {
      setCreditLoading(false);
    }
  };

  const handleEdit = (c: any) => {
    setEdit({
      isCreditApproved: c.is_credit_approved || false,
      creditLimit: c.credit_limit || 0,
      paymentTermsDays: c.payment_terms_days || 30,
      companyName: c.company_name || "",
      taxId: c.tax_id || "",
    });
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !edit) return;
    try {
      await api.adminUpdateCreditSettings(selected, edit);
      toast.success("Credit settings updated");
      setEdit(null);
      openCreditSummary(selected);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 h-8 w-56 skeleton rounded-lg" />
        <CardSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Credit Customers</h1>
          <p className="mt-1 text-sm text-soft">{customers.length} customers</p>
        </div>
      </div>

      {customers.length === 0 ? (
        <EmptyState icon="customers" title="No customers found" />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c: any) => (
            <div key={c.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
                  <Users size={20} weight="duotone" />
                </div>
                <StatusBadge status={c.is_credit_approved ? "approved" : "inactive"} />
              </div>
              <h3 className="mt-4 font-display text-base font-semibold text-ink">
                {c.first_name} {c.last_name}
              </h3>
              <p className="text-sm text-muted">{c.company_name || "\u2014"}</p>
              <p className="text-sm text-muted">{c.email}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted">Limit</p>
                  <p className="font-semibold text-ink">{formatCurrency(c.credit_limit)}</p>
                </div>
                <div>
                  <p className="text-muted">Outstanding</p>
                  <p className="font-semibold text-warn">{formatCurrency(c.outstanding_balance)}</p>
                </div>
                <div>
                  <p className="text-muted">Available</p>
                  <p className="font-semibold text-emerald-600">
                    {formatCurrency(Math.max(0, (c.credit_limit || 0) - (c.outstanding_balance || 0)))}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => openCreditSummary(c.id)}
                  className="btn btn-sm btn-soft gap-1 flex-1"
                >
                  <Eye size={14} /> View Credit
                </button>
                <button
                  onClick={() => {
                    setSelected(c.id);
                    handleEdit(c);
                  }}
                  className="btn btn-sm gap-1"
                >
                  <PencilSimple size={14} /> Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8" onClick={() => { setSelected(null); setCreditData(null); setEdit(null); }}>
          <div className="card mx-4 w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">
                {creditData?.customer?.first_name} {creditData?.customer?.last_name}
              </h2>
              <button onClick={() => { setSelected(null); setCreditData(null); setEdit(null); }} className="text-muted hover:text-ink">
                <X size={20} />
              </button>
            </div>

            {creditLoading ? (
              <div className="mt-6 space-y-4">
                <div className="h-20 skeleton rounded-lg" />
                <div className="h-40 skeleton rounded-lg" />
              </div>
            ) : creditData && !edit ? (
              <>
                <div className="mt-6 rounded-lg border border-border bg-zinc-50 p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted">Company</p>
                      <p className="font-medium text-ink">{creditData.customer.company_name || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-muted">TIN (GRA)</p>
                      <p className="font-medium text-ink">{creditData.customer.tax_id || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-muted">Email</p>
                      <p className="font-medium text-ink">{creditData.customer.email}</p>
                    </div>
                    <div>
                      <p className="text-muted">Phone</p>
                      <p className="font-medium text-ink">{creditData.customer.phone || "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-muted">Credit Limit</p>
                      <p className="font-medium text-ink">{formatCurrency(creditData.customer.credit_limit)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Outstanding</p>
                      <p className="font-medium text-warn">{formatCurrency(creditData.customer.outstanding_balance)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Payment Terms</p>
                      <p className="font-medium text-ink">{creditData.customer.payment_terms_days || 30} days</p>
                    </div>
                    <div>
                      <p className="text-muted">Status</p>
                      <p className="font-medium"><StatusBadge status={creditData.customer.is_credit_approved ? "approved" : "inactive"} /></p>
                    </div>
                  </div>
                </div>

                {creditData.creditOrders && creditData.creditOrders.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-display text-sm font-semibold text-ink mb-3">Credit Orders</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                            <th className="px-4 py-3">Order #</th>
                            <th className="px-4 py-3">Total</th>
                            <th className="px-4 py-3">Paid</th>
                            <th className="px-4 py-3">Balance</th>
                            <th className="px-4 py-3">Due Date</th>
                            <th className="px-4 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditData.creditOrders.map((o: any) => (
                            <tr key={o.id} className="border-b border-border/50 hover:bg-zinc-50 transition-colors">
                              <td className="px-4 py-3 font-medium">{o.order_number}</td>
                              <td className="px-4 py-3">{formatCurrency(o.total)}</td>
                              <td className="px-4 py-3">{formatCurrency(o.amount_paid)}</td>
                              <td className="px-4 py-3 text-warn font-medium">{formatCurrency(o.balance_due)}</td>
                              <td className="px-4 py-3 text-muted">{o.due_date ? formatDate(o.due_date) : "\u2014"}</td>
                              <td className="px-4 py-3"><StatusBadge status={o.payment_status || o.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button onClick={() => handleEdit(creditData.customer)} className="btn btn-sm btn-primary gap-1 mt-6">
                  <PencilSimple size={14} /> Edit Credit Settings
                </button>
              </>
            ) : null}

            {edit && (
              <form onSubmit={saveSettings} className="mt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <label className="input-label mb-0">Credit Approved</label>
                  <button
                    type="button"
                    onClick={() => setEdit({ ...edit, isCreditApproved: !edit.isCreditApproved })}
                    className={`relative h-6 w-11 rounded-full transition-colors ${edit.isCreditApproved ? "bg-emerald-500" : "bg-zinc-300"}`}
                  >
                    <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${edit.isCreditApproved ? "translate-x-5" : ""}`} />
                  </button>
                </div>
                <div>
                  <label className="input-label">Credit Limit (GH₵)</label>
                  <input type="number" min="0" step="10000" value={edit.creditLimit}
                    onChange={(e) => setEdit({ ...edit, creditLimit: Number(e.target.value) })}
                    className="input" required />
                </div>
                <div>
                  <label className="input-label">Payment Terms (days)</label>
                  <input type="number" min="1" max="365" value={edit.paymentTermsDays}
                    onChange={(e) => setEdit({ ...edit, paymentTermsDays: Number(e.target.value) })}
                    className="input" required />
                </div>
                <div>
                  <label className="input-label">Company Name</label>
                  <input type="text" value={edit.companyName}
                    onChange={(e) => setEdit({ ...edit, companyName: e.target.value })}
                    className="input" />
                </div>
                <div>
                  <label className="input-label">TIN (GRA)</label>
                  <input type="text" value={edit.taxId}
                    onChange={(e) => setEdit({ ...edit, taxId: e.target.value })}
                    className="input" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn btn-primary flex-1">Save Settings</button>
                  <button type="button" onClick={() => setEdit(null)} className="btn flex-1">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
