"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";

export default function NewProcurementRequestPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [providerSearch, setProviderSearch] = useState("");
  const [creditTier, setCreditTier] = useState("");
  const [showProviderPicker, setShowProviderPicker] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", requestType: "product_supply",
    deliveryLocation: "", preferredTimeline: "", estimatedBudget: "",
    notes: "", isUrgent: false,
  });

  const [items, setItems] = useState<any[]>([{ productName: "", productSku: "", serviceDescription: "", quantity: 1, unit: "pcs", notes: "" }]);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);

  useEffect(() => {
    const params: any = { type: form.requestType === "service" ? "service" : "product" };
    if (creditTier) params.creditTier = creditTier;
    api.getProcurementProviders(params)
      .then(r => setProviders(r.providers)).catch(() => {});
  }, [form.requestType, creditTier]);

  // Pre-select provider(s) and product from query params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const providerId = params.get("providerId");
      const providerIds = params.get("providerIds");
      const productId = params.get("productId");
      if (providerIds) {
        setSelectedProviderIds(providerIds.split(",").filter(Boolean));
      } else if (providerId) {
        setSelectedProviderIds([providerId]);
      }
      if (productId) {
        fetch(`/api/products/${productId}`)
          .then(r => r.json())
          .then((data) => {
            const p = data.product;
            if (p) {
              setForm(f => ({ ...f, title: `Quote for ${p.name}` }));
              setItems([{ productName: p.name, productSku: p.sku || "", serviceDescription: "", quantity: 1, unit: "pcs", notes: "", productId: p.id }]);
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  const addItem = () => setItems([...items, { productName: "", productSku: "", serviceDescription: "", quantity: 1, unit: "pcs", notes: "" }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(items.filter((_, idx) => idx !== i)); };
  const updateItem = (i: number, field: string, value: any) => {
    const updated = [...items];
    (updated[i] as any)[field] = value;
    setItems(updated);
  };

  const toggleProvider = (id: string) => {
    setSelectedProviderIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return toast.error("Title is required");
    if (items.some(i => !i.productName && !i.serviceDescription)) return toast.error("Each item needs a name or description");
    setSaving(true);
    try {
      const res = await api.createProcurementRequest({
        ...form,
        estimatedBudget: form.estimatedBudget ? parseFloat(form.estimatedBudget) : null,
        items: items.map(i => ({
          productId: i.productId || null,
          productName: i.productName || null,
          productSku: i.productSku || null,
          serviceDescription: form.requestType === "service" ? i.serviceDescription || i.productName : null,
          quantity: i.quantity,
          unit: i.unit,
          notes: i.notes,
        })),
        providerIds: selectedProviderIds,
      });
      toast.success("Request created");
      router.push(`/procurement/requests/${res.request.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create request");
    } finally {
      setSaving(false);
    }
  };

  const filteredProviders = providers.filter(p =>
    !providerSearch || p.name?.toLowerCase().includes(providerSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/procurement/requests" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">New Procurement Request</h1>
          <p className="mt-1 text-sm text-muted">Create a request for products or services</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-6">
          <h2 className="text-lg font-semibold text-ink">Request Details</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-ink">Title *</label>
              <input type="text" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                placeholder="e.g. HVAC Units for Tema Project" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-ink">Description</label>
              <textarea value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                placeholder="Describe your requirements in detail..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Request Type</label>
              <select value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
                <option value="product_supply">Product Supply</option>
                <option value="service">Service</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isUrgent}
                  onChange={e => setForm(f => ({ ...f, isUrgent: e.target.checked }))}
                  className="rounded border-border text-accent focus:ring-accent" />
                <span className="text-sm text-ink">Urgent request</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Delivery Location</label>
              <input type="text" value={form.deliveryLocation}
                onChange={e => setForm(f => ({ ...f, deliveryLocation: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                placeholder="Accra, Tema, etc." />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Preferred Timeline</label>
              <input type="text" value={form.preferredTimeline}
                onChange={e => setForm(f => ({ ...f, preferredTimeline: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                placeholder="e.g. Within 2 weeks" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Estimated Budget (GH₵)</label>
              <input type="number" min="0" step="0.01" value={form.estimatedBudget}
                onChange={e => setForm(f => ({ ...f, estimatedBudget: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-ink">Additional Notes</label>
              <textarea value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Items</h2>
            <button type="button" onClick={addItem}
              className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              <Plus size={16} /> Add Item
            </button>
          </div>
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-border/50 bg-surface/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Item #{i + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700">
                    <Trash size={16} />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className={form.requestType === "service" ? "sm:col-span-2" : ""}>
                  <label className="block text-xs font-medium text-muted mb-1">
                    {form.requestType === "service" ? "Service Description" : "Product Name"}
                  </label>
                  <input type="text" value={form.requestType === "service" ? item.serviceDescription : item.productName}
                    onChange={e => updateItem(i, form.requestType === "service" ? "serviceDescription" : "productName", e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    placeholder={form.requestType === "service" ? "e.g. HVAC installation" : "e.g. Premium HVAC Unit"} />
                </div>
                {form.requestType !== "service" && (
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">SKU (optional)</label>
                    <input type="text" value={item.productSku}
                      onChange={e => updateItem(i, "productSku", e.target.value)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Quantity</label>
                  <input type="number" min="1" value={item.quantity}
                    onChange={e => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Unit</label>
                  <input type="text" value={item.unit}
                    onChange={e => updateItem(i, "unit", e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    placeholder="pcs, kg, hrs" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-muted mb-1">Notes for this item</label>
                  <input type="text" value={item.notes}
                    onChange={e => updateItem(i, "notes", e.target.value)}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    placeholder="Any specifications or requirements..." />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Invite Providers</h2>
          <p className="text-sm text-muted">Select which providers to send this request to</p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input type="text" value={providerSearch}
                onChange={e => setProviderSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-ink outline-none focus:border-accent"
                placeholder="Search providers..." />
            </div>
            <select value={creditTier} onChange={e => setCreditTier(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
              <option value="">All Tiers</option>
              <option value="premium">Premium</option>
              <option value="standard">Standard</option>
              <option value="basic">Basic</option>
            </select>
          </div>
          {filteredProviders.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">No providers found matching your request type.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 max-h-60 overflow-y-auto">
              {filteredProviders.map((p: any) => (
                <label key={p.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedProviderIds.includes(p.id) ? "border-accent bg-accent/5" : "border-border hover:bg-surface/50"
                }`}>
                  <input type="checkbox" checked={selectedProviderIds.includes(p.id)}
                    onChange={() => toggleProvider(p.id)} className="mt-0.5 rounded border-border text-accent focus:ring-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{p.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted truncate">{p.company_type?.replace(/_/g, " ")}</p>
                      {p.credit_tier && p.credit_tier !== "basic" && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          p.credit_tier === "premium" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
                        }`}>
                          {p.credit_tier}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/procurement/requests"
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-ink hover:bg-surface transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={saving}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors">
            {saving ? "Creating..." : "Create Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
