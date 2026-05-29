"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Wrench, ArrowLeft, CalendarCheck, MapPin, Phone, User, FileText } from "@phosphor-icons/react";

export default function CustomerBookingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.getBooking(id as string).then((res) => setBooking(res.booking)).catch(() => router.push("/account/bookings")).finally(() => setLoading(false));
  }, [user, id]);

  if (authLoading || loading) return null;
  if (!user) return <div className="mx-auto max-w-lg px-4 py-20 text-center"><p className="text-soft">Please login</p></div>;
  if (!booking) return null;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      requested: "badge-yellow", confirmed: "badge-blue", rescheduled: "badge-purple",
      in_progress: "badge-blue", completed: "badge-green", cancelled: "badge-red",
    };
    return map[s] || "badge-gray";
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/account/bookings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> Back to Bookings
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Service Booking</h1>
          <p className="mt-1 text-sm text-soft">{booking.order_number || "Order"}</p>
        </div>
        <span className={`badge ${statusBadge(booking.status)} text-sm`}>{booking.status}</span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <CalendarCheck size={18} className="text-muted" /> Schedule
          </h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted">Preferred Date:</span> {new Date(booking.preferred_date).toLocaleDateString()}</p>
            {booking.preferred_time_slot && <p><span className="text-muted">Time:</span> {booking.preferred_time_slot}</p>}
            {booking.confirmed_date && <p><span className="text-muted">Confirmed Date:</span> {new Date(booking.confirmed_date).toLocaleDateString()}</p>}
            {booking.confirmed_time_slot && <p><span className="text-muted">Confirmed Time:</span> {booking.confirmed_time_slot}</p>}
            {booking.completed_at && <p><span className="text-muted">Completed:</span> {new Date(booking.completed_at).toLocaleString()}</p>}
            {booking.cancelled_at && <p><span className="text-muted">Cancelled:</span> {new Date(booking.cancelled_at).toLocaleString()}</p>}
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <MapPin size={18} className="text-muted" /> Location
          </h3>
          <p className="text-sm">{booking.location}</p>
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <User size={18} className="text-muted" /> Contact
          </h3>
          <div className="space-y-2 text-sm">
            {booking.contact_name && <p className="flex items-center gap-2"><User size={14} className="text-muted" /> {booking.contact_name}</p>}
            {booking.contact_phone && <p className="flex items-center gap-2"><Phone size={14} className="text-muted" /> {booking.contact_phone}</p>}
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <FileText size={18} className="text-muted" /> Order Info
          </h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted">Order:</span> {booking.order_number || "\u2014"}</p>
            <p><span className="text-muted">Service Type:</span> {booking.service_type || "installation"}</p>
          </div>
        </div>
      </div>

      {booking.notes && (
        <div className="card mt-6 p-6">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Your Notes</h3>
          <p className="text-sm text-muted whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {booking.admin_notes && (
        <div className="card mt-6 p-6 bg-blue-50/50">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Admin Notes</h3>
          <p className="text-sm text-muted whitespace-pre-wrap">{booking.admin_notes}</p>
        </div>
      )}

      {booking.cancellation_reason && (
        <div className="card mt-6 p-6 bg-red-50/50">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Cancellation Reason</h3>
          <p className="text-sm text-muted">{booking.cancellation_reason}</p>
        </div>
      )}
    </div>
  );
}
