"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/auth/login");
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setRole(payload.role);
      if (payload.role !== "super_admin") {
        router.push("/");
        return;
      }
    } catch {
      router.push("/auth/login");
    }
    setLoading(false);
  }, [router]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>;
  }

  if (role !== "super_admin") return null;

  const navItems = [
    { href: "/super-admin", label: "Dashboard", icon: "📊" },
    { href: "/super-admin/companies", label: "Companies", icon: "🏢" },
    { href: "/super-admin/documents", label: "Verification", icon: "📄" },
    { href: "/super-admin/audit-logs", label: "Audit Logs", icon: "📋" },
    { href: "/super-admin/plans", label: "Plans & Subscriptions", icon: "📦" },
  ];

  const isActive = (href: string) => {
    if (href === "/super-admin") return pathname === "/super-admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-navy text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="font-bold text-lg">Platform Operator</span>
              <div className="hidden md:flex gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm transition-colors ${
                      isActive(item.href) ? "bg-white/20 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
            <Link href="/" className="text-sm text-white/60 hover:text-white transition-colors">
              ← Back to Site
            </Link>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
