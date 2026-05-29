"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/LoadingSkeleton";
import { formatDate } from "@/lib/format";

const STATUS_TABS = ["all", "requested", "confirmed", "rescheduled", "in_progress", "completed", "cancelled"];

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [rescheduleModal, setRescheduleModal] = useState<any>(null);

  const load = () => {
    setLoading(true);
    const params: any = {};
    if (activeTab !== "all") params.status = activeTab;
    if (search) params.search = search;
    api.getAdminBookings(params).then((res) => setBookings(res.bookings)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeTab]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const updateStatus = async (id: string, status: string, cancellationReason?: string) => {
    try {
      await api.updateBookingStatus(id, { status, cancellationReason });
      toast.success(`Booking ${status}`);
      load();
    } catch (err: any) { toast.error(err.message || "Failed to update"); }
  };

  const handleReschedule = async (id: string, data: { preferredDate: string; preferredTime?: string; notes?: string }) => {
    try {
      await api.rescheduleBooking(id, data);
      toast.success("Booking rescheduled");
      setRescheduleModal(null);
      load();
    } catch (err: any) { toast.error(err.message || "Failed to reschedule"); }
  };

  const tabCount = (tab: string) => {
    if (tab === "all") return "";
    return bookings.filter((b) => b.status === tab).length || "";
  };

  const columns: Column<any>[] = [
    {
      key: "customer",
      label: "Customer",
      render: (b) => (
        <Link href={`/admin/bookings/${b.id}`} className="font-medium text-accent hover:text-accent-bold">
          {b.customer_name || "\u2014"}
        </Link>
      ),
    },
    { key: "order", label: "Order", render: (b) => <span className="text-muted">{b.order_number || "\u2014"}</span> },
    { key: "date", label: "Date", render: (b) => <span className="text-muted">{formatDate(b.preferred_date)}</span> },
    { key: "location", label: "Location", render: (b) => <span className="text-muted truncate block max-w-[160px]">{b.location}</span> },
    { key: "contact", label: "Contact", render: (b) => <span className="text-muted">{b.contact_name || "\u2014"}</span> },
    { key: "status", label: "Status", render: (b) => <StatusBadge status={b.status} /> },
    {
      key: "actions",
      label: "",
      render: (b) => (
        <div className="flex gap-1 flex-wrap">
          {b.status === "requested" && (
            <>
              <button onClick={() => updateStatus(b.id, "confirmed")} className="btn btn-sm btn-primary">Confirm</button>
              <button onClick={() => setRescheduleModal(b)} className="btn btn-sm btn-secondary">Reschedule</button>
              <button onClick={() => { const reason = prompt("Cancellation reason (optional):"); updateStatus(b.id, "cancelled", reason || undefined); }} className="btn btn-sm btn-danger">Cancel</button>
            </>
          )}
          {b.status === "confirmed" && (
            <>
              <button onClick={() => updateStatus(b.id, "in_progress")} className="btn btn-sm btn-primary">Start</button>
              <button onClick={() => setRescheduleModal(b)} className="btn btn-sm btn-secondary">Reschedule</button>
              <button onClick={() => { const reason = prompt("Cancellation reason (optional):"); updateStatus(b.id, "cancelled", reason || undefined); }} className="btn btn-sm btn-danger">Cancel</button>
            </>
          )}
          {b.status === "rescheduled" && (
            <>
              <button onClick={() => updateStatus(b.id, "confirmed")} className="btn btn-sm btn-primary">Confirm</button>
              <button onClick={() => updateStatus(b.id, "in_progress")} className="btn btn-sm btn-secondary">Start</button>
              <button onClick={() => { const reason = prompt("Cancellation reason (optional):"); updateStatus(b.id, "cancelled", reason || undefined); }} className="btn btn-sm btn-danger">Cancel</button>
            </>
          )}
          {b.status === "in_progress" && (
            <>
              <button onClick={() => updateStatus(b.id, "completed")} className="btn btn-sm btn-primary">Complete</button>
              <button onClick={() => { const reason = prompt("Cancellation reason (optional):"); updateStatus(b.id, "cancelled", reason || undefined); }} className="btn btn-sm btn-danger">Cancel</button>
            </>
          )}
          <Link href={`/admin/bookings/${b.id}`} className="btn btn-sm">View</Link>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Service Bookings</h1>
          <p className="mt-1 text-sm text-soft">Manage all installation and service appointments</p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="mt-6 flex gap-1 flex-wrap border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink hover:border-border"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order, location, or name"
            className="input pl-9"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); load(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
        <button type="submit" className="btn btn-secondary gap-2"><Funnel size={16} /> Filter</button>
      </form>

      {loading ? (
        <TableSkeleton cols={7} />
      ) : (
        <DataTable
          columns={columns}
          data={bookings}
          emptyIcon="bookings"
          emptyTitle="No bookings found"
        />
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <RescheduleModal
          booking={rescheduleModal}
          onClose={() => setRescheduleModal(null)}
          onSave={(data: any) => handleReschedule(rescheduleModal.id, data)}
        />
      )}
    </div>
  );
}

function RescheduleModal({ booking, onClose, onSave }: { booking: any; onClose: () => void; onSave: (data: any) => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    setSaving(true);
    try {
      await onSave({ preferredDate: date, preferredTime: time || undefined, notes: notes || undefined });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-ink mb-4">Reschedule Booking</h3>
        <p className="text-sm text-soft mb-4">{booking.order_number} — {booking.customer_name}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="input-label">New Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="input-label">Time</label>
            <select value={time} onChange={(e) => setTime(e.target.value)} className="input">
              <option value="">Flexible</option>
              <option value="morning">Morning (8am–12pm)</option>
              <option value="afternoon">Afternoon (12pm–4pm)</option>
              <option value="evening">Evening (4pm–7pm)</option>
            </select>
          </div>
          <div>
            <label className="input-label">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input" placeholder="Reason for reschedule" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Reschedule"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
