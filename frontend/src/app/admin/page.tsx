"use client";

import { useEffect, useState, createElement } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, FileText, CalendarCheck, Users, ArrowRight,
  Tag, ClipboardText, CurrencyNgn, TrendUp, Bell, Plus,
  Clock, DotsThree, Building, Handshake, Storefront
} from "@phosphor-icons/react";
import { CardSkeleton } from "@/components/admin/LoadingSkeleton";
import EmptyState from "@/components/admin/EmptyState";
import StatusBadge from "@/components/admin/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";

const statIcons: Record<string, any> = {
  totalOrders: ShoppingBag,
  totalRfqs: FileText,
  totalBookings: CalendarCheck,
  totalCustomers: Users,
  totalCompanies: Building,
  pendingCompanies: Clock,
  totalProviders: Handshake,
  totalBuyers: Storefront,
  creditOrders: CurrencyNgn,
};

const statLabels: Record<string, string> = {
  totalOrders: "Total Orders",
  totalRfqs: "RFQs Received",
  totalBookings: "Service Bookings",
  totalCustomers: "Customers",
  totalCompanies: "Companies",
  pendingCompanies: "Pending Approvals",
  totalProviders: "Providers",
  totalBuyers: "Buyers",
  creditOrders: "Credit Orders",
};

const statColours: Record<string, string> = {
  totalOrders: "bg-blue-50 text-blue-600",
  totalRfqs: "bg-violet-50 text-violet-600",
  totalBookings: "bg-emerald-50 text-emerald-600",
  totalCustomers: "bg-amber-50 text-amber-600",
  totalCompanies: "bg-indigo-50 text-indigo-600",
  pendingCompanies: "bg-orange-50 text-orange-600",
  totalProviders: "bg-teal-50 text-teal-600",
  totalBuyers: "bg-sky-50 text-sky-600",
  creditOrders: "bg-cyan-50 text-cyan-600",
};

function StatCard({ label, value, icon, color, href }: any) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-xl border border-border bg-white p-5 transition-all hover:shadow-md hover:border-accent/20 sm:p-6"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        {createElement(icon, { size: 20, weight: "duotone" })}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
      <ArrowRight
        size={14}
        className="absolute bottom-5 right-5 text-muted/0 transition-all group-hover:text-muted group-hover:translate-x-0.5 sm:bottom-6 sm:right-6"
      />
    </Link>
  );
}

function FinCard({ label, value, icon, color, href, trend }: any) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-xl border border-border bg-white p-5 transition-all hover:shadow-md hover:border-accent/20 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          {createElement(icon, { size: 20, weight: "duotone" })}
        </div>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
          <TrendUp size={10} weight="bold" />
          {trend}%
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
      <ArrowRight
        size={14}
        className="absolute bottom-5 right-5 text-muted/0 transition-all group-hover:text-muted group-hover:translate-x-0.5 sm:bottom-6 sm:right-6"
      />
    </Link>
  );
}

function EmptyChart() {
  return (
    <div className="relative flex h-full w-full items-end justify-between gap-px px-1 pb-6 pt-10 sm:gap-0.5 sm:px-2">
      <div className="absolute inset-0 flex flex-col justify-between pb-6 pt-10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-t border-dashed border-border/60" />
        ))}
      </div>
      {[35, 55, 42, 68, 50, 72, 60, 45, 80, 62, 48, 70].map((h, i) => (
        <div key={i} className="relative z-10 flex w-full flex-col items-end justify-end">
          <div
            className="w-full rounded-[3px] bg-gradient-to-t from-accent/40 to-accent/5 transition-all hover:from-accent/60"
            style={{ height: `${h}%` }}
          />
        </div>
      ))}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1 text-[10px] text-muted sm:px-2">
        <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span>
        <span>May</span><span>Jun</span><span>Jul</span><span>Aug</span>
        <span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) {
      router.push("/admin/login");
      return;
    }
    if (user?.role === "admin" || user?.role === "super_admin") {
      api.getDashboard().then(setData).catch(() => {});
    }
  }, [user, authLoading, router]);

  if (authLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 h-8 w-48 skeleton rounded-lg" />
        <CardSkeleton count={5} />
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-80 skeleton rounded-xl" />
          <div className="h-80 skeleton rounded-xl" />
        </div>
      </div>
    );
  }

  const primaryStats = [
    { key: "totalOrders", value: data.stats.totalOrders, href: "/admin/orders" },
    { key: "totalRfqs", value: data.stats.totalRfqs, href: "/admin/rfqs" },
    { key: "totalBookings", value: data.stats.totalBookings, href: "/admin/bookings" },
    { key: "totalCompanies", value: data.stats.totalCompanies, href: "/admin/companies" },
    { key: "pendingCompanies", value: data.stats.pendingCompanies, href: "/admin/companies?status=pending" },
  ];

  const companyStats = [
    { key: "totalProviders", value: data.stats.totalProviders, href: "/admin/companies?companyType=supplier" },
    { key: "totalBuyers", value: data.stats.totalBuyers, href: "/admin/companies?companyType=buyer" },
  ];

  const financialStats = [
    {
      label: "Outstanding Balance",
      value: formatCurrency(data.stats.totalOutstanding),
      icon: CurrencyNgn,
      color: "bg-red-50 text-red-500",
      href: "/admin/orders",
      trend: "+12",
    },
    {
      label: "Total Credit",
      value: formatCurrency(data.stats.creditTotal),
      icon: CurrencyNgn,
      color: "bg-emerald-50 text-emerald-600",
      href: "/admin/orders",
      trend: "+5",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {user?.first_name || "Admin"}
          </h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s what&apos;s happening with your store today.</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-zinc-50 hover:text-ink">
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          <div className="h-6 w-px bg-border" />
          <Link href="/admin/products/new" className="btn btn-primary btn-sm gap-1.5">
            <Plus size={15} weight="bold" />
            Add Product
          </Link>
          <Link href="/admin/orders" className="btn btn-sm gap-1.5 border-border text-soft hover:text-ink">
            View Orders
          </Link>
        </div>
      </div>

      {/* ── Primary Metrics ── */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {primaryStats.map((s, i) => (
            <div key={s.key} className="animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <StatCard
                label={statLabels[s.key]}
                value={s.value}
                icon={statIcons[s.key]}
                color={statColours[s.key]}
                href={s.href}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Company Breakdown ── */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
          {companyStats.map((s, i) => (
            <div key={s.key} className="animate-fade-up" style={{ animationDelay: `${500 + i * 80}ms` }}>
              <StatCard
                label={statLabels[s.key]}
                value={s.value}
                icon={statIcons[s.key]}
                color={statColours[s.key]}
                href={s.href}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Financial Row ── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {financialStats.map((s, i) => (
          <div key={s.label} className="animate-fade-up" style={{ animationDelay: `${580 + i * 80}ms` }}>
            <FinCard
              label={s.label}
              value={s.value}
              icon={s.icon}
              color={s.color}
              href={s.href}
              trend={s.trend}
            />
          </div>
        ))}
      </div>

      {/* ── Charts + Activity ── */}
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        {/* Sales Overview */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">Sales Overview</h3>
              <p className="mt-0.5 text-xs text-muted">Monthly revenue for the current year</p>
            </div>
            <select className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-soft outline-none focus:border-accent">
              <option>This Year</option>
              <option>Last Year</option>
            </select>
          </div>
          <div className="h-56 px-5 pb-3 sm:px-6">
            <EmptyChart />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-border bg-white">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">Recent Activity</h3>
              <p className="mt-0.5 text-xs text-muted">Latest actions from your store</p>
            </div>
            <DotsThree size={18} className="text-muted" />
          </div>
          {data.recentOrders.length === 0 && data.pendingRfqs.length === 0 ? (
            <div className="px-5 py-12 sm:px-6">
              <EmptyState icon="default" title="No activity yet" description="Actions will appear here as customers interact." />
            </div>
          ) : (
            <div className="divide-y divide-border text-sm">
              {data.recentOrders.slice(0, 4).map((o: any) => (
                <div key={o.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0">
                    <ShoppingBag size={14} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-ink">{o.order_number}</p>
                    <p className="text-xs text-muted">Order placed</p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              ))}
              {data.pendingRfqs.slice(0, 2).map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-50 text-violet-600 shrink-0">
                    <FileText size={14} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-ink">{r.first_name} {r.last_name}</p>
                    <p className="truncate text-xs text-muted">{r.product_name || "RFQ"}</p>
                  </div>
                  <StatusBadge status="pending" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Manage ── */}
      <div>
        <h3 className="mb-4 font-display text-sm font-semibold text-ink">Quick Manage</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          <Link
            href="/admin/products"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <Tag size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Products</p>
              <p className="text-xs text-muted">Manage items</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/categories"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <Tag size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Categories</p>
              <p className="text-xs text-muted">Organize catalog</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/orders"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <ShoppingBag size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Orders</p>
              <p className="text-xs text-muted">Fulfill &amp; track</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/rfqs"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 shrink-0">
              <ClipboardText size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">RFQs</p>
              <p className="text-xs text-muted">Review &amp; quote</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/quotations"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0">
              <FileText size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Quotations</p>
              <p className="text-xs text-muted">Manage quotes</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/bookings"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0">
              <CalendarCheck size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Bookings</p>
              <p className="text-xs text-muted">Schedules</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/companies"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
              <Building size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Companies</p>
              <p className="text-xs text-muted">B2B accounts</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/customers"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 shrink-0">
              <Users size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Customers</p>
              <p className="text-xs text-muted">CRM &amp; credit</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
          <Link
            href="/admin/analytics"
            className="group flex items-center gap-3 rounded-xl border border-border bg-white p-5 transition-all hover:border-accent/20 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 shrink-0">
              <TrendUp size={18} weight="duotone" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">Analytics</p>
              <p className="text-xs text-muted">Reports</p>
            </div>
            <ArrowRight size={14} className="text-muted/0 transition-all group-hover:text-muted shrink-0" />
          </Link>
        </div>
      </div>
    </div>
  );
}
