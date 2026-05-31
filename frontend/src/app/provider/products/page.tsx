"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";
import { formatCurrency } from "@/lib/format";

export default function ProviderProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: "", status: "" });
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: "20" };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      const res = await api.getProviderProducts(params);
      setProducts(res.products);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load products"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const toggleActive = async (id: string) => {
    try {
      await api.toggleProviderProduct(id);
      toast.success("Status toggled");
      loadProducts(pagination.page);
    } catch { toast.error("Failed to toggle"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Products</h1>
          <p className="mt-1 text-sm text-muted">Manage your product catalog</p>
        </div>
        <Link
          href="/provider/products/new"
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold transition-colors"
        >
          <Plus size={18} /> Add Product
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
        <select
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
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
                <th className="px-4 py-3 text-left font-medium text-muted">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Price</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Stock</th>
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
              ) : products.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">No products found.</td></tr>
              ) : (
                products.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-surface/30">
                    <td className="px-4 py-3">
                      <Link href={`/provider/products/${p.id}/edit`} className="font-medium text-ink hover:text-accent">
                        {p.name}
                      </Link>
                      {p.category_name && <p className="text-xs text-muted">{p.category_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.sku || "—"}</td>
                    <td className="px-4 py-3 font-medium text-ink">{p.price != null ? formatCurrency(p.price) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.stock_status === "in_stock" ? "bg-green-50 text-green-700" :
                        p.stock_status === "out_of_stock" ? "bg-red-50 text-red-700" :
                        "bg-amber-50 text-amber-700"
                      }`}>
                        {p.stock_status?.replace(/_/g, " ") || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleActive(p.id)}
                          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                            p.is_active ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {p.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <Link
                          href={`/provider/products/${p.id}/edit`}
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
        onPageChange={(p: number) => loadProducts(p)}
      />
    </div>
  );
}
