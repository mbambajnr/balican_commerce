"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

function flattenCategories(cats: any[], depth = 0): { id: string; name: string; depth: number }[] {
  const result: { id: string; name: string; depth: number }[] = [];
  for (const c of cats) {
    result.push({ id: c.id, name: c.name, depth });
    if (c.children?.length) result.push(...flattenCategories(c.children, depth + 1));
  }
  return result;
}

export default function EditProviderProductPage() {
  const router = useRouter();
  const params = useParams();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", sku: "", description: "",
    categoryId: "", price: "",
    stockStatus: "in_stock",
    priceVisibility: "public",
    minimumOrderQuantity: "1",
    creditEligible: false,
    isActive: true,
  });

  const productId = params.id as string;

  useEffect(() => {
    Promise.all([
      api.adminGetCategoryTree(),
      api.get(`/products/${productId}`),
    ]).then(([catRes, prodRes]: [any, any]) => {
      setCategories(catRes.categories);
      const p = prodRes.product || prodRes;
      setForm({
        name: p.name || "",
        sku: p.sku || "",
        description: p.description || "",
        categoryId: p.category_id || "",
        price: p.price != null ? String(p.price) : "",
        stockStatus: p.stock_status || "in_stock",
        priceVisibility: p.price_visibility || "public",
        minimumOrderQuantity: String(p.minimum_order_quantity || 1),
        creditEligible: p.credit_eligible || false,
        isActive: p.is_active !== false,
      });
    }).catch(() => toast.error("Failed to load product"))
    .finally(() => setLoading(false));
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Product name is required");
    setSaving(true);
    try {
      await api.updateProviderProduct(productId, {
        ...form,
        price: form.price ? parseFloat(form.price) : undefined,
        minimumOrderQuantity: parseInt(form.minimumOrderQuantity) || 1,
      });
      toast.success("Product updated");
      router.push("/provider/products");
    } catch (e: any) {
      toast.error(e.message || "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-60 animate-pulse rounded-xl bg-gray-100" />;
  }

  const flatCats = flattenCategories(categories);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/provider/products" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">Edit Product</h1>
          <p className="mt-1 text-sm text-muted">{form.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Product Name *</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">SKU</label>
            <input type="text" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Category</label>
            <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
              <option value="">Select category</option>
              {flatCats.map(c => (
                <option key={c.id} value={c.id}>{'\u00A0'.repeat(c.depth * 3)}{c.depth > 0 ? '— ' : ''}{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Price (GH₵)</label>
            <input type="number" min="0" step="0.01" value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Stock Status</label>
            <select value={form.stockStatus} onChange={e => setForm(f => ({ ...f, stockStatus: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
              <option value="in_stock">In Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="backorder">On Backorder</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Price Visibility</label>
            <select value={form.priceVisibility} onChange={e => setForm(f => ({ ...f, priceVisibility: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
              <option value="public">Public</option>
              <option value="approved_buyers_only">Approved Buyers Only</option>
              <option value="quote_only">Quote Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Min. Order Qty</label>
            <input type="number" min="1" value={form.minimumOrderQuantity}
              onChange={e => setForm(f => ({ ...f, minimumOrderQuantity: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.creditEligible}
                onChange={e => setForm(f => ({ ...f, creditEligible: e.target.checked }))}
                className="rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm text-ink">Credit eligible</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                className="rounded border-border text-accent focus:ring-accent" />
              <span className="text-sm text-ink">Active</span>
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Description</label>
            <textarea value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Link href="/provider/products"
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-ink hover:bg-surface transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
