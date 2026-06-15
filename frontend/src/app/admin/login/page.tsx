"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import toast from "react-hot-toast";
import { ArrowRight, Envelope, LockKey, ShieldCheck } from "@phosphor-icons/react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (!email) { setErrors((e) => ({ ...e, email: "Email is required" })); return; }
    if (!password) { setErrors((e) => ({ ...e, password: "Password is required" })); return; }
    setSubmitting(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error("Session creation failed");
      toast.success("Welcome back, admin");
      window.location.href = "/admin";
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="card border-2 border-accent/20 p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg shadow-accent/25">
            <ShieldCheck size={28} weight="fill" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">Admin Portal</h1>
          <p className="mt-1 text-sm text-soft">Sign in to manage Bali-Can Limited</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="admin-login-email" className="input-label">Admin email</label>
            <div className="relative">
              <Envelope size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="admin-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-10" placeholder="admin@company.com" />
            </div>
            {errors.email && <p className="input-error">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="admin-login-password" className="input-label">Password</label>
            <div className="relative">
              <LockKey size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="admin-login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-10" placeholder="Enter your password" />
            </div>
            {errors.password && <p className="input-error">{errors.password}</p>}
          </div>
          <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
            {submitting ? "Verifying..." : "Sign in to Admin"}
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-soft">
          Not an admin?{" "}
          <Link href="/admin/register" className="font-medium text-accent hover:text-accent-bold">Register as admin</Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted">
          <Link href="/auth/login" className="hover:text-accent">Customer sign in</Link>
        </p>
      </div>
    </div>
  );
}
