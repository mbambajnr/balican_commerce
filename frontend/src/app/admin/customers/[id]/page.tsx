"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import StatusBadge from "@/components/admin/StatusBadge";
import EmptyState from "@/components/admin/EmptyState";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import {
  ArrowLeft, PencilSimple, Check, X, CreditCard,
  ShoppingBag, CurrencyCircleDollar, Wallet, Bank,
  Clock, User, Envelope, Phone, BuildingOffice,
  FileText,
} from "@phosphor-icons/react";

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [customer, setCustomer] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [creditLimit, setCreditLimit] = useState(0);
  const [isCreditApproved, setIsCreditApproved] = useState(false);
  const [paymentTermsDays, setPaymentTermsDays] = useState(30);
  const [savingCredit, setSavingCredit] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "", phone: "", companyName: "" });
  const [savingProfile, setSavingProfile] = useState(false);



  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [custRes, summRes] = await Promise.all([
        api.getCustomer(id),
        api.getCustomerFinancialSummary(id),
      ]);
      let timelineEvents: any[] = [];
      try {
        const tlRes = await api.getCustomerTimeline(id);
        timelineEvents = tlRes.events || [];
      } catch {}
      const c = custRes.customer;
      setCustomer(c);
      setSummary(summRes.summary);
      setTimeline(timelineEvents);
      setCreditLimit(Number(c.credit_limit) || 0);
      setIsCreditApproved(Boolean(c.is_credit_approved));
      setPaymentTermsDays(Number(c.payment_terms_days) || 30);
      setEditForm({
        firstName: c.first_name || "",
        lastName: c.last_name || "",
        email: c.email || "",
        phone: c.phone || "",
        companyName: c.company_name || "",
      });
    } catch (err: any) {
      setError(err.message || "Failed to load customer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSaveCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCredit(true);
    try {
      await api.updateCreditSettings(id, { creditLimit, isCreditApproved, paymentTermsDays });
      toast.success("Credit settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save credit settings");
    } finally {
      setSavingCredit(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.updateCustomer(id, editForm);
      setCustomer(res.customer);
      setEditing(false);
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    if (!customer) return;
    setEditForm({
      firstName: customer.first_name || "",
      lastName: customer.last_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      companyName: customer.company_name || "",
    });
    setEditing(false);
  };

  if (loading) return <PageSkeleton />;
  if (error || !customer) return <EmptyState icon="customers" title="Customer not found" />;

  const eventIcon = (type: string) => {
    switch (type) {
      case "order": return <ShoppingBag size={16} />;
      case "payment": return <CurrencyCircleDollar size={16} />;
      case "booking": return <Clock size={16} />;
      case "rfq": return <FileText size={16} />;
      case "quotation": return <FileText size={16} />;
      case "credit": return <CreditCard size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const eventColor = (type: string) => {
    switch (type) {
      case "order": return "bg-blue-500";
      case "payment": return "bg-green-500";
      case "booking": return "bg-purple-500";
      case "rfq": return "bg-yellow-500";
      case "quotation": return "bg-indigo-500";
      case "credit": return "bg-emerald-500";
      default: return "bg-gray-400";
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> Back to Customers
      </Link>

      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
              {customer.first_name} {customer.last_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              {customer.email && (
                <span className="flex items-center gap-1"><Envelope size={14} /> {customer.email}</span>
              )}
              {customer.phone && (
                <span className="flex items-center gap-1"><Phone size={14} /> {customer.phone}</span>
              )}
              {customer.company_name && (
                <span className="flex items-center gap-1"><BuildingOffice size={14} /> {customer.company_name}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusBadge status={customer.is_credit_approved ? "approved" : "inactive"} />
              <span className="text-xs text-muted">Credit: {customer.is_credit_approved ? "Approved" : "Not Approved"}</span>
              {customer.account_type && <StatusBadge status={customer.account_type} />}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="btn btn-sm btn-soft gap-1.5"
          >
            <PencilSimple size={14} weight="bold" />
            Edit
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <ShoppingBag size={18} />
              </div>
              <span className="text-xs font-medium text-muted uppercase tracking-wider">Total Orders</span>
            </div>
            <p className="font-display text-2xl font-semibold text-ink">{summary.totalOrders || 0}</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <CurrencyCircleDollar size={18} />
              </div>
              <span className="text-xs font-medium text-muted uppercase tracking-wider">Total Spent</span>
            </div>
            <p className="font-display text-2xl font-semibold text-ink">{formatCurrency(summary.totalSpent)}</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <Bank size={18} />
              </div>
              <span className="text-xs font-medium text-muted uppercase tracking-wider">Outstanding Balance</span>
            </div>
            <p className={`font-display text-2xl font-semibold ${Number(summary.outstandingBalance) > 0 ? "text-red-600" : "text-ink"}`}>
              {formatCurrency(summary.outstandingBalance)}
            </p>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <Wallet size={18} />
              </div>
              <span className="text-xs font-medium text-muted uppercase tracking-wider">Available Credit</span>
            </div>
            <p className="font-display text-2xl font-semibold text-ink">{formatCurrency(summary.availableCredit)}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Credit Settings Card */}
        <div className="card p-6 lg:col-span-1">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-muted" /> Credit Settings
          </h3>
          <form onSubmit={handleSaveCredit} className="space-y-4">
            <div>
              <label className="input-label">Credit Limit (GH₵)</label>
              <input
                type="number" min="0" step="1000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(Number(e.target.value))}
                className="input"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-muted">Credit Approved</label>
              <button
                type="button"
                onClick={() => setIsCreditApproved(!isCreditApproved)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isCreditApproved ? "bg-green-500" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isCreditApproved ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            <div>
              <label className="input-label">Payment Terms (Days)</label>
              <input
                type="number" min="0" max="365"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
                className="input"
              />
            </div>
            <button
              type="submit"
              disabled={savingCredit}
              className="btn btn-primary w-full"
            >
              {savingCredit ? "Saving..." : "Save Credit Settings"}
            </button>
          </form>
        </div>

        {/* Profile Details Card */}
        <div className="card p-6 lg:col-span-2">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
            <User size={18} className="text-muted" /> Profile Details
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="btn btn-sm btn-soft gap-1 ml-auto"
              >
                <PencilSimple size={14} /> Edit
              </button>
            )}
          </h3>

          {editing ? (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="input-label">First Name</label>
                  <input
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="input" required
                  />
                </div>
                <div>
                  <label className="input-label">Last Name</label>
                  <input
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="input" required
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="input" required
                />
              </div>
              <div>
                <label className="input-label">Phone</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="input-label">Company</label>
                <input
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  className="input"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={savingProfile} className="btn btn-primary gap-1.5">
                  <Check size={16} weight="bold" />
                  {savingProfile ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={handleCancelEdit} className="btn gap-1.5">
                  <X size={16} weight="bold" />
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider font-medium">First Name</p>
                <p className="text-sm text-ink mt-0.5">{customer.first_name || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider font-medium">Last Name</p>
                <p className="text-sm text-ink mt-0.5">{customer.last_name || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider font-medium">Email</p>
                <p className="text-sm text-ink mt-0.5">{customer.email || "\u2014"}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase tracking-wider font-medium">Phone</p>
                <p className="text-sm text-ink mt-0.5">{customer.phone || "\u2014"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted uppercase tracking-wider font-medium">Company</p>
                <p className="text-sm text-ink mt-0.5">{customer.company_name || "\u2014"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Timeline */}
      <div className="card p-6 mb-6">
        <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
          <Clock size={18} className="text-muted" /> Recent Activity
        </h3>
        {timeline.length === 0 ? (
          <EmptyState icon="customers" title="No activity yet" />
        ) : (
          <div className="space-y-0">
            {timeline.map((event: any, idx: number) => (
              <div key={event.id || idx} className="relative flex gap-4 pb-6 last:pb-0">
                {idx < timeline.length - 1 && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border" />
                )}
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${eventColor(event.event_type || event.type)}`}>
                  {eventIcon(event.event_type || event.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{event.description}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatDateTime(event.created_at || event.timestamp)}
                    {event.user_id && <span> &middot; by {event.performed_by || event.user_name || event.user_id}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="card p-6 mb-6">
        <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
          <ShoppingBag size={18} className="text-muted" /> Recent Orders
        </h3>
        {(!customer.recentOrders || customer.recentOrders.length === 0) ? (
          <EmptyState icon="orders" title="No orders yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted">Order #</th>
                  <th className="px-4 py-3 font-medium text-muted">Date</th>
                  <th className="px-4 py-3 font-medium text-muted">Total</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3 font-medium text-muted">Payment</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {customer.recentOrders.map((order: any) => (
                  <tr key={order.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium">{order.order_number || order.id}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(order.created_at)}</td>
                    <td className="px-4 py-3">{formatCurrency(order.total)}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={order.payment_status || "unpaid"} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/orders/${order.id}/payments`}
                        className="text-sm text-accent hover:underline"
                      >
                        View Payments
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Service Bookings Table */}
      <div className="card p-6 mb-6">
        <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
          <Clock size={18} className="text-muted" /> Recent Bookings
        </h3>
        {(!customer.recentBookings || customer.recentBookings.length === 0) ? (
          <EmptyState icon="bookings" title="No bookings yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted">Booking #</th>
                  <th className="px-4 py-3 font-medium text-muted">Date</th>
                  <th className="px-4 py-3 font-medium text-muted">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {customer.recentBookings.map((booking: any) => (
                  <tr key={booking.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium">{booking.booking_number || booking.id}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(booking.created_at)}</td>
                    <td className="px-4 py-3"><StatusBadge status={booking.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/bookings/${booking.id}`}
                        className="text-sm text-accent hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RFQs & Quotations */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* RFQs */}
        <div className="card p-6">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
            <FileText size={18} className="text-muted" /> Recent RFQs
          </h3>
          {(!customer.recentRfqs || customer.recentRfqs.length === 0) ? (
            <EmptyState icon="rfqs" title="No RFQs yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium text-muted">Product</th>
                    <th className="px-3 py-2 font-medium text-muted">Qty</th>
                    <th className="px-3 py-2 font-medium text-muted">Status</th>
                    <th className="px-3 py-2 font-medium text-muted">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recentRfqs.map((rfq: any) => (
                    <tr key={rfq.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-sm">{rfq.product_name || rfq.product?.name || "\u2014"}</td>
                      <td className="px-3 py-2 text-sm text-muted">{rfq.quantity}</td>
                      <td className="px-3 py-2"><StatusBadge status={rfq.status} /></td>
                      <td className="px-3 py-2 text-sm text-muted">{formatDate(rfq.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quotations */}
        <div className="card p-6">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2 mb-4">
            <FileText size={18} className="text-muted" /> Recent Quotations
          </h3>
          {(!customer.recentQuotations || customer.recentQuotations.length === 0) ? (
            <EmptyState icon="quotations" title="No quotations yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium text-muted">Number</th>
                    <th className="px-3 py-2 font-medium text-muted">Total</th>
                    <th className="px-3 py-2 font-medium text-muted">Status</th>
                    <th className="px-3 py-2 font-medium text-muted">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.recentQuotations.map((q: any) => (
                    <tr key={q.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-sm font-medium">{q.quotation_number || q.id}</td>
                      <td className="px-3 py-2 text-sm">{formatCurrency(q.total)}</td>
                      <td className="px-3 py-2"><StatusBadge status={q.status} /></td>
                      <td className="px-3 py-2 text-sm text-muted">{formatDate(q.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
