"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";

export default function NewScoutRequestPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

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
  });
  const [submitting, setSubmitting] = useState(false);

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
          Describe what you need. Verified suppliers will submit their best quotes for you to compare.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {/* Title */}
        <div>
          <label className="input-label">
            Request Title <span className="text-red-500">*</span>
          </label>
          <input
            className="input mt-1"
            placeholder="e.g. 200m XLPE Power Cable, 11kV"
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
            placeholder="Provide detailed specs, standards, materials, tolerances…"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        {/* Quantity + Unit */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">
              Quantity <span className="text-red-500">*</span>
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
              placeholder="metres, kg, pieces…"
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
            />
          </div>
        </div>

        {/* Delivery */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">Delivery Location</label>
            <input
              className="input mt-1"
              placeholder="e.g. Accra, Greater Accra"
              value={form.deliveryLocation}
              onChange={(e) => set("deliveryLocation", e.target.value)}
            />
          </div>
          <div>
            <label className="input-label">Desired Delivery Date</label>
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
          <div className="mt-1 flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              placeholder="Min"
              value={form.budgetMin}
              onChange={(e) => set("budgetMin", e.target.value)}
            />
            <span className="text-muted">–</span>
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

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={submitting} className="btn btn-primary gap-2">
            <MagnifyingGlass size={16} weight="bold" />
            {submitting ? "Creating…" : "Create Scout Request"}
          </button>
          <Link href="/scout" className="btn">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
