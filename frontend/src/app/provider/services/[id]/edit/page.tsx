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

export default function EditProviderServicePage() {
  const router = useRouter();
  const params = useParams();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", categoryId: "",
    serviceType: "installation",
    serviceAreas: "", pricingModel: "fixed",
    startingPrice: "", priceVisibility: "public",
    minimumJobValue: "", estimatedResponseTime: "",
    creditEligible: false, isActive: true,
  });

  const serviceId = params.id as string;

  useEffect(() => {
    Promise.all([
      api.adminGetCategoryTree(),
      api.get(`/marketplace/services/${serviceId}`).catch(() => api.get(`/marketplace/services/slug/${serviceId}`)),
    ]).then(([catRes, servRes]: [any, any]) => {
      setCategories(catRes.categories);
      const s = servRes.service || servRes;
      setForm({
        name: s.name || "",
        description: s.description || "",
        categoryId: s.category_id || "",
        serviceType: s.service_type || "installation",
        serviceAreas: Array.isArray(s.service_areas) ? s.service_areas.join(", ") : "",
        pricingModel: s.pricing_model || "fixed",
        startingPrice: s.starting_price != null ? String(s.starting_price) : "",
        priceVisibility: s.price_visibility || "public",
        minimumJobValue: s.minimum_job_value != null ? String(s.minimum_job_value) : "",
        estimatedResponseTime: s.estimated_response_time || "",
        creditEligible: s.credit_eligible || false,
        isActive: s.is_active !== false,
      });
    }).catch(() => toast.error("Failed to load service"))
    .finally(() => setLoading(false));
  }, [serviceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return toast.error("Service name is required");
    setSaving(true);
    try {
      await api.updateProviderService(serviceId, {
        ...form,
        serviceAreas: form.serviceAreas ? form.serviceAreas.split(",").map((s: string) => s.trim()) : [],
        startingPrice: form.startingPrice ? parseFloat(form.startingPrice) : null,
        minimumJobValue: form.minimumJobValue ? parseFloat(form.minimumJobValue) : null,
      });
      toast.success("Service updated");
      router.push("/provider/services");
    } catch (e: any) {
      toast.error(e.message || "Failed to update service");
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
        <Link href="/provider/services" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">Edit Service</h1>
          <p className="mt-1 text-sm text-muted">{form.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Service Name *</label>
            <input type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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
            <label className="block text-sm font-medium text-ink">Service Type</label>
            <select value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
              <option value="installation">Installation</option>
              <option value="maintenance">Maintenance</option>
              <option value="repair">Repair</option>
              <option value="consulting">Consulting</option>
              <option value="contract">Contract</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Pricing Model</label>
            <select value={form.pricingModel} onChange={e => setForm(f => ({ ...f, pricingModel: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
              <option value="fixed">Fixed Price</option>
              <option value="hourly">Hourly Rate</option>
              <option value="quote_only">Quote Only</option>
              <option value="tiered">Tiered Pricing</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Starting Price (GH₵)</label>
            <input type="number" min="0" step="0.01" value={form.startingPrice}
              onChange={e => setForm(f => ({ ...f, startingPrice: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
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
            <label className="block text-sm font-medium text-ink">Est. Response Time</label>
            <input type="text" value={form.estimatedResponseTime}
              onChange={e => setForm(f => ({ ...f, estimatedResponseTime: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Min. Job Value (GH₵)</label>
            <input type="number" min="0" step="0.01" value={form.minimumJobValue}
              onChange={e => setForm(f => ({ ...f, minimumJobValue: e.target.value }))}
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
          <div>
            <label className="block text-sm font-medium text-ink">Service Areas</label>
            <input type="text" value={form.serviceAreas}
              onChange={e => setForm(f => ({ ...f, serviceAreas: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Accra, Tema, Kumasi" />
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
          <Link href="/provider/services"
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
