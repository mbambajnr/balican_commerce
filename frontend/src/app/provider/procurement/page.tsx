"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { MagnifyingGlass, X, Eye } from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";

const statusLabels: Record<string, string> = {
  invited: "New", viewed: "Viewed", interested: "Interested",
  declined: "Declined", quoted: "Quoted", selected: "Selected",
};

const statusColors: Record<string, string> = {
  invited: "bg-blue-50 text-blue-600",
  viewed: "bg-gray-100 text-gray-600",
  interested: "bg-green-50 text-green-600",
  declined: "bg-red-50 text-red-600",
  quoted: "bg-amber-50 text-amber-600",
  selected: "bg-emerald-50 text-emerald-600",
};

export default function ProviderProcurementPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: "20" };
      if (filters.status) params.status = filters.status;
      const res = await api.getProviderProcurementRequests(params);
      setRequests(res.requests);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load requests"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Procurement Requests</h1>
        <p className="mt-1 text-sm text-muted">Requests sent to your company from buyers</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
          <option value="">All Status</option>
          <option value="invited">New</option>
          <option value="viewed">Viewed</option>
          <option value="interested">Interested</option>
          <option value="declined">Declined</option>
          <option value="quoted">Quoted</option>
          <option value="selected">Selected</option>
        </select>
        {filters.status && (
          <button onClick={() => setFilters({ status: "" })} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted">Request</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Buyer</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Received</th>
                <th className="px-4 py-3 text-right font-medium text-muted">Actions</th>
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
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">No requests received.</td></tr>
              ) : (
                requests.map((r: any) => (
                  <tr key={r.prp_id} className="border-b border-border/50 hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <Link href={`/provider/procurement/${r.request_id}`} className="font-medium text-ink hover:text-accent">
                        {r.title}
                      </Link>
                      {r.is_urgent && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">Urgent</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{r.company_name || "—"}</td>
                    <td className="px-4 py-3 text-muted capitalize">{r.request_type?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.response_status] || ""}`}>
                        {statusLabels[r.response_status] || r.response_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(r.requested_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/provider/procurement/${r.request_id}`}
                        className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-xs font-medium text-muted hover:text-ink">
                        <Eye size={14} /> View
                      </Link>
                    </td>
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
