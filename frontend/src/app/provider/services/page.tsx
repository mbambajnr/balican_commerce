"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, MagnifyingGlass, X } from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";

export default function ProviderServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [loading, setLoading] = useState(true);

  const loadServices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: "20" };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      const res = await api.getProviderServices(params);
      setServices(res.services);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load services"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const toggleActive = async (id: string) => {
    try {
      await api.toggleProviderService(id);
      toast.success("Status toggled");
      loadServices(pagination.page);
    } catch { toast.error("Failed to toggle"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Services</h1>
          <p className="mt-1 text-sm text-muted">Manage your service offerings</p>
        </div>
        <Link
          href="/provider/services/new"
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold transition-colors"
        >
          <Plus size={18} /> Add Service
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text" placeholder="Search services..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(filters.search || filters.status) && (
          <button onClick={() => setFilters({ search: "", status: "" })} className="flex items-center gap-1 text-sm text-muted hover:text-ink">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Pricing</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Starting Price</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Status</th>
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
              ) : services.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">No services found.</td></tr>
              ) : (
                services.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <Link href={`/provider/services/${s.id}/edit`} className="font-medium text-ink hover:text-accent">
                        {s.name}
                      </Link>
                      {s.category_name && <p className="text-xs text-muted">{s.category_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{s.service_type || "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.pricing_model?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3 text-ink">{s.starting_price != null ? `GH₵${s.starting_price}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleActive(s.id)}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            s.is_active ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {s.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <Link
                          href={`/provider/services/${s.id}/edit`}
                          className="rounded bg-surface px-2 py-1 text-xs font-medium text-muted hover:text-ink"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.pages}
        onPageChange={(p: number) => loadServices(p)}
      />
    </div>
  );
}
