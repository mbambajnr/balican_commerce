"use client";

import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  House, Package, Wrench, Wrench as WrenchIcon,
  User, Clipboard, SignOut, ShoppingBagOpen, FileText,
  ChartBar, TrendUp, MagnifyingGlass, ShieldCheck, CurrencyCircleDollar, List, X,
} from "@phosphor-icons/react";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { label: "Dashboard", href: "/provider", icon: House },
  { label: "Opportunities", href: "/provider/opportunities", icon: MagnifyingGlass },
  { label: "Agreements", href: "/agreements", icon: FileText },
  { label: "Operations", href: "/provider/operations", icon: ChartBar },
  { label: "Commissions", href: "/provider/commissions", icon: CurrencyCircleDollar },
  { label: "Products", href: "/provider/products", icon: Package },
  { label: "Services", href: "/provider/services", icon: Wrench },
  { label: "Inventory", href: "/provider/inventory", icon: Clipboard },
  { label: "Profile", href: "/provider/profile", icon: User },
  { label: "Verification", href: "/provider/verification", icon: ShieldCheck },
  { label: "Procurement", href: "/provider/procurement", icon: FileText },
  { label: "Activity", href: "/provider/procurement/activity", icon: ChartBar },
  { label: "My Ranking", href: "/provider/ranking", icon: TrendUp },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [companyName, setCompanyName] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
      return;
    }
    if (user) {
      api.getProviderProfile().then(r => setCompanyName(r.company?.name || "")).catch(() => {});
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const isActive = (href: string) => {
    if (href === "/provider") return pathname === "/provider";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-surface lg:flex">
      <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-border bg-white px-4 lg:hidden">
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{companyName || "Provider"}</p><p className="text-xs text-muted">Provider workspace</p></div>
        <button type="button" onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-ink" aria-label="Open provider navigation"><List size={22} /></button>
      </header>
      {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-navy/55 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close provider navigation" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(19rem,85vw)] flex-col border-r border-border bg-white transition-transform lg:static lg:z-auto lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-16" : "lg:w-60"}`}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">P</div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{companyName || "Provider"}</p>
              <p className="truncate text-xs text-muted">Dashboard</p>
            </div>
          )}
          <button onClick={() => setMobileOpen(false)} className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface lg:hidden" aria-label="Close provider navigation"><X size={20} /></button>
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto hidden h-11 w-11 items-center justify-center rounded text-muted hover:bg-surface lg:flex">
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
              <path d={collapsed ? "M181.66 133.66l-80 80a8 8 0 01-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0111.32-11.32l80 80a8 8 0 010 11.32z" : "M90.34 133.66l80-80a8 8 0 0111.32 11.32L107.31 128l74.35 74.34a8 8 0 01-11.32 11.32l-80-80a8 8 0 010-11.32z"} />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-surface hover:text-ink"
              }`}
            >
              <item.icon size={20} weight={isActive(item.href) ? "fill" : "regular"} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-2 space-y-1">
          {!collapsed && <NotificationBell />}
          <button
            onClick={() => { logout(); router.push("/auth/login"); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            <SignOut size={20} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
