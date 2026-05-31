"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, MagnifyingGlass, Funnel, X } from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";

const statusLabels: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", in_review: "In Review",
  accepted: "Accepted", cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-blue-50 text-blue-600",
  in_review: "bg-amber-50 text-amber-600",
  accepted: "bg-green-50 text-green-600",
  cancelled: "bg-red-50 text-red-600",
};

export default function ProcurementRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: "", type: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: "20" };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      const res = await api.getProcurementRequests(params);
      setRequests(res.requests);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load requests"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Procurement Requests</h1>
          <p className="mt-1 text-sm text-muted">Request goods or services from providers</p>
        </div>
        <Link href="/procurement/requests/new"
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold transition-colors">
          <Plus size={18} /> New Request
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="in_review">In Review</option>
          <option value="accepted">Accepted</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
          <option value="">All Types</option>
          <option value="product_supply">Product Supply</option>
          <option value="service">Service</option>
        </select>
        {(filters.status || filters.type) && (
          <button onClick={() => setFilters({ status: "", type: "" })} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted">Title</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Items</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Providers</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-border/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-gray-100" /></td>
                    ))}
                  </tr>
                ))
              ) : requests.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">No requests found.</td></tr>
              ) : (
                requests.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <Link href={`/procurement/requests/${r.id}`} className="font-medium text-ink hover:text-accent">
                        {r.title}
                      </Link>
                      {r.is_urgent && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">Urgent</span>}
                    </td>
                    <td className="px-4 py-3 text-muted capitalize">{r.request_type?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-muted">{r.items_count || 0}</td>
                    <td className="px-4 py-3 text-muted">{r.providers ? (Array.isArray(r.providers) ? r.providers.length : 0) : 0}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status] || ""}`}>
                        {statusLabels[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={(p: number) => load(p)} />
    </div>
  );
}
