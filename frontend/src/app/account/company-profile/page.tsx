"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowRight, CheckCircle, IdentificationCard, MapPin, Buildings, CreditCard } from "@phosphor-icons/react";

const BUSINESS_TYPES = ["Private Limited Company (Ltd)", "Public Limited Company (PLC)", "Sole Proprietorship", "Partnership", "Government Agency", "Non-Governmental Organization (NGO)", "Other"];
const INDUSTRIES = ["Solar & Renewable Energy", "Construction & Engineering", "Manufacturing", "Telecommunications", "Agriculture & Agribusiness", "Oil & Gas", "Mining", "Government & Public Sector", "Education", "Healthcare", "Hospitality & Tourism", "Retail & Wholesale", "Transportation & Logistics", "Real Estate", "Other"];
const PAYMENT_TERMS = ["Immediate (Payment on Order)", "Net 15 Days", "Net 30 Days", "Net 45 Days", "Net 60 Days", "Net 90 Days", "Upon Delivery", "Negotiable"];

const EMPTY_PROFILE = { businessType: "", industry: "", email: "", address: "", city: "", state: "", taxId: "", businessRegistrationNumber: "", requestedPaymentTerms: "" };

export default function CompanyProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(EMPTY_PROFILE);
  const [completion, setCompletion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [returnTo, setReturnTo] = useState("/account");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setWelcome(params.get("welcome") === "1");
    const destination = params.get("returnTo");
    if (["/provider", "/account", "/provider/verification", "/scout/new"].includes(destination || "")) setReturnTo(destination!);
  }, []);

  useEffect(() => {
    if (!user) return;
    api.getCompanyProfile()
      .then((result) => { setProfile({ ...EMPTY_PROFILE, ...result.profile }); setCompletion(result.completion); })
      .catch((error) => toast.error(error.message || "Could not load business profile"))
      .finally(() => setLoading(false));
  }, [user]);

  const update = (key: string, value: string) => setProfile((current: any) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.updateCompanyProfile(profile);
      setProfile({ ...EMPTY_PROFILE, ...result.profile });
      setCompletion(result.completion);
      toast.success(result.completion.complete ? "Business profile complete" : "Business profile saved");
      if (welcome) router.push(returnTo);
    } catch (error: any) {
      toast.error(error.message || "Could not save business profile");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-80 animate-pulse rounded-2xl bg-zinc-100" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{welcome ? "Step 2 of 2" : "Company settings"}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Complete your business profile</h1>
          <p className="mt-2 text-sm text-soft">These details build trust and are required before credit or Balican Verified submission.</p>
        </div>
        {completion?.complete && <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><CheckCircle size={16} weight="fill" /> Complete</span>}
      </div>

      {!completion?.complete && completion?.missingFields?.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <strong>Required before key submissions:</strong> {completion.missingFields.map((field: any) => field.label).join(", ")}.
        </div>
      )}

      <form onSubmit={save} className="space-y-6 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-8">
        <Section title="Business details" icon={Buildings}>
          <Select label="Business type" value={profile.businessType} options={BUSINESS_TYPES} onChange={(value) => update("businessType", value)} />
          <Select label="Industry" value={profile.industry} options={INDUSTRIES} onChange={(value) => update("industry", value)} />
          <Input label="Company email" type="email" value={profile.email} onChange={(value) => update("email", value)} />
        </Section>
        <Section title="Legal identity" icon={IdentificationCard}>
          <Input label="TIN (GRA)" required value={profile.taxId} onChange={(value) => update("taxId", value)} />
          <Input label="Business registration number" required value={profile.businessRegistrationNumber} onChange={(value) => update("businessRegistrationNumber", value)} />
        </Section>
        <Section title="Business address" icon={MapPin}>
          <div className="sm:col-span-2"><Input label="Street address" value={profile.address} onChange={(value) => update("address", value)} /></div>
          <Input label="City" value={profile.city} onChange={(value) => update("city", value)} />
          <Input label="Region" value={profile.state} onChange={(value) => update("state", value)} />
        </Section>
        <Section title="Commercial preferences" icon={CreditCard}>
          <div className="sm:col-span-2"><Select label="Requested payment terms" required value={profile.requestedPaymentTerms} options={PAYMENT_TERMS} onChange={(value) => update("requestedPaymentTerms", value)} /></div>
        </Section>

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-between">
          <Link href={returnTo} className="btn justify-center">{welcome ? "Do this later" : "Back to dashboard"}</Link>
          <button type="submit" disabled={saving} className="btn btn-primary justify-center gap-2">{saving ? "Saving..." : "Save business profile"}<ArrowRight size={16} weight="bold" /></button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return <section><div className="mb-4 flex items-center gap-2"><Icon size={20} className="text-accent" /><h2 className="font-semibold text-ink">{title}</h2></div><div className="grid gap-4 sm:grid-cols-2">{children}</div></section>;
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block"><span className="input-label">{label}{required && <span className="text-red-500"> *</span>}</span><input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} className="input" /></label>;
}

function Select({ label, value, options, onChange, required = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="input-label">{label}{required && <span className="text-red-500"> *</span>}</span><select value={value || ""} onChange={(event) => onChange(event.target.value)} className="input"><option value="">Select an option</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
