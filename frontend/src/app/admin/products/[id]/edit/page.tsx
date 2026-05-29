"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, X, ImageSquare, FloppyDisk } from "@phosphor-icons/react";
import { CardSkeleton } from "@/components/admin/LoadingSkeleton";
import ProductMediaGallery from "@/components/admin/ProductMediaGallery";

function renderCategoryOption(cat: any, depth = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [
    <option key={cat.id} value={cat.id}>{'\u00A0'.repeat(depth * 4)}{depth > 0 ? '— ' : ''}{cat.name}</option>,
  ];
  if (cat.children?.length) {
    cat.children.forEach((child: any) => nodes.push(...renderCategoryOption(child, depth + 1)));
  }
  return nodes;
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", sku: "", shortDescription: "", description: "",
    categoryId: "", price: "", comparePrice: "",
    hasVariablePrice: false, stockStatus: "in_stock", featured: false, isActive: true,
    seoTitle: "", seoDescription: "",
  });
  const [imageUrls, setImageUrls] = useState<string[]>([""]);
  const [attributes, setAttributes] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);
  const [specsJson, setSpecsJson] = useState("{}");
  const [variantsJson, setVariantsJson] = useState("[]");

  useEffect(() => {
    Promise.all([
      api.adminGetProduct(id),
      api.adminGetCategoryTree(),
    ]).then(([productRes, catRes]) => {
      const p = productRes.product;
      setForm({
        name: p.name || "",
        sku: p.sku || "",
        shortDescription: p.short_description || "",
        description: p.description || "",
        categoryId: p.category_id || "",
        price: String(p.price || ""),
        comparePrice: p.compare_price ? String(p.compare_price) : "",
        hasVariablePrice: p.has_variable_price || false,
        stockStatus: p.stock_status || "in_stock",
        featured: p.featured || false,
        isActive: p.is_active !== false,
        seoTitle: p.seo_title || "",
        seoDescription: p.seo_description || "",
      });
      if (p.images_list && p.images_list.length > 0) {
        setImageUrls(p.images_list.map((img: any) => img.url));
      }
      if (p.attributes_list && p.attributes_list.length > 0) {
        setAttributes(p.attributes_list.map((a: any) => ({ name: a.name, value: a.value })));
      }
      if (p.variants && p.variants.length > 0) {
        setVariantsJson(JSON.stringify(p.variants, null, 2));
      }
      if (p.specs && Object.keys(p.specs).length > 0) {
        setSpecsJson(JSON.stringify(p.specs, null, 2));
      }
      setCategories(catRes.categories);
    }).catch(() => {
      toast.error("Failed to load product");
      router.push("/admin/products");
    }).finally(() => setLoading(false));
  }, [id, router]);

  const addImage = () => setImageUrls([...imageUrls, ""]);
  const removeImage = (i: number) => setImageUrls(imageUrls.filter((_, idx) => idx !== i));
  const updateImage = (i: number, v: string) => {
    const next = [...imageUrls]; next[i] = v; setImageUrls(next);
  };

  const addAttribute = () => setAttributes([...attributes, { name: "", value: "" }]);
  const removeAttribute = (i: number) => setAttributes(attributes.filter((_, idx) => idx !== i));
  const updateAttribute = (i: number, field: "name" | "value", v: string) => {
    const next = [...attributes]; next[i][field] = v; setAttributes(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const images = imageUrls.filter(Boolean).map((url, i) => ({ url, alt: "", sortOrder: i }));
      const attrs = attributes.filter((a) => a.name && a.value);
      let specs: Record<string, any> = {};
      let variants: any[] = [];
      try { specs = JSON.parse(specsJson); } catch {}
      try { variants = JSON.parse(variantsJson); } catch {}

      const payload: any = {
        name: form.name,
        sku: form.sku || null,
        shortDescription: form.shortDescription || null,
        description: form.description || null,
        categoryId: form.categoryId,
        price: Number(form.price),
        comparePrice: form.comparePrice ? Number(form.comparePrice) : null,
        hasVariablePrice: form.hasVariablePrice,
        stockStatus: form.stockStatus,
        featured: form.featured,
        isActive: form.isActive,
        images: images.length > 0 ? images : [],
        attributes: attrs.length > 0 ? attrs : [],
        variants,
        specs,
        seoTitle: form.seoTitle || null,
        seoDescription: form.seoDescription || null,
      };

      await api.adminUpdateProduct(id, payload);
      toast.success("Product updated");
      router.push("/admin/products");
    } catch (err: any) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="h-8 w-48 skeleton mb-6" />
        <CardSkeleton count={3} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back to Products
      </button>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Edit Product</h1>
      <p className="mt-1 text-sm text-soft">{form.name}</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Basic Information</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="input-label">Product Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="input-label">Inventory ID (SKU)</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="input font-mono text-sm" placeholder="e.g. BC-SOLAR-001" />
            </div>
          </div>

          <div>
            <label className="input-label">Short Description</label>
            <input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} className="input" placeholder="Brief summary for listings" />
          </div>

          <div>
            <label className="input-label">Full Description</label>
            <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="input-label">Category</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="input" required>
                <option value="">Select category</option>
                {categories.map((c: any) => renderCategoryOption(c))}
              </select>
            </div>
            <div>
              <label className="input-label">Stock Status</label>
              <select value={form.stockStatus} onChange={(e) => setForm({ ...form, stockStatus: e.target.value })} className="input">
                <option value="in_stock">In Stock</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="limited">Limited</option>
              </select>
            </div>
            <div className="flex items-end gap-4 pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="h-4 w-4 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm text-ink">Featured</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.hasVariablePrice} onChange={(e) => setForm({ ...form, hasVariablePrice: e.target.checked })} className="h-4 w-4 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm text-ink">Variable Price</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm text-ink">Active</span>
              </label>
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Pricing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">Internal Base Price (GH₵)</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" required />
              <p className="text-xs text-muted mt-1">Not visible to customers. Used internally for quotes and pricing decisions.</p>
            </div>
            <div>
              <label className="input-label">Compare Price (GH₵)</label>
              <input type="number" step="0.01" min="0" value={form.comparePrice} onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} className="input" placeholder="Original/crossed-out price" />
            </div>
          </div>
        </div>

        <ProductMediaGallery productId={id} />

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Images</h2>
          <div className="space-y-2">
            {imageUrls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <ImageSquare size={20} className="text-muted shrink-0" />
                <input value={url} onChange={(e) => updateImage(i, e.target.value)} className="input flex-1 font-mono text-sm" placeholder="https://example.com/image.jpg" />
                {imageUrls.length > 1 && (
                  <button type="button" onClick={() => removeImage(i)} className="btn btn-sm text-red-500"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addImage} className="btn btn-sm gap-1"><Plus size={14} /> Add Image</button>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Attributes & Specifications</h2>

          <div>
            <label className="input-label">Flexible Attributes</label>
            <p className="text-xs text-muted mb-2">Key-value pairs (e.g. Weight, Warranty, Color)</p>
            {attributes.map((attr, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input value={attr.name} onChange={(e) => updateAttribute(i, "name", e.target.value)} className="input w-48" placeholder="Attribute name" />
                <input value={attr.value} onChange={(e) => updateAttribute(i, "value", e.target.value)} className="input flex-1" placeholder="Value" />
                {attributes.length > 1 && (
                  <button type="button" onClick={() => removeAttribute(i)} className="btn btn-sm text-red-500"><X size={14} /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={addAttribute} className="btn btn-sm gap-1"><Plus size={14} /> Add Attribute</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">Variants (JSON)</label>
              <textarea rows={3} value={variantsJson} onChange={(e) => setVariantsJson(e.target.value)} className="input font-mono text-xs"
                placeholder='[{"name":"Size","options":["Small","Large"]}]' />
            </div>
            <div>
              <label className="input-label">Specifications (JSON)</label>
              <textarea rows={3} value={specsJson} onChange={(e) => setSpecsJson(e.target.value)} className="input font-mono text-xs"
                placeholder='{"weight":"10kg","power":"500W"}' />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">SEO</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">SEO Title</label>
              <input value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className="input" />
            </div>
            <div>
              <label className="input-label">SEO Description</label>
              <input value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} className="input" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary gap-2">
            <FloppyDisk size={16} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
