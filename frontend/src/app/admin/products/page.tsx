"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Funnel, MagnifyingGlass, X, Upload, Download, Tag } from "@phosphor-icons/react";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { TableSkeleton } from "@/components/admin/LoadingSkeleton";
import { statusBadgeClass } from "@/components/admin/StatusBadge";
import { formatCurrency } from "@/lib/format";
import { useRouter } from "next/navigation";

function renderCategoryOption(cat: any, depth = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [
    <option key={cat.id} value={cat.id}>{'\u00A0'.repeat(depth * 4)}{depth > 0 ? '— ' : ''}{cat.name}</option>,
  ];
  if (cat.children?.length) {
    cat.children.forEach((child: any) => nodes.push(...renderCategoryOption(child, depth + 1)));
  }
  return nodes;
}

export default function AdminProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });

  const [filters, setFilters] = useState({ search: "", categoryId: "", stockStatus: "", isActive: "" });
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [showBulk, setShowBulk] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [loading, setLoading] = useState(false);

  const loadProducts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: "20" };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.stockStatus) params.stockStatus = filters.stockStatus;
      if (filters.isActive) params.isActive = filters.isActive;
      const res = await api.adminGetProducts(params);
      setProducts(res.products);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load products"); }
    finally { setLoading(false); }
  }, [debouncedSearch, filters]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.adminGetCategoryTree();
      setCategories(res.categories);
    } catch {}
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await api.adminUpdateProduct(id, { isActive: !current });
      toast.success("Updated");
      loadProducts(pagination.page);
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deactivate "${name}"?`)) return;
    try {
      await api.adminDeleteProduct(id);
      toast.success("Product deactivated");
      loadProducts(pagination.page);
    } catch { toast.error("Failed to deactivate"); }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.adminCreateCategory({ name: catForm.name, description: catForm.description || undefined });
      toast.success("Category created");
      setCatForm({ name: "", description: "" });
      setShowCategoryForm(false);
      loadCategories();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleBulkImport = async () => {
    if (!bulkFile) { toast.error("Select a file first"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.bulkImport(bulkFile);
      setImportResult(result);
      toast.success(`Imported ${result.created} products`);
      loadProducts();
    } catch (err: any) { toast.error(err.message || "Import failed"); }
    finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    const headers = ["name","sku","price","category","description","comparePrice","stockStatus","images","variants","specs","seoTitle","seoDescription"];
    const csv = [headers.join(","), `"Example Product","SKU-001","1000","Solar Panels","A great product","1200","in_stock","https://example.com/img.jpg","[]","{}","SEO Title","SEO Description"`].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "product-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Products</h1>
          <p className="mt-1 text-sm text-soft">{pagination.total} products</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setShowCategoryForm(!showCategoryForm); setShowBulk(false); }} className="btn btn-secondary gap-2">
            <Tag size={16} /> Categories
          </button>
          <button onClick={() => { setShowBulk(!showBulk); setShowCategoryForm(false); }} className="btn btn-secondary gap-2">
            <Upload size={16} /> Bulk Import
          </button>
          <Link href="/admin/products/new" className="btn btn-primary gap-2">
            <Plus size={16} weight="bold" /> Add Product
          </Link>
        </div>
      </div>

      {showCategoryForm && (
        <div className="card mt-6 p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Categories</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            {categories.map((c: any) => (
              <Link key={c.id} href={`/admin/categories`} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-ink hover:bg-zinc-200">
                {c.name}
                <span className="text-muted">({c.product_count || 0})</span>
              </Link>
            ))}
          </div>
          <form onSubmit={handleCreateCategory} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="input-label">New Category</label>
              <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="input" placeholder="Category name" required />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="input-label">Description</label>
              <input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} className="input" placeholder="Optional" />
            </div>
            <button type="submit" className="btn btn-primary">Create</button>
          </form>
        </div>
      )}

      {showBulk && (
        <div className="card mt-6 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Bulk Import</h2>
            <button onClick={downloadTemplate} className="btn btn-sm gap-1"><Download size={14} /> Template</button>
          </div>
          <p className="text-sm text-soft">Upload CSV or XLSX, up to 5 MB and 1,000 rows. Required: <code className="text-accent">name</code>, <code className="text-accent">price</code>, <code className="text-accent">category</code>.</p>
          <div className="flex items-center gap-4">
            <input type="file" accept=".csv,.xlsx" onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
              className="file:btn file:btn-sm file:mr-3 text-sm text-soft" />
            {bulkFile && (
              <span className="flex items-center gap-2 text-sm text-ink">
                {bulkFile.name}
                <button onClick={() => { setBulkFile(null); }} className="text-muted hover:text-ink"><X size={14} /></button>
              </span>
            )}
          </div>
          <button onClick={handleBulkImport} className="btn btn-primary gap-2" disabled={!bulkFile || importing}>
            <Upload size={16} /> {importing ? "Importing..." : "Import Products"}
          </button>
          {importResult && (
            <div className="rounded-lg border p-4 text-sm space-y-2">
              <p className="font-medium">Results</p>
              <div className="flex gap-4">
                <span className="text-muted">{importResult.total} rows</span>
                <span className="text-green-600">{importResult.created} created</span>
                {importResult.skipped > 0 && <span className="text-amber-600">{importResult.skipped} skipped</span>}
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((e: any, i: number) => (
                    <p key={i} className="text-red-600 text-xs">Row {e.row}: {e.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card mt-6 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[200px] flex-1">
            <label className="input-label">Search</label>
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="input pl-9" placeholder="Name, SKU, description..." />
              {filters.search && (
                <button onClick={() => setFilters({ ...filters, search: "" })} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={14} /></button>
              )}
            </div>
          </div>
          <div className="w-44">
            <label className="input-label">Category</label>
            <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className="input">
              <option value="">All Categories</option>
              {categories.map((c: any) => renderCategoryOption(c))}
            </select>
          </div>
          <div className="w-36">
            <label className="input-label">Stock</label>
            <select value={filters.stockStatus} onChange={(e) => setFilters({ ...filters, stockStatus: e.target.value })} className="input">
              <option value="">All</option>
              <option value="in_stock">In Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="limited">Limited</option>
            </select>
          </div>
          <div className="w-32">
            <label className="input-label">Status</label>
            <select value={filters.isActive} onChange={(e) => setFilters({ ...filters, isActive: e.target.value })} className="input">
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="flex gap-2 pb-0.5">
            <button onClick={() => loadProducts()} className="btn btn-sm"><Funnel size={14} /> Filter</button>
            <button onClick={() => { setFilters({ search: "", categoryId: "", stockStatus: "", isActive: "" }); }} className="btn btn-sm">Clear</button>
          </div>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : (
        <>
          <DataTable
            columns={[
              { key: "sku", label: "Inventory ID", render: (p: any) => <span className="font-mono text-xs text-muted">{p.sku || "\u2014"}</span> },
              { key: "name", label: "Name", render: (p: any) => <Link href={`/admin/products/${p.id}/edit`} className="font-medium hover:text-accent transition-colors">{p.name}</Link> },
              { key: "category_name", label: "Category", render: (p: any) => <span className="text-muted">{p.category_name || "\u2014"}</span> },
              { key: "price", label: "Internal Base Price", render: (p: any) => formatCurrency(p.price) },
              { key: "stock_status", label: "Stock", render: (p: any) => <span className={`badge ${statusBadgeClass(p.stock_status)}`}>{p.stock_status}</span> },
              { key: "featured", label: "Featured", render: (p: any) => p.featured ? <span className="text-amber-500 text-lg leading-none">&#9733;</span> : "\u2014" },
              { key: "is_active", label: "Status", render: (p: any) => <span className={`badge ${statusBadgeClass(p.is_active ? "active" : "inactive")}`}>{p.is_active ? "Active" : "Inactive"}</span> },
              { key: "actions", label: "", render: (p: any) => (
                <div className="flex gap-2">
                  <Link href={`/admin/products/${p.id}/edit`} className="btn btn-sm">Edit</Link>
                  <button onClick={() => toggleActive(p.id, p.is_active)} className="btn btn-sm">{p.is_active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => handleDelete(p.id, p.name)} className="btn btn-sm text-red-500">Delete</button>
                </div>
              )},
            ]}
            data={products}
            emptyIcon="products"
            emptyTitle="No products found"
            emptyAction={<Link href="/admin/products/new" className="btn btn-primary btn-sm gap-2 mt-2"><Plus size={14} /> Add Product</Link>}
          />
          <Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={loadProducts} />
        </>
      )}
    </div>
  );
}
