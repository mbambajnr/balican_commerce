"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { api } from "@/lib/api";
import { getUTM } from "@/lib/utm";
import { fireConversion } from "@/components/TrackingScripts";
import toast from "react-hot-toast";
import { ArrowRight, Building, Envelope, LockKey, Phone, ShoppingCart, Toolbox, Handshake, ArrowsLeftRight, User } from "@phosphor-icons/react";

const ACCOUNT_TYPES = [
  { value: "buyer", label: "Buyer", icon: ShoppingCart, desc: "Purchase products and request quotes" },
  { value: "supplier", label: "Supplier", icon: Toolbox, desc: "Sell products to buyers" },
  { value: "service_provider", label: "Service Provider", icon: Handshake, desc: "Offer installation and services" },
  { value: "both", label: "Both", icon: ArrowsLeftRight, desc: "Buy and sell on the platform" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: "", companyType: "buyer", firstName: "", lastName: "",
    email: "", phone: "", password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const companyType = new URLSearchParams(window.location.search).get("companyType");
    if (companyType && ACCOUNT_TYPES.some((type) => type.value === companyType)) {
      setForm((current) => ({ ...current, companyType }));
    }
  }, []);

  const update = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const key of ["companyName", "firstName", "lastName", "email", "phone"] as const) {
      if (!form[key].trim()) nextErrors[key] = "Required";
    }
    if (form.password.length < 8) nextErrors.password = "Use at least 8 characters";
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setSubmitting(true);
    try {
      await api.register({ ...form, ...getUTM() });
      const login = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      if (login?.error) throw new Error("Account created, but automatic sign-in failed. Please sign in to continue.");
      fireConversion("CompleteRegistration", { value: 0, currency: "GHS" });
      router.push(`/account/company-profile?welcome=1&returnTo=${form.companyType === "buyer" ? "%2Fscout%2Fnew" : "%2Fprovider%2Fverification"}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-3xl flex-col justify-center px-4 py-10">
      <div className="card overflow-hidden">
        <div className="border-b border-border bg-navy px-6 py-6 text-white sm:px-8">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-navy">1</span>
            Account setup
            <span className="h-px flex-1 bg-white/20" />
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30">2</span>
            Business profile
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Create your business account</h1>
          <p className="mt-1 text-sm text-white/70">Start with the essentials. Company details can be completed next or later.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6 sm:p-8">
          <div>
            <label className="input-label">Company name <span className="text-red-500">*</span></label>
            <div className="relative"><Building size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} className="input pl-10" placeholder="Your registered or trading name" /></div>
            {errors.companyName && <p className="input-error">{errors.companyName}</p>}
          </div>

          <div>
            <label className="input-label mb-2">Account type <span className="text-red-500">*</span></label>
            <div className="grid gap-3 sm:grid-cols-2">
              {ACCOUNT_TYPES.map((option) => (
                <button key={option.value} type="button" data-testid={`company-type-${option.value}`} onClick={() => update("companyType", option.value)} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${form.companyType === option.value ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/40"}`}>
                  <option.icon size={21} weight={form.companyType === option.value ? "fill" : "regular"} className={form.companyType === option.value ? "text-accent" : "text-muted"} />
                  <span><span className="block text-sm font-semibold text-ink">{option.label}</span><span className="mt-0.5 block text-xs text-muted">{option.desc}</span></span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.firstName}><User size={18} /><input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className="input pl-10" autoComplete="given-name" /></Field>
            <Field label="Last name" error={errors.lastName}><User size={18} /><input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className="input pl-10" autoComplete="family-name" /></Field>
            <Field label="Email" error={errors.email}><Envelope size={18} /><input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="input pl-10" autoComplete="email" /></Field>
            <Field label="Phone" error={errors.phone}><Phone size={18} /><input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input pl-10" autoComplete="tel" /></Field>
          </div>
          <Field label="Password" error={errors.password}><LockKey size={18} /><input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} className="input pl-10" placeholder="At least 8 characters" autoComplete="new-password" /></Field>

          <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>{submitting ? "Creating account..." : "Create account and continue"}<ArrowRight size={16} weight="bold" /></button>
          <p className="text-center text-sm text-soft">Already registered? <Link href="/auth/login" className="font-medium text-accent">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div><label className="input-label">{label} <span className="text-red-500">*</span></label><div className="relative [&>svg]:absolute [&>svg]:left-3.5 [&>svg]:top-1/2 [&>svg]:-translate-y-1/2 [&>svg]:text-muted">{children}</div>{error && <p className="input-error">{error}</p>}</div>;
}
