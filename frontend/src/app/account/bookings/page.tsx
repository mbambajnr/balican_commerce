"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Wrench, Cube, CalendarCheck } from "@phosphor-icons/react";

export default function CustomerBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      api.getBookings().then((res) => setBookings(res.bookings)).finally(() => setLoading(false));
    } else { setLoading(false); }
  }, [user]);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      requested: "badge-yellow", confirmed: "badge-blue", rescheduled: "badge-purple",
      in_progress: "badge-blue", completed: "badge-green", cancelled: "badge-red",
    };
    return map[s] || "badge-gray";
  };

  if (authLoading || loading) return null;
  if (!user) return <div className="mx-auto max-w-lg px-4 py-20 text-center"><p className="text-soft">Please login</p></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Service Bookings</h1>
          <p className="mt-1 text-sm text-soft">Manage your installation and service appointments</p>
        </div>
        <Link href="/booking" className="btn btn-primary gap-2">
          <CalendarCheck size={18} weight="bold" />
          Book New Service
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Wrench size={48} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No service bookings yet</p>
          <Link href="/booking" className="btn btn-primary">Book Your First Service</Link>
        </div>
      ) : (
        <div className="card mt-8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: any) => (
                  <tr key={b.id} className="border-b border-border/50 text-sm hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4 font-medium">{b.order_number || "\u2014"}</td>
                    <td className="px-6 py-4 text-muted">{new Date(b.preferred_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-muted max-w-[200px] truncate">{b.location}</td>
                    <td className="px-6 py-4 text-muted">{b.service_type || "installation"}</td>
                    <td className="px-6 py-4"><span className={`badge ${statusBadge(b.status)}`}>{b.status}</span></td>
                    <td className="px-6 py-4">
                      <Link href={`/account/bookings/${b.id}`} className="text-sm text-accent hover:text-accent-bold">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
