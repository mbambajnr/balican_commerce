"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { List, X, User, ArrowRight, ShoppingBag, FileText, Building, MagnifyingGlass } from "@phosphor-icons/react";
import NotificationBell from "@/components/NotificationBell";

export default function Navbar() {
  const pathname = usePathname();
  const isAdminAuth = pathname.startsWith("/admin/login") || pathname.startsWith("/admin/register");
  const { data: session, status } = useSession();
  const user = session?.user as any;
  const loading = status === "loading";
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={isAdminAuth ? "/admin/login" : "/"} className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-ink text-xs font-bold tracking-tight">
            BC
           </div>
           <span className="font-display text-lg font-semibold tracking-tight text-white">
             Bali-Can
           </span>
        </Link>

        {!isAdminAuth && (
          <nav className="hidden items-center gap-8 md:flex">
            <Link href="/marketplace" className="text-sm text-zinc-300 transition-colors hover:text-white">
              Marketplace
            </Link>
            <Link href="/products" className="text-sm text-zinc-300 transition-colors hover:text-white">
              Products
            </Link>
            <Link href="/rfq/new" className="text-sm text-zinc-300 transition-colors hover:text-white">
              Request Quote
            </Link>
            {(user?.role === "admin" || user?.role === "super_admin") && (
              <Link href="/admin" className="text-sm text-zinc-300 transition-colors hover:text-white">
                Admin
              </Link>
            )}
            {user && (
              <Link href={(user as any)?.is_provider ? "/scout/available" : "/scout"} className="text-sm text-zinc-300 transition-colors hover:text-white">
                Scout
              </Link>
            )}
            {(user as any)?.is_provider && (
              <Link href="/provider" className="text-sm text-zinc-300 transition-colors hover:text-white">
                Provider Dashboard
              </Link>
            )}
          </nav>
        )}

        {!isAdminAuth && (
          <div className="hidden items-center gap-3 md:flex">
            {loading ? (
              <div className="h-8 w-20 skeleton" />
            ) : user ? (
              <>
                {(user as any)?.company_name && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-navy-light px-3 py-1.5 text-xs font-medium text-zinc-300">
                    <Building size={14} />
                    {(user as any).company_name}
                  </div>
                )}
                <NotificationBell />
                <Link href="/account" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-white/10">
                  <User size={16} />
                  Account
                </Link>
                <button onClick={() => signOut()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-white/10 active:scale-[0.97]">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-white/10 active:scale-[0.97]">
                  Login
                </Link>
                <Link href="/auth/register" className="btn btn-primary btn-sm">
                  Register Company
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </>
            )}
          </div>
        )}

        {!isAdminAuth && (
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex items-center justify-center md:hidden text-white"
          >
            {mobileOpen ? <X size={24} /> : <List size={24} />}
          </button>
        )}
      </div>

      {mobileOpen && !isAdminAuth && (
        <div className="border-t border-white/10 bg-navy px-4 pb-6 pt-4 md:hidden">
          <nav className="flex flex-col gap-3">
            <Link href="/products" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setMobileOpen(false)}>
              <ShoppingBag size={18} /> Products
            </Link>
            <Link href="/rfq/new" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setMobileOpen(false)}>
              <FileText size={18} /> Request Quote
            </Link>
            {(user?.role === "admin" || user?.role === "super_admin") && (
              <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setMobileOpen(false)}>
                Admin
              </Link>
            )}
            {user && (
              <Link href={(user as any)?.is_provider ? "/scout/available" : "/scout"} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setMobileOpen(false)}>
                <MagnifyingGlass size={18} /> Scout
              </Link>
            )}
            {(user as any)?.is_provider && (
              <Link href="/provider" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setMobileOpen(false)}>
                Provider Dashboard
              </Link>
            )}
            <hr className="my-2 border-white/10" />
            {user ? (
              <>
                <Link href="/account" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.97]" onClick={() => setMobileOpen(false)}>Account</Link>
                <button onClick={() => { signOut(); setMobileOpen(false); }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.97]">Logout</button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10 active:scale-[0.97]" onClick={() => setMobileOpen(false)}>Login</Link>
                <Link href="/auth/register" className="btn btn-primary" onClick={() => setMobileOpen(false)}>Get Started</Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
