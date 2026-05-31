"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import Pagination from "@/components/admin/Pagination";

export default function ProviderInventoryPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadProducts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: "20" };
      if (search) params.search = search;
      const res = await api.getProviderProducts(params);
      setProducts(res.products);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load inventory"); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const updateInventory = async (id: string, data: any) => {
    setUpdating(id);
    try {
      await api.updateProviderProductInventory(id, data);
      toast.success("Inventory updated");
      loadProducts(pagination.page);
    } catch { toast.error("Failed to update"); }
    finally { setUpdating(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Inventory Management</h1>
        <p className="mt-1 text-sm text-muted">Update stock status and availability for your products</p>
      </div>

      <div className="relative max-w-xs">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text" placeholder="Search by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface pl-9 pr-8 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted">Product</th>
                <th className="px-4 py-3 text-left font-medium text-muted">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Current Stock</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Min. Qty</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Stock Status</th>
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
                  <InventoryRow
                    key={p.id}
                    product={p}
                    updating={updating === p.id}
                    onUpdate={(data: any) => updateInventory(p.id, data)}
                  />
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

function InventoryRow({ product, updating, onUpdate }: { product: any; updating: boolean; onUpdate: (data: any) => void }) {
  const [stockStatus, setStockStatus] = useState(product.stock_status || "in_stock");
  const [minQty, setMinQty] = useState(String(product.minimum_order_quantity || 1));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (stockStatus !== (product.stock_status || "in_stock") || minQty !== String(product.minimum_order_quantity || 1)) {
      setDirty(true);
    } else {
      setDirty(false);
    }
  }, [stockStatus, minQty, product]);

  const handleSave = () => {
    onUpdate({
      stockStatus,
      stockQuantity: minQty ? parseInt(minQty) : null,
    });
  };

  return (
    <tr className="border-b border-border/50 hover:bg-surface/30">
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{product.name}</p>
      </td>
      <td className="px-4 py-3 text-muted font-mono text-xs">{product.sku || "—"}</td>
      <td className="px-4 py-3">
        <select
          value={stockStatus}
          onChange={e => setStockStatus(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        >
          <option value="in_stock">In Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="backorder">On Backorder</option>
          <option value="discontinued">Discontinued</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          type="number" min="1"
          value={minQty}
          onChange={e => setMinQty(e.target.value)}
          className="w-20 rounded border border-border bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          stockStatus === "in_stock" ? "bg-green-50 text-green-700" :
          stockStatus === "out_of_stock" ? "bg-red-50 text-red-700" :
          "bg-amber-50 text-amber-700"
        }`}>
          {stockStatus.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={handleSave}
          disabled={!dirty || updating}
          className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
            dirty
              ? "bg-accent text-white hover:bg-accent-bold"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          } disabled:opacity-50`}
        >
          {updating ? "Saving..." : "Save"}
        </button>
      </td>
    </tr>
  );
}
