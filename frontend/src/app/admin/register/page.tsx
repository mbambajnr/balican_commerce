"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ArrowRight, User, Envelope, Phone, LockKey, ShieldCheck, Key } from "@phosphor-icons/react";

export default function AdminRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", adminKey: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName) e.firstName = "Required";
    if (!form.lastName) e.lastName = "Required";
    if (!form.email) e.email = "Required";
    if (form.password.length < 8) e.password = "Min 8 characters";
    if (!form.adminKey) e.adminKey = "Admin key is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.post("/auth/admin-register", {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        adminKey: form.adminKey,
      });
      const result = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      if (result?.error) throw new Error("Session creation failed");
      toast.success("Admin account created");
      window.location.href = "/admin";
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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="card border-2 border-accent/20 p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/25">
            <ShieldCheck size={28} weight="fill" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">Register Admin</h1>
          <p className="mt-1 text-sm text-soft">Create an admin account for Bali-Can Limited</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">First name</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className="input pl-10" placeholder="John" />
              </div>
              {errors.firstName && <p className="input-error">{errors.firstName}</p>}
            </div>
            <div>
              <label className="input-label">Last name</label>
              <input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className="input" placeholder="Doe" />
              {errors.lastName && <p className="input-error">{errors.lastName}</p>}
            </div>
          </div>
          <div>
            <label className="input-label">Email</label>
            <div className="relative">
              <Envelope size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="input pl-10" placeholder="admin@company.com" />
            </div>
            {errors.email && <p className="input-error">{errors.email}</p>}
          </div>
          <div>
            <label className="input-label">Phone (optional)</label>
            <div className="relative">
              <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input pl-10" placeholder="+234 800 000 0000" />
            </div>
          </div>
          <div>
            <label className="input-label">Password</label>
            <div className="relative">
              <LockKey size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} className="input pl-10" placeholder="Min 8 characters" minLength={8} />
            </div>
            {errors.password && <p className="input-error">{errors.password}</p>}
          </div>
          <div>
            <label className="input-label">Admin Secret Key</label>
            <div className="relative">
              <Key size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input type="password" value={form.adminKey} onChange={(e) => update("adminKey", e.target.value)} className="input pl-10" placeholder="Enter the admin secret key" />
            </div>
            {errors.adminKey && <p className="input-error">{errors.adminKey}</p>}
          </div>
          <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
            {submitting ? "Creating admin account..." : "Register as Admin"}
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-soft">
          Already an admin?{" "}
          <Link href="/admin/login" className="font-medium text-accent hover:text-accent-bold">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
