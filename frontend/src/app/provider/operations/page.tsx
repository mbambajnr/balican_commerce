"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  Tray, CurrencyCircleDollar, CheckCircle, Prohibit,
  FileText, Package, Wrench, User, ArrowRight,
  ShieldCheck, Warning,
} from "@phosphor-icons/react";

type Summary = {
  incomingRequests: number;
  quotedCount: number;
  acceptedCount: number;
  declinedCount: number;
  creditProfile: {
    vetting_status: string;
    credit_tier: string;
    credit_limit: number;
    next_review_at: string;
  } | null;
};

const cardConfig = [
  {
    key: "incomingRequests",
    label: "Incoming Requests",
    desc: "Awaiting your response",
    icon: Tray,
    color: "bg-blue-50 text-blue-600",
    href: "/provider/procurement",
  },
  {
    key: "quotedCount",
    label: "Quotes Submitted",
    desc: "Awaiting buyer decision",
    icon: CurrencyCircleDollar,
    color: "bg-amber-50 text-amber-600",
    href: "/provider/procurement",
  },
  {
    key: "acceptedCount",
    label: "Accepted Quotes",
    desc: "Won procurement",
    icon: CheckCircle,
    color: "bg-emerald-50 text-emerald-600",
    href: "/provider/procurement",
  },
  {
    key: "declinedCount",
    label: "Declined Quotes",
    desc: "Not selected",
    icon: Prohibit,
    color: "bg-red-50 text-red-600",
    href: "/provider/procurement",
  },
];

const creditLabels: Record<string, string> = {
  approved: "Approved",
  pending_review: "Under Review",
  unrated: "Not Assessed",
  rejected: "Rejected",
};

const creditColors: Record<string, string> = {
  approved: "text-emerald-600 bg-emerald-50",
  pending_review: "text-amber-600 bg-amber-50",
  unrated: "text-gray-500 bg-gray-100",
  rejected: "text-red-600 bg-red-50",
};

const tierColors: Record<string, string> = {
  premium: "text-amber-600 bg-amber-50",
  standard: "text-blue-600 bg-blue-50",
  basic: "text-gray-600 bg-gray-100",
  unrated: "text-gray-400 bg-gray-50",
};

const quickLinks = [
  { label: "Procurement Requests", href: "/provider/procurement", icon: FileText },
  { label: "Products", href: "/provider/products", icon: Package },
  { label: "Services", href: "/provider/services", icon: Wrench },
  { label: "Profile", href: "/provider/profile", icon: User },
];

export default function ProviderOperationsPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProviderOperationsSummary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-ink">Operations</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">Operations</h1>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cardConfig.map(cfg => {
          const value = data ? (data as any)[cfg.key] : 0;
          return (
            <Link
              key={cfg.key}
              href={cfg.href}
              className="group relative flex flex-col rounded-xl border border-border bg-white p-5 transition-all hover:shadow-md hover:border-accent/20 sm:p-6"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${cfg.color}`}>
                <cfg.icon size={20} weight="duotone" />
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-ink">{value}</p>
              <p className="mt-0.5 text-xs text-muted">{cfg.label}</p>
              <p className="text-[10px] text-soft">{cfg.desc}</p>
              <ArrowRight size={14} className="absolute right-4 top-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      {/* Credit Status */}
      <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Supplier Credit</h2>
        {data?.creditProfile ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-muted" />
              <span className="text-sm text-ink">Status:</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${creditColors[data.creditProfile.vetting_status] || "bg-gray-100 text-gray-600"}`}>
                {creditLabels[data.creditProfile.vetting_status] || data.creditProfile.vetting_status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Warning size={18} className="text-muted" />
              <span className="text-sm text-ink">Tier:</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tierColors[data.creditProfile.credit_tier] || "bg-gray-100 text-gray-600"}`}>
                {data.creditProfile.credit_tier}
              </span>
            </div>
            {data.creditProfile.credit_limit > 0 && (
              <div className="text-sm text-muted">
                Limit: <span className="font-medium text-ink">GH₵{data.creditProfile.credit_limit.toLocaleString()}</span>
              </div>
            )}
            {data.creditProfile.vetting_status === "approved" && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">Credit Active</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-soft">No credit profile yet. Contact admin for assessment.</p>
        )}
      </div>

      {/* Quick links */}
      <div className="rounded-xl border border-border bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          {quickLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-ink hover:bg-surface transition-colors"
            >
              <link.icon size={16} /> {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
