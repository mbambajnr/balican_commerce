"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import toast from "react-hot-toast";
import ProviderReadinessCard from "@/components/ProviderReadinessCard";
import { Package, Wrench as WrenchIcon, FileText, CalendarCheck, ArrowRight, IdentificationCard } from "@phosphor-icons/react";

const statIcons: Record<string, any> = {
  products: Package,
  services: WrenchIcon,
  orders: FileText,
  jobs: CalendarCheck,
};

const statLabels: Record<string, string> = {
  products: "Products",
  services: "Services",
  orders: "Orders",
  jobs: "Service Jobs",
};

const statColours: Record<string, string> = {
  products: "bg-blue-50 text-blue-600",
  services: "bg-violet-50 text-violet-600",
  orders: "bg-emerald-50 text-emerald-600",
  jobs: "bg-amber-50 text-amber-600",
};

export default function ProviderDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [recentProducts, setRecentProducts] = useState<any[]>([]);
  const [recentServices, setRecentServices] = useState<any[]>([]);
  const [businessProfile, setBusinessProfile] = useState<any>(null);
  const [opportunityInsights, setOpportunityInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getProviderDashboard();
        setStats(res.stats);
        setRecentProducts(res.recentProducts || []);
        setRecentServices(res.recentServices || []);
        setBusinessProfile(res.businessProfile);
        setOpportunityInsights(res.opportunityInsights);
      } catch {
        toast.error("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Provider Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Manage your products, services, and inventory</p>
      </div>

      {businessProfile && !businessProfile.complete && (
        <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><IdentificationCard size={21} weight="duotone" /></div>
          <div className="flex-1"><p className="text-sm font-semibold text-amber-950">Complete your company profile</p><p className="mt-0.5 text-xs text-amber-800">Required for Balican Verified: {businessProfile.missingFields.map((field: any) => field.label).join(", ")}.</p></div>
          <Link href="/account/company-profile?returnTo=%2Fprovider" className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-amber-900">Complete profile <ArrowRight size={15} /></Link>
        </div>
      )}

      <ProviderReadinessCard insights={opportunityInsights} businessProfile={businessProfile} />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats && Object.entries(stats).map(([key, value]) => {
          const Icon = statIcons[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-white p-5 transition-all hover:shadow-md sm:p-6">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${statColours[key] || "bg-gray-50"}`}>
                {Icon && <Icon size={20} weight="duotone" />}
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-ink">{value as number}</p>
              <p className="mt-0.5 text-xs text-muted">{statLabels[key] || key}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink">Recent Products</h2>
            <Link href="/provider/products" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          {recentProducts.length === 0 ? (
            <p className="text-sm text-muted">No products yet.</p>
          ) : (
            <div className="space-y-3">
              {recentProducts.map((p: any) => (
                <Link key={p.id} href={`/provider/products/${p.id}/edit`} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 text-sm hover:bg-surface/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{p.name}</p>
                    <p className="text-xs text-muted">SKU: {p.sku || "—"}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {p.is_active ? "Active" : "Inactive"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink">Recent Services</h2>
            <Link href="/provider/services" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              View All <ArrowRight size={14} />
            </Link>
          </div>
          {recentServices.length === 0 ? (
            <p className="text-sm text-muted">No services yet.</p>
          ) : (
            <div className="space-y-3">
              {recentServices.map((s: any) => (
                <Link key={s.id} href={`/provider/services/${s.id}/edit`} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 text-sm hover:bg-surface/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{s.name}</p>
                    <p className="text-xs text-muted">{s.pricing_model || "—"}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
