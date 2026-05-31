"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { User, Building, MapPin, Globe, Envelope, Phone } from "@phosphor-icons/react";

export default function ProviderProfilePage() {
  const [company, setCompany] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    logo_url: "",
    cover_image_url: "",
    service_areas: "",
    regions: "",
    website: "",
    phone: "",
    business_hours: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getProviderProfile();
        setCompany(res.company);
        setProfile(res.profile || {});
        setForm({
          description: res.profile?.description || "",
          logo_url: res.profile?.logo_url || "",
          cover_image_url: res.profile?.cover_image_url || "",
          service_areas: (res.profile?.service_areas || []).join(", "),
          regions: (res.profile?.regions || []).join(", "),
          website: res.profile?.website || "",
          phone: res.profile?.phone || "",
          business_hours: res.profile?.business_hours || "",
        });
      } catch { toast.error("Failed to load profile"); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        ...form,
        service_areas: form.service_areas ? form.service_areas.split(",").map((s: string) => s.trim()) : [],
        regions: form.regions ? form.regions.split(",").map((s: string) => s.trim()) : [],
      };
      await api.updateProviderProfile(data);
      toast.success("Profile updated");
    } catch { toast.error("Failed to update profile"); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Provider Profile</h1>
        <p className="mt-1 text-sm text-muted">Manage your company information visible on the marketplace</p>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink">Company Name</label>
            <p className="mt-1 text-sm text-muted">{company?.name || "—"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Email</label>
            <p className="mt-1 text-sm text-muted">{company?.email || "—"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Business Type</label>
            <p className="mt-1 text-sm text-muted">{company?.business_type || "—"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Verification Status</label>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
              company?.verification_status === "approved" ? "bg-green-50 text-green-700" :
              company?.verification_status === "rejected" ? "bg-red-50 text-red-700" :
              "bg-amber-50 text-amber-700"
            }`}>
              {company?.verification_status === "approved" ? "Verified" :
               company?.verification_status === "rejected" ? "Rejected" : "Pending"}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 sm:p-6 space-y-6">
        <h2 className="text-lg font-semibold text-ink">Profile Details</h2>

        <div>
          <label className="block text-sm font-medium text-ink">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={4}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            placeholder="Describe your company, specialities, and experience..."
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink">Logo URL</label>
            <input
              type="text" value={form.logo_url}
              onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Cover Image URL</label>
            <input
              type="text" value={form.cover_image_url}
              onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Service Areas</label>
            <input
              type="text" value={form.service_areas}
              onChange={e => setForm(f => ({ ...f, service_areas: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Accra, Tema, Kumasi (comma separated)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Regions</label>
            <input
              type="text" value={form.regions}
              onChange={e => setForm(f => ({ ...f, regions: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Greater Accra, Ashanti (comma separated)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Website</label>
            <input
              type="text" value={form.website}
              onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="https://example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Phone</label>
            <input
              type="text" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="+233 XX XXX XXXX" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-ink">Business Hours</label>
            <input
              type="text" value={form.business_hours}
              onChange={e => setForm(f => ({ ...f, business_hours: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              placeholder="Mon–Fri: 8am–5pm, Sat: 9am–1pm" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-bold disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
