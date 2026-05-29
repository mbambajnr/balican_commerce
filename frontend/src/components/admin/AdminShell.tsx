"use client";

import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Layout, Package, FileText, Wrench, CurrencyCircleDollar,
  Bank, CreditCard, Clock, Users, Tag, ChartBar, SignOut, Building,
} from "@phosphor-icons/react";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: Layout },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Categories", href: "/admin/categories", icon: Tag },
  { label: "Orders", href: "/admin/orders", icon: FileText },
  { label: "RFQs", href: "/admin/rfqs", icon: FileText },
  { label: "Quotations", href: "/admin/quotations", icon: FileText },
  { label: "Payments", href: "/admin/payments", icon: CurrencyCircleDollar },
  { label: "Bank Transfers", href: "/admin/bank-transfers", icon: Bank },
  { label: "Bookings", href: "/admin/bookings", icon: Wrench },
  { label: "Credit Customers", href: "/admin/credit-customers", icon: CreditCard },
  { label: "Overdue Orders", href: "/admin/overdue-orders", icon: Clock },
  { label: "Companies", href: "/admin/companies", icon: Building },
  { label: "Customers", href: "/admin/customers", icon: Users },
  { label: "Analytics", href: "/admin/analytics", icon: ChartBar },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/admin/login" || pathname === "/admin/register") {
    return <>{children}</>;
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push("/admin/login");
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
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden lg:flex lg:w-64 flex-col border-r border-white/10 bg-navy">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
          <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">S</div>
          <span className="font-semibold text-sm text-white">Admin Panel</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive(item.href) ? "bg-accent/10 text-accent font-medium" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <button
            onClick={() => { logout(); router.push("/admin/login"); }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
          >
            <SignOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="lg:hidden flex h-14 items-center gap-3 border-b border-white/10 bg-navy px-4">
          <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-xs">S</div>
          <span className="font-semibold text-sm text-white">Admin</span>
          <div className="ml-auto flex gap-2">
            <Link href="/admin/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3.5 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/10">Login</Link>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
