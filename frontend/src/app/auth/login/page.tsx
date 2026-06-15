"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";
import { ArrowRight, Envelope, LockKey } from "@phosphor-icons/react";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
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
      const user = await login(email, password);
      toast.success("Welcome back");
      // Route based on role and verification needs
      if (user?.role === "super_admin") {
        router.push("/super-admin");
      } else if (user?.role === "admin") {
        router.push("/admin");
      } else if ((user as any)?.is_provider && ["pending", "not_started", "required", "changes_requested"].includes((user as any)?.verification_status)) {
        router.push("/provider/verification");
      } else {
        router.push((user as any)?.is_provider ? "/provider" : "/products");
      }
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-4">
      <div className="card p-8">
        <div className="mb-8 text-center">
           <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white text-lg font-bold">
             BC
           </div>
           <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
           <p className="mt-1 text-sm text-soft">Sign in to your Bali-Can account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="input-label">Email</label>
            <div className="relative">
              <Envelope size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-10" placeholder="you@company.com" />
            </div>
            {errors.email && <p className="input-error">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="login-password" className="input-label">Password</label>
            <div className="relative">
              <LockKey size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-10" placeholder="Enter your password" />
            </div>
            {errors.password && <p className="input-error">{errors.password}</p>}
          </div>
          <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-soft">
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="font-medium text-accent hover:text-accent-bold">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
