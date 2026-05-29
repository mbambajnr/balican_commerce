"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Wrench, ArrowLeft, CalendarCheck, MapPin, Phone, User, FileText, Package, Note } from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import EmptyState from "@/components/admin/EmptyState";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import { formatDate, formatDateTime } from "@/lib/format";

export default function AdminBookingDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [noteInput, setNoteInput] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const load = () => {
    api.getAdminBooking(id as string).then((res) => setBooking(res.booking)).catch(() => router.push("/admin/bookings")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    let reason: string | undefined;
    if (status === "cancelled") {
      reason = prompt("Cancellation reason:") || undefined;
    }
    try {
      await api.updateBookingStatus(id as string, { status, cancellationReason: reason });
      toast.success(`Booking ${status}`);
      load();
    } catch (err: any) { toast.error(err.message || "Failed to update"); }
  };

  const handleReschedule = async () => {
    const date = prompt("New date (YYYY-MM-DD):");
    if (!date) return;
    try {
      await api.rescheduleBooking(id as string, { preferredDate: date });
      toast.success("Booking rescheduled");
      load();
    } catch (err: any) { toast.error(err.message || "Failed to reschedule"); }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    setAddingNote(true);
    try {
      await api.addBookingNotes(id as string, { adminNotes: noteInput });
      toast.success("Note added");
      setNoteInput("");
      load();
    } catch (err: any) { toast.error(err.message || "Failed to add note"); }
    finally { setAddingNote(false); }
  };

  if (loading) return <PageSkeleton />;
  if (!booking) return <EmptyState icon="bookings" title="Booking not found" />;

  const canTransition = (from: string, to: string) => {
    const allowed: Record<string, string[]> = {
      requested: ["confirmed", "cancelled"],
      confirmed: ["rescheduled", "in_progress", "cancelled"],
      rescheduled: ["confirmed", "in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    return allowed[from]?.includes(to);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/admin/bookings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-6">
        <ArrowLeft size={14} /> Back to Bookings
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Booking Detail</h1>
          <p className="mt-1 text-sm text-soft">{booking.order_number || "Order"} — {booking.customer_name || "Customer"}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={booking.status} />
          <Link href={`/admin/orders/${booking.order_id}/payments`} className="btn btn-sm btn-secondary gap-1">
            <Package size={14} /> Order
          </Link>
        </div>
      </div>

      {/* Status Controls */}
      <div className="card p-4 mb-6 flex flex-wrap gap-2 items-center">
        <span className="text-sm font-medium text-muted mr-2">Actions:</span>
        {canTransition(booking.status, "confirmed") && (
          <button onClick={() => updateStatus("confirmed")} className="btn btn-sm btn-primary">Confirm</button>
        )}
        {canTransition(booking.status, "in_progress") && (
          <button onClick={() => updateStatus("in_progress")} className="btn btn-sm btn-primary">Start Service</button>
        )}
        {canTransition(booking.status, "completed") && (
          <button onClick={() => updateStatus("completed")} className="btn btn-sm btn-primary">Mark Completed</button>
        )}
        {canTransition(booking.status, "rescheduled") && (
          <button onClick={handleReschedule} className="btn btn-sm btn-secondary">Reschedule</button>
        )}
        {canTransition(booking.status, "cancelled") && (
          <button onClick={() => updateStatus("cancelled")} className="btn btn-sm btn-danger">Cancel Booking</button>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Schedule */}
        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <CalendarCheck size={18} className="text-muted" /> Schedule
          </h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted">Preferred Date:</span> {formatDate(booking.preferred_date)}</p>
            {booking.preferred_time_slot && <p><span className="text-muted">Time:</span> {booking.preferred_time_slot}</p>}
            {booking.confirmed_date && <p><span className="text-muted">Confirmed Date:</span> {formatDate(booking.confirmed_date)}</p>}
            {booking.confirmed_time_slot && <p><span className="text-muted">Confirmed Time:</span> {booking.confirmed_time_slot}</p>}
            {booking.completed_at && <p><span className="text-muted">Completed:</span> {formatDateTime(booking.completed_at)}</p>}
            {booking.cancelled_at && <p><span className="text-muted">Cancelled:</span> {formatDateTime(booking.cancelled_at)}</p>}
          </div>
        </div>

        {/* Customer */}
        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <User size={18} className="text-muted" /> Customer
          </h3>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{booking.customer_name}</p>
            <p className="flex items-center gap-2"><Phone size={14} className="text-muted" /> {booking.customer_phone || "\u2014"}</p>
            <p className="flex items-center gap-2"><FileText size={14} className="text-muted" /> {booking.customer_email}</p>
          </div>
        </div>

        {/* Location */}
        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <MapPin size={18} className="text-muted" /> Location & Contact
          </h3>
          <div className="space-y-2 text-sm">
            <p>{booking.location}</p>
            {booking.contact_name && <p className="flex items-center gap-2 mt-2"><User size={14} className="text-muted" /> {booking.contact_name}</p>}
            {booking.contact_phone && <p className="flex items-center gap-2"><Phone size={14} className="text-muted" /> {booking.contact_phone}</p>}
          </div>
        </div>

        {/* Service Info */}
        <div className="card p-6 space-y-4">
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <Wrench size={18} className="text-muted" /> Service Info
          </h3>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted">Type:</span> {booking.service_type || "installation"}</p>
            <p><span className="text-muted">Order:</span> {booking.order_number || "\u2014"}</p>
            <p><span className="text-muted">Created:</span> {formatDateTime(booking.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Customer Notes */}
      {booking.notes && (
        <div className="card mt-6 p-6">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Customer Notes</h3>
          <p className="text-sm text-muted whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}

      {/* Cancellation Reason */}
      {booking.cancellation_reason && (
        <div className="card mt-6 p-6 bg-red-50/50">
          <h3 className="font-display text-base font-semibold text-ink mb-2">Cancellation Reason</h3>
          <p className="text-sm text-muted">{booking.cancellation_reason}</p>
        </div>
      )}

      {/* Admin Notes */}
      <div className="card mt-6 p-6 bg-blue-50/50">
        <h3 className="font-display text-base font-semibold text-ink mb-4 flex items-center gap-2">
          <Note size={18} className="text-muted" /> Admin Notes
        </h3>
        {booking.admin_notes ? (
          <p className="text-sm text-muted whitespace-pre-wrap mb-4">{booking.admin_notes}</p>
        ) : (
          <p className="text-sm text-soft mb-4">No admin notes yet</p>
        )}
        <form onSubmit={handleAddNote} className="flex gap-2">
          <input
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add a note..."
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={addingNote || !noteInput.trim()}>
            {addingNote ? "Adding..." : "Add Note"}
          </button>
        </form>
      </div>
    </div>
  );
}
