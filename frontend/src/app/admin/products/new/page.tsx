"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, X, Upload, ImageSquare } from "@phosphor-icons/react";

function flattenCategories(cats: any[], depth = 0): { id: string; name: string; depth: number }[] {
  const result: { id: string; name: string; depth: number }[] = [];
  for (const c of cats) {
    result.push({ id: c.id, name: c.name, depth });
    if (c.children?.length) result.push(...flattenCategories(c.children, depth + 1));
  }
  return result;
}

function renderCategoryOption(cat: any, depth = 0): React.ReactNode[] {
  const nodes: React.ReactNode[] = [
    <option key={cat.id} value={cat.id}>{'\u00A0'.repeat(depth * 4)}{depth > 0 ? '— ' : ''}{cat.name}</option>,
  ];
  if (cat.children?.length) {
    cat.children.forEach((child: any) => nodes.push(...renderCategoryOption(child, depth + 1)));
  }
  return nodes;
}

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "", sku: "", shortDescription: "", description: "",
    categoryId: "", price: "", comparePrice: "",
    hasVariablePrice: false, stockStatus: "in_stock", featured: false,
    seoTitle: "", seoDescription: "",
  });

  // Uploaded images: array of { url, file, preview }
  const [uploadedImages, setUploadedImages] = useState<{ url: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attributes, setAttributes] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);
  const [specsJson, setSpecsJson] = useState("{}");
  const [variantsJson, setVariantsJson] = useState("[]");

  useEffect(() => {
    api.adminGetCategoryTree()
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const preview = URL.createObjectURL(file);
        try {
          const { url } = await api.adminUploadImage(file);
          setUploadedImages((prev) => [...prev, { url, preview }]);
        } catch (err: any) {
          toast.error(`Failed to upload ${file.name}: ${err.message}`);
          URL.revokeObjectURL(preview);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    const img = uploadedImages[index];
    URL.revokeObjectURL(img.preview);
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const addAttribute = () => setAttributes([...attributes, { name: "", value: "" }]);
  const removeAttribute = (i: number) => setAttributes(attributes.filter((_, idx) => idx !== i));
  const updateAttribute = (i: number, field: "name" | "value", v: string) => {
    const next = [...attributes]; next[i][field] = v; setAttributes(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.categoryId) { toast.error("Category is required"); return; }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) { toast.error("Valid price is required"); return; }

    setSaving(true);
    try {
      const images = uploadedImages.map((img, i) => ({ url: img.url, alt: "", sortOrder: i }));
      const attrs = attributes.filter((a) => a.name && a.value);
      let specs: Record<string, any> = {};
      let variants: any[] = [];
      try { specs = JSON.parse(specsJson); } catch { specs = {}; }
      try { variants = JSON.parse(variantsJson); } catch { variants = []; }

      const payload: any = {
        name: form.name,
        sku: form.sku || undefined,
        shortDescription: form.shortDescription || undefined,
        description: form.description || undefined,
        categoryId: form.categoryId,
        price: Number(form.price),
        comparePrice: form.comparePrice ? Number(form.comparePrice) : undefined,
        hasVariablePrice: form.hasVariablePrice,
        stockStatus: form.stockStatus,
        featured: form.featured,
        images: images.length > 0 ? images : undefined,
        attributes: attrs.length > 0 ? attrs : undefined,
        variants: variants.length > 0 ? variants : undefined,
        specs: Object.keys(specs).length > 0 ? specs : undefined,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
      };

      await api.adminCreateProduct(payload);
      toast.success("Product created");
      router.push("/admin/products");
    } catch (err: any) {
      toast.error(err.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Add Product</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Basic Information</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="input-label">Product Name *</label>
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
              <label className="input-label">Category *</label>
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
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Pricing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">Internal Base Price (GH₵) *</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="input" required />
              <p className="text-xs text-muted mt-1">Not visible to customers. Used internally for quotes and pricing decisions.</p>
            </div>
            <div>
              <label className="input-label">Compare Price (GH₵)</label>
              <input type="number" step="0.01" min="0" value={form.comparePrice} onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} className="input" placeholder="Original/crossed-out price" />
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Images</h2>

          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Upload size={28} weight="bold" />
            <span className="text-sm font-medium">Click to upload images</span>
            <span className="text-xs">JPEG, PNG, WebP — max 5MB each</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
            disabled={uploading}
          />

          {/* Upload progress */}
          {uploading && <p className="text-sm text-muted animate-pulse">Uploading...</p>}

          {/* Uploaded image previews */}
          {uploadedImages.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {uploadedImages.map((img, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-zinc-50">
                  <img src={img.preview} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-ink">Attributes & Specifications</h2>

          <div>
            <label className="input-label">Flexible Attributes</label>
            <p className="text-xs text-muted mb-2">Key-value pairs for product attributes (e.g. Weight, Warranty, Color)</p>
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
          <button type="submit" disabled={saving || uploading} className="btn btn-primary gap-2">
            {saving ? "Saving..." : "Create Product"}
          </button>
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
