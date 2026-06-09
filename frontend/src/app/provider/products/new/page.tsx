"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function NewProviderProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", sku: "", description: "",
    categoryId: "", price: "",
    stockStatus: "in_stock",
    priceVisibility: "public",
    minimumOrderQuantity: "1",
    creditEligible: false,
    brand: "",
    model: "",
    warrantyInformation: "",
    deliveryCoverage: "",
    creditTerms: "",
    visibilityStatus: "public",
    quoteOnly: false,
  });

  useEffect(() => {
    api.adminGetCategoryTree().then(r => setCategories(r.categories)).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Product name is required");
    if (!form.price) return toast.error("Price is required");
    setSaving(true);
    try {
      await api.createProviderProduct({
        ...form,
        price: parseFloat(form.price),
        minimumOrderQuantity: parseInt(form.minimumOrderQuantity) || 1,
      });
      toast.success("Product created");
      router.push("/provider/products");
    } catch (e: any) {
      toast.error(e.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  const flatCats = flattenCategories(categories);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/provider/products" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">New Product</h1>
          <p className="mt-1 text-sm text-muted">Add a product to your catalog</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Product Name *</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="e.g. Premium HVAC Unit" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">SKU</label>
            <input
              type="text" value={form.sku}
              onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Auto-generated if empty" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Category</label>
            <select
              value={form.categoryId}
              onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="">Select category</option>
              {flatCats.map(c => (
                <option key={c.id} value={c.id}>{'\u00A0'.repeat(c.depth * 3)}{c.depth > 0 ? '— ' : ''}{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Brand</label>
            <input
              type="text" value={form.brand}
              onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="e.g. Daikin, Carrier" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Model</label>
            <input
              type="text" value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="e.g. FTX35GV1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Price (GH₵) *</label>
            <input
              type="number" min="0" step="0.01" value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Stock Status</label>
            <select
              value={form.stockStatus}
              onChange={e => setForm(f => ({ ...f, stockStatus: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="in_stock">In Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="backorder">On Backorder</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Price Visibility</label>
            <select
              value={form.priceVisibility}
              onChange={e => setForm(f => ({ ...f, priceVisibility: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="public">Public - Anyone can see price</option>
              <option value="approved_buyers_only">Approved Buyers Only</option>
              <option value="quote_only">Quote Only - No price shown</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Visibility Status</label>
            <select
              value={form.visibilityStatus}
              onChange={e => setForm(f => ({ ...f, visibilityStatus: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="public">Public</option>
              <option value="approved_buyers_only">Approved Buyers Only</option>
              <option value="quote_only">Quote Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Min. Order Quantity</label>
            <input
              type="number" min="1" value={form.minimumOrderQuantity}
              onChange={e => setForm(f => ({ ...f, minimumOrderQuantity: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Credit Terms</label>
            <input
              type="text" value={form.creditTerms}
              onChange={e => setForm(f => ({ ...f, creditTerms: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="e.g. Net 30" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.creditEligible}
                onChange={e => setForm(f => ({ ...f, creditEligible: e.target.checked }))}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-ink">Eligible for credit purchase</span>
            </label>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.quoteOnly}
                onChange={e => setForm(f => ({ ...f, quoteOnly: e.target.checked }))}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-ink">Quote Only</span>
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Delivery Coverage</label>
            <input
              type="text" value={form.deliveryCoverage}
              onChange={e => setForm(f => ({ ...f, deliveryCoverage: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Comma-separated regions, e.g. Accra, Kumasi, Tema" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Warranty Information</label>
            <textarea
              value={form.warrantyInformation}
              onChange={e => setForm(f => ({ ...f, warrantyInformation: e.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Warranty terms, duration, and coverage details..."
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Detailed product description..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Link
            href="/provider/products"
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-ink hover:bg-surface transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors"
          >
            {saving ? "Creating..." : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
