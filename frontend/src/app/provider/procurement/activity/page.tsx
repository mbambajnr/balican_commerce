"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  Plus, PaperPlaneTilt, X, Envelope, Eye, ThumbsUp, ThumbsDown,
  CurrencyCircleDollar, CheckCircle, CheckFat, ShoppingCart,
  ShieldCheck, XCircle, ListDashes,
} from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";

const EVENT_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  "request.created":         { icon: Plus, color: "text-emerald-600 bg-emerald-50", label: "Request Created" },
  "request.submitted":       { icon: PaperPlaneTilt, color: "text-blue-600 bg-blue-50", label: "Submitted" },
  "request.cancelled":       { icon: X, color: "text-red-600 bg-red-50", label: "Cancelled" },
  "provider.invited":        { icon: Envelope, color: "text-amber-600 bg-amber-50", label: "Invited" },
  "provider.viewed":         { icon: Eye, color: "text-blue-600 bg-blue-50", label: "Viewed" },
  "provider.interested":     { icon: ThumbsUp, color: "text-emerald-600 bg-emerald-50", label: "Interested" },
  "provider.declined":       { icon: ThumbsDown, color: "text-red-600 bg-red-50", label: "Declined" },
  "provider.quoted":         { icon: CurrencyCircleDollar, color: "text-amber-600 bg-amber-50", label: "Quoted" },
  "provider.selected":       { icon: CheckCircle, color: "text-emerald-600 bg-emerald-50", label: "Selected" },
  "request.accepted":        { icon: CheckFat, color: "text-emerald-600 bg-emerald-50", label: "Accepted" },
  "request.converted_to_order": { icon: ShoppingCart, color: "text-blue-600 bg-blue-50", label: "Converted to Order" },
  "credit.override_used":    { icon: ShieldCheck, color: "text-amber-600 bg-amber-50", label: "Credit Override" },
  "credit.rejected":         { icon: XCircle, color: "text-red-600 bg-red-50", label: "Credit Rejected" },
};

function timeAgo(date: string): string {
  const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
}

const EVENT_TYPES = Object.keys(EVENT_CONFIG);

export default function ProviderActivityPage() {
  const { user, loading: authLoading } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("");

  const load = useCallback((pageNum?: number) => {
    setLoading(true);
    const params: Record<string, string> = { page: String(pageNum || 1), limit: "50" };
    if (eventFilter) params.eventType = eventFilter;
    api.getProviderProcurementActivity(params)
      .then((res) => { setActivities(res.activities); setPagination(res.pagination); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventFilter]);

  useEffect(() => { if (user) load(); else setLoading(false); }, [user, load]);

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Procurement Activity</h1>
        <div className="relative w-52">
          <ListDashes size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <select
            className="input pl-9 text-sm w-full"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
          >
            <option value="">All Events</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_CONFIG[t].label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <ListDashes size={48} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No procurement activity yet</p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {activities.map((a) => {
            const cfg = EVENT_CONFIG[a.event_type] || { icon: ListDashes, color: "text-gray-600 bg-gray-50", label: a.event_type };
            const Icon = cfg.icon;
            return (
              <div key={a.id} className="card flex items-start gap-4 px-5 py-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cfg.color}`}>
                  <Icon size={18} weight="bold" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{cfg.label}</span>
                    {a.description && <span className="text-soft"> — {a.description}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{timeAgo(a.created_at)}</span>
                    {a.buyer_name && <span>by {a.buyer_name}</span>}
                    {a.user_name && !a.buyer_name && <span>by {a.user_name}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={load} />
        </div>
      )}
    </div>
  );
}
