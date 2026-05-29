"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { CalendarCheck, ArrowLeft } from "@phosphor-icons/react";

type EligibleOrder = { id: string; order_number: string; total: number; eligible: boolean; reason?: string };

function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<EligibleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    orderId: searchParams.get("order") || "",
    preferredDate: "",
    preferredTime: "",
    location: "",
    contactPhone: "",
    contactName: "",
    serviceType: "installation",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setForm((f) => ({ ...f, contactPhone: user.phone || "", contactName: `${user.first_name} ${user.last_name}` }));
    api.getOrders().then(async (res) => {
      const eligible = await Promise.all(
        res.orders
          .filter((o: any) => o.payment_status === "paid" || o.payment_method === "credit" || o.status === "paid")
          .map(async (o: any) => {
            try {
              const check = await api.checkEligibility(o.id);
              return { ...o, eligible: check.eligible, reason: check.reason };
            } catch { return { ...o, eligible: false, reason: "Error checking" }; }
          })
      );
      setOrders(eligible);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.orderId) { toast.error("Please select an order"); return; }
    if (!form.preferredDate) { toast.error("Please select a date"); return; }
    if (!form.location) { toast.error("Please enter a location"); return; }
    if (!form.contactName) { toast.error("Please enter contact name"); return; }
    if (!form.contactPhone) { toast.error("Please enter contact phone"); return; }
    setSubmitting(true);
    try {
      await api.createBooking(form);
      toast.success("Service booking submitted");
      router.push("/account/bookings");
    } catch (err: any) {
      toast.error(err.message || "Failed to create booking");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) return null;
  if (!user) return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-soft">Please login to book a service</p>
      <Link href="/auth/login" className="btn mt-4">Login</Link>
    </div>
  );

  const eligibleOrders = orders.filter((o) => o.eligible);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-4">
          <ArrowLeft size={14} /> Back to Account
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Book Installation Service</h1>
        <p className="mt-1 text-sm text-soft">Schedule your service appointment for an eligible order</p>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="h-12 skeleton" /><div className="h-12 skeleton" /><div className="h-24 skeleton" /></div>
      ) : eligibleOrders.length === 0 ? (
        <div className="card p-8 text-center space-y-4">
          <CalendarCheck size={48} className="mx-auto text-muted" weight="light" />
          <p className="text-soft">No eligible orders found. Only paid orders or approved credit orders can book a service.</p>
          <Link href="/account/orders" className="btn btn-primary">View Orders</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card p-8 space-y-6">
          <div>
            <label className="input-label">Order</label>
            <select value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })} className="input" required>
              <option value="">Select an eligible order</option>
              {eligibleOrders.map((o) => (
                <option key={o.id} value={o.id}>{o.order_number} — GH₵{Number(o.total).toLocaleString()}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Preferred Date</label>
              <input type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="input-label">Preferred Time</label>
              <select value={form.preferredTime} onChange={(e) => setForm({ ...form, preferredTime: e.target.value })} className="input">
                <option value="">Flexible</option>
                <option value="morning">Morning (8am–12pm)</option>
                <option value="afternoon">Afternoon (12pm–4pm)</option>
                <option value="evening">Evening (4pm–7pm)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Service Type</label>
            <select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} className="input">
              <option value="installation">Installation</option>
              <option value="maintenance">Maintenance</option>
              <option value="repair">Repair</option>
              <option value="consultation">Consultation</option>
            </select>
          </div>
          <div>
            <label className="input-label">Installation Location</label>
            <textarea rows={2} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" placeholder="Full address" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Contact Name</label>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="input-label">Contact Phone</label>
              <input type="tel" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className="input" required />
            </div>
          </div>
          <div>
            <label className="input-label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" placeholder="Special instructions" />
          </div>
          <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
            <CalendarCheck size={18} weight="bold" />
            {submitting ? "Submitting..." : "Book Service"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function BookingPageClient() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10"><div className="h-96 skeleton" /></div>}>
      <BookingForm />
    </Suspense>
  );
}
