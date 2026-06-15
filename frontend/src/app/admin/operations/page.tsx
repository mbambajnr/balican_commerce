"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  ClipboardText, Warning, Coins, ArrowRight,
  FileText, Building, CalendarCheck,
} from "@phosphor-icons/react";

type OperationsSummary = {
  openProcurementRequests: number;
  pendingSupplierCreditReviews: number;
  acceptedRequestsAwaitingConversion: number;
  recentConvertedOrders: Array<{
    id: string;
    order_number: string;
    total: string;
    status: string;
    payment_status: string;
    created_at: string;
    request_title: string;
    company_name: string;
  }>;
};

const cardConfig = [
  {
    key: "openProcurementRequests",
    label: "Open Procurement Requests",
    icon: ClipboardText,
    color: "bg-blue-50 text-blue-600",
    href: "/admin/procurement",
    fallbackHref: "/admin",
  },
  {
    key: "pendingSupplierCreditReviews",
    label: "Pending Credit Reviews",
    icon: Warning,
    color: "bg-amber-50 text-amber-600",
    href: "/admin/companies",
  },
  {
    key: "acceptedRequestsAwaitingConversion",
    label: "Awaiting Order Conversion",
    icon: Coins,
    color: "bg-emerald-50 text-emerald-600",
    href: "/admin/procurement",
    fallbackHref: "/admin",
  },
];

const statusColors: Record<string, string> = {
  paid: "text-emerald-600 bg-emerald-50",
  unpaid: "text-amber-600 bg-amber-50",
  pending: "text-yellow-600 bg-yellow-50",
  processing: "text-blue-600 bg-blue-50",
  completed: "text-green-600 bg-green-50",
  cancelled: "text-red-600 bg-red-50",
};

export default function AdminOperationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<OperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.get<OperationsSummary>("/admin/operations/summary")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Operations</h1>
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">Operations</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {cardConfig.map((cfg) => {
          const value = data ? (data as any)[cfg.key] : 0;
          return (
            <Link
              key={cfg.key}
              href={value > 0 ? cfg.href : (cfg.fallbackHref || cfg.href)}
              className="group relative flex flex-col rounded-xl border border-border bg-white p-5 transition-all hover:shadow-md hover:border-accent/20 sm:p-6"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${cfg.color}`}>
                <cfg.icon size={20} weight="duotone" />
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-ink">{value}</p>
              <p className="mt-0.5 text-xs text-muted">{cfg.label}</p>
              <ArrowRight size={14} className="absolute right-4 top-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      {/* Recent converted procurement orders */}
      <div className="rounded-xl border border-border bg-white">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">Recent Procurement Orders</h2>
        </div>
        {data?.recentConvertedOrders && data.recentConvertedOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Request</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Payment</th>
                  <th className="px-6 py-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentConvertedOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 text-sm hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link href={`/orders/${o.id}/confirm`} className="font-medium text-accent hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-ink max-w-[200px] truncate">{o.request_title}</td>
                    <td className="px-6 py-4 text-muted">{o.company_name}</td>
                    <td className="px-6 py-4 font-medium text-ink">GH₵{Number(o.total).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.status] || "bg-gray-100 text-gray-600"}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[o.payment_status] || "bg-gray-100 text-gray-600"}`}>
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardText size={40} className="text-muted" weight="light" />
            <p className="text-sm text-soft">No procurement orders yet</p>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/companies" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface transition-colors">
            <Building size={16} /> Companies
          </Link>
          <Link href="/admin/quotations" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface transition-colors">
            <FileText size={16} /> Quotations
          </Link>
          <Link href="/admin/bookings" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface transition-colors">
            <CalendarCheck size={16} /> Bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
