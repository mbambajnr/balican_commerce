"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getUTM } from "@/lib/utm";
import { fireConversion } from "@/components/TrackingScripts";
import toast from "react-hot-toast";
import {
  ArrowRight, User, Envelope, Phone, LockKey,
  Building, Tag, MapPin, Globe, IdentificationBadge, Files,
  Bank, CurrencyDollar, CaretDown, ClockCountdown, CheckCircle,
  ShoppingCart, Toolbox, Handshake, ArrowsLeftRight
} from "@phosphor-icons/react";

const INDUSTRIES = [
  "Solar & Renewable Energy",
  "Construction & Engineering",
  "Manufacturing",
  "Telecommunications",
  "Agriculture & Agribusiness",
  "Oil & Gas",
  "Mining",
  "Government & Public Sector",
  "Education",
  "Healthcare",
  "Hospitality & Tourism",
  "Retail & Wholesale",
  "Transportation & Logistics",
  "Real Estate",
  "Other",
];

const BUSINESS_TYPES = [
  "Private Limited Company (Ltd)",
  "Public Limited Company (PLC)",
  "Limited Liability Partnership (LLP)",
  "Sole Proprietorship",
  "Partnership",
  "Government Agency",
  "Non-Governmental Organization (NGO)",
  "Cooperative Society",
  "Other",
];

const PAYMENT_TERMS_OPTIONS = [
  "Immediate (Payment on Order)",
  "Net 15 Days",
  "Net 30 Days",
  "Net 45 Days",
  "Net 60 Days",
  "Net 90 Days",
  "Upon Delivery",
  "Negotiable",
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", password: "",
    companyName: "", companyType: "buyer", businessType: "", industry: "",
    address: "", city: "", state: "",
    taxId: "", businessRegistrationNumber: "",
    contactPersonName: "", contactPersonEmail: "", contactPersonPhone: "",
    requestedPaymentTerms: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [showIndustry, setShowIndustry] = useState(false);
  const [showBizType, setShowBizType] = useState(false);
  const [showPayTerms, setShowPayTerms] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName) e.firstName = "Required";
    if (!form.lastName) e.lastName = "Required";
    if (!form.email) e.email = "Required";
    if (form.password.length < 8) e.password = "Min 8 characters";
    if (!form.companyName) e.companyName = "Company name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const utm = getUTM();
      await api.register({ ...form, ...utm });
      fireConversion("CompleteRegistration", { value: 0, currency: "GHS" });
      setRegistered(true);
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const update = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: "" });
  };

  if (registered) {
    return (
      <div className="mx-auto flex min-h-[80dvh] max-w-lg flex-col justify-center px-4 py-10">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle size={32} weight="fill" className="text-emerald-600" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">Registration Submitted</h1>
          <div className="mx-auto mt-3 max-w-sm space-y-2 text-sm text-soft">
            <p>Thank you for registering your company with Bali-Can Limited.</p>
            <p>Your account is currently <strong>under review</strong>. Our team will verify your details and contact you at <strong className="text-ink">{form.email}</strong> once your account is approved.</p>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ClockCountdown size={18} weight="duotone" className="shrink-0 text-amber-600" />
            <span>Typical review time: <strong>24–48 hours</strong></span>
          </div>
          <Link href="/auth/login" className="btn btn-primary mt-8 w-full gap-2">
            Go to Sign In <ArrowRight size={16} weight="bold" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-2xl flex-col justify-center px-4 py-10">
      <div className="card p-8">
        <div className="mb-8 text-center">
           <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white text-lg font-bold">
             BC
           </div>
           <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">Create Business Account</h1>
           <p className="mt-1 text-sm text-soft">Register your company with Bali-Can Limited</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Company Information ── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Company Information</h2>
            <div className="space-y-4 rounded-lg border border-border bg-zinc-50 p-4">
              <div>
                <label className="input-label">Company Name <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Building size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                   <input value={form.companyName} onChange={(e) => update("companyName", e.target.value)} className="input pl-10" placeholder="Bali-Can Limited" />
                </div>
                {errors.companyName && <p className="input-error">{errors.companyName}</p>}
              </div>

              {/* ── Company Type ── */}
              <div>
                <label className="input-label mb-2">Account Type <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "buyer", label: "Buyer", icon: ShoppingCart, desc: "Purchase products & request quotes" },
                    { value: "supplier", label: "Supplier", icon: Toolbox, desc: "Sell products to buyers" },
                    { value: "service_provider", label: "Service Provider", icon: Handshake, desc: "Offer installation & services" },
                    { value: "both", label: "Both", icon: ArrowsLeftRight, desc: "Buy & sell on the platform" },
                  ].map((opt) => (
                    <button key={opt.value} type="button" onClick={() => update("companyType", opt.value)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                        form.companyType === opt.value
                          ? "border-accent bg-accent/5 ring-1 ring-accent"
                          : "border-border bg-white hover:border-accent/40"
                      }`}>
                      <opt.icon size={20} weight={form.companyType === opt.value ? "fill" : "regular"}
                        className={`mt-0.5 shrink-0 ${form.companyType === opt.value ? "text-accent" : "text-muted"}`} />
                      <div>
                        <p className="text-sm font-semibold text-ink">{opt.label}</p>
                        <p className="text-xs text-muted">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="input-label">Business Type</label>
                  <button type="button" onClick={() => setShowBizType(!showBizType)} className="input w-full text-left flex items-center justify-between">
                    <span className={form.businessType ? "text-ink" : "text-muted"}>{form.businessType || "Select type"}</span>
                    <CaretDown size={14} className="text-muted" />
                  </button>
                  {showBizType && (
                    <div className="absolute top-full left-0 z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                      {BUSINESS_TYPES.map((t) => (
                        <button key={t} type="button" onClick={() => { update("businessType", t); setShowBizType(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">{t}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="input-label">Industry</label>
                  <button type="button" onClick={() => setShowIndustry(!showIndustry)} className="input w-full text-left flex items-center justify-between">
                    <span className={form.industry ? "text-ink" : "text-muted"}>{form.industry || "Select industry"}</span>
                    <CaretDown size={14} className="text-muted" />
                  </button>
                  {showIndustry && (
                    <div className="absolute top-full left-0 z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                      {INDUSTRIES.map((ind) => (
                        <button key={ind} type="button" onClick={() => { update("industry", ind); setShowIndustry(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">{ind}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="input-label">Company Email</label>
                <div className="relative">
                  <Envelope size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="input pl-10" placeholder="company@example.com" />
                </div>
                {errors.email && <p className="input-error">{errors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Tax / VAT / GRA / TIN</label>
                  <div className="relative">
                    <IdentificationBadge size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.taxId} onChange={(e) => update("taxId", e.target.value)} className="input pl-10" placeholder="TIN number" />
                  </div>
                </div>
                <div>
                  <label className="input-label">Business Registration No.</label>
                  <div className="relative">
                    <Files size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.businessRegistrationNumber} onChange={(e) => update("businessRegistrationNumber", e.target.value)} className="input pl-10" placeholder="Reg number" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Company Address ── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Company Address</h2>
            <div className="space-y-4 rounded-lg border border-border bg-zinc-50 p-4">
              <div>
                <label className="input-label">Street Address</label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={form.address} onChange={(e) => update("address", e.target.value)} className="input pl-10" placeholder="123 Business Road" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">City</label>
                  <input value={form.city} onChange={(e) => update("city", e.target.value)} className="input" placeholder="Accra" />
                </div>
                <div>
                  <label className="input-label">State / Region</label>
                  <input value={form.state} onChange={(e) => update("state", e.target.value)} className="input" placeholder="Greater Accra" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Contact Person ── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Contact Person</h2>
            <div className="space-y-4 rounded-lg border border-border bg-zinc-50 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">First Name <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className="input pl-10" placeholder="John" />
                  </div>
                  {errors.firstName && <p className="input-error">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="input-label">Last Name <span className="text-red-500">*</span></label>
                  <input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className="input" placeholder="Doe" />
                  {errors.lastName && <p className="input-error">{errors.lastName}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">Contact Email</label>
                  <div className="relative">
                    <Envelope size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input type="email" value={form.contactPersonEmail || form.email} onChange={(e) => update("contactPersonEmail", e.target.value)} className="input pl-10" placeholder="contact@company.com" />
                  </div>
                </div>
                <div>
                  <label className="input-label">Contact Phone</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input type="tel" value={form.contactPersonPhone || form.phone} onChange={(e) => update("contactPersonPhone", e.target.value)} className="input pl-10" placeholder="+233 000 000 000" />
                  </div>
                </div>
              </div>
              <div>
                <label className="input-label">Your Phone (for account)</label>
                <div className="relative">
                  <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input pl-10" placeholder="+233 000 000 000" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Payment Terms & Password ── */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Account Setup</h2>
            <div className="space-y-4 rounded-lg border border-border bg-zinc-50 p-4">
              <div className="relative">
                <label className="input-label">Requested Payment Terms</label>
                <button type="button" onClick={() => setShowPayTerms(!showPayTerms)} className="input w-full text-left flex items-center justify-between">
                  <span className={form.requestedPaymentTerms ? "text-ink" : "text-muted"}>{form.requestedPaymentTerms || "Select payment terms"}</span>
                  <CaretDown size={14} className="text-muted" />
                </button>
                {showPayTerms && (
                  <div className="absolute top-full left-0 z-20 mt-1 w-full overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
                    {PAYMENT_TERMS_OPTIONS.map((pt) => (
                      <button key={pt} type="button" onClick={() => { update("requestedPaymentTerms", pt); setShowPayTerms(false); }} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">{pt}</button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="input-label">Password <span className="text-red-500">*</span></label>
                <div className="relative">
                  <LockKey size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} className="input pl-10" placeholder="Min 8 characters" minLength={8} />
                </div>
                {errors.password && <p className="input-error">{errors.password}</p>}
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
            {submitting ? "Submitting registration..." : "Register Your Company"}
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-soft">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-accent hover:text-accent-bold">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
