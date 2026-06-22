"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, MagnifyingGlass, Package, Wrench } from "@phosphor-icons/react";

export default function NewScoutRequestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<any[]>([]);
  const [contextName, setContextName] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    quantity: "",
    unit: "",
    deliveryLocation: "",
    desiredDeliveryDate: "",
    budgetMin: "",
    budgetMax: "",
    notes: "",
    categoryId: "",
    requestType: "product" as "product" | "service",
  });
  const [submitting, setSubmitting] = useState(false);

  function flattenCategories(nodes: any[], depth = 0): { id: string; name: string; depth: number; slug: string }[] {
    const out: { id: string; name: string; depth: number; slug: string }[] = [];
    for (const n of nodes) {
      out.push({ id: n.id, name: n.name, depth, slug: n.slug });
      if (n.children?.length) out.push(...flattenCategories(n.children, depth + 1));
    }
    return out;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get("requestType");
    const slug = params.get("category");
    const name = params.get("categoryName");

    if (rt === "service_sourcing") set("requestType", "service");
    else if (rt === "product_sourcing") set("requestType", "product");

    if (name) setContextName(name);

    api.getCategories()
      .then((r) => {
        const flat = flattenCategories(r.categories);
        setCategories(flat);
        if (slug) {
          const cat = flat.find((c: any) => c.slug === slug);
          if (cat) set("categoryId", cat.id);
        }
      })
      .catch(() => {});
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-sm text-muted">Please <Link href="/auth/login" className="text-accent underline">log in</Link> to create a Scout request.</p>
      </div>
    );
  }

  const set = (field: string, val: string) => setForm((p) => ({ ...p, [field]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const qty = parseFloat(form.quantity);
    if (!qty || qty <= 0) { toast.error("Quantity must be a positive number"); return; }

    setSubmitting(true);
    try {
      const res = await api.createScoutRequest({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        quantity: qty,
        unit: form.unit.trim() || undefined,
        deliveryLocation: form.deliveryLocation.trim() || undefined,
        desiredDeliveryDate: form.desiredDeliveryDate || undefined,
        budgetMin: form.budgetMin ? parseFloat(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? parseFloat(form.budgetMax) : undefined,
        notes: form.notes.trim() || undefined,
        categoryId: form.categoryId || undefined,
        requestType: form.requestType,
      });
      toast.success("Scout request created");
      router.push(`/scout/${res.request.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/scout" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back to Scout
      </Link>

      <div className="mt-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">New Scout Request</h1>
        <p className="mt-1 text-sm text-muted">
          {form.requestType === "service"
            ? "Describe the service you need. Installation, maintenance, repair, provider availability, location, and response comparison."
            : "Describe what you need. Product specs, quantity, delivery location, and quote comparison."}
        </p>
      </div>

      {contextName && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Wrench size={16} className="shrink-0 text-amber-600" />
          <span>
            Starting a <strong>service sourcing request</strong> from Marketplace —{" "}
            <Link href="/marketplace" className="underline hover:text-amber-900">change category</Link>
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">

        {/* Request type toggle */}
        <div>
          <label className="input-label">Request Type</label>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => set("requestType", "product")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                form.requestType === "product"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-white text-muted hover:border-accent/40"
              }`}
            >
              <Package size={18} />
              Product / Goods
            </button>
            <button
              type="button"
              onClick={() => set("requestType", "service")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-all ${
                form.requestType === "service"
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-white text-muted hover:border-accent/40"
              }`}
            >
              <Wrench size={18} />
              Service / Works
            </button>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="input-label">Category <span className="text-soft text-xs font-normal">(optional)</span></label>
          <select
            className="input mt-1"
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
          >
            <option value="">Select a category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {"  ".repeat(cat.depth)}{cat.depth > 0 ? "↳ " : ""}{cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="input-label">
            Request Title <span className="text-red-500">*</span>
          </label>
          <input
            className="input mt-1"
            placeholder={form.requestType === "service" ? "e.g. Electrical installation for 3-storey building" : "e.g. 200m XLPE Power Cable, 11kV"}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="input-label">Description / Specifications</label>
          <textarea
            className="input mt-1 min-h-[100px] resize-y"
            placeholder={form.requestType === "service"
              ? "Describe scope of work, standards, timeline, certification requirements…"
              : "Provide detailed specs, standards, materials, tolerances…"}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        {/* Quantity + Unit */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label">
              {form.requestType === "service" ? "Quantity / Scope" : "Quantity"} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.001"
              step="any"
              className="input mt-1"
              placeholder="e.g. 200"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="input-label">Unit</label>
            <input
              className="input mt-1"
              placeholder={form.requestType === "service" ? "hours, days, lots…" : "metres, kg, pieces…"}
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
            />
          </div>
        </div>

        {/* Delivery */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label">{form.requestType === "service" ? "Site / Location" : "Delivery Location"}</label>
            <input
              className="input mt-1"
              placeholder="e.g. Accra, Greater Accra"
              value={form.deliveryLocation}
              onChange={(e) => set("deliveryLocation", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label">
              {form.requestType === "service" ? "Required By Date" : "Desired Delivery Date"}
            </label>
            <input
              type="date"
              className="input mt-1"
              value={form.desiredDeliveryDate}
              onChange={(e) => set("desiredDeliveryDate", e.target.value)}
            />
          </div>
        </div>

        {/* Budget */}
        <div>
          <label className="input-label">Budget Range (GH₵) — Optional</label>
          <div className="mt-1 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              placeholder="Min"
              value={form.budgetMin}
              onChange={(e) => set("budgetMin", e.target.value)}
            />
            <span className="hidden text-muted sm:inline">–</span>
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              placeholder="Max"
              value={form.budgetMax}
              onChange={(e) => set("budgetMax", e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="input-label">Additional Notes</label>
          <textarea
            className="input mt-1 min-h-[80px] resize-y"
            placeholder="Any other requirements, preferred brands, compliance standards…"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="grid gap-3 pt-2 sm:flex sm:items-center">
          <button type="submit" disabled={submitting} className="btn btn-primary w-full gap-2 sm:w-auto">
            <MagnifyingGlass size={16} weight="bold" />
            {submitting ? "Creating…" : "Create Scout Request"}
          </button>
          <Link href="/scout" className="btn w-full sm:w-auto">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
