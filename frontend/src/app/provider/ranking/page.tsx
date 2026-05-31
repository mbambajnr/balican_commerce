"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  TrendUp,
  ShieldCheck,
  CheckCircle,
  Circle,
  ArrowRight,
  Hourglass,
  Package,
  UserCircle,
  Star,
  Warning,
} from "@phosphor-icons/react";

type ScoreComponent = { score: number; max: number; label: string };
type ScoreBreakdown = {
  credit: ScoreComponent;
  responseRate: ScoreComponent;
  responseSpeed: ScoreComponent;
  completedOrders: ScoreComponent;
  profileCompleteness: ScoreComponent;
};
type TrustSignals = {
  creditTier: string;
  creditStatus: string;
  quoteResponseRate: number | null;
  averageResponseHours: number | null;
  completedProcurementOrders: number;
  profileCompleteness: number;
};
type ScoreResult = {
  supplierScore: number;
  scoreBreakdown: ScoreBreakdown;
  trustSignals: TrustSignals;
};

const BREAKDOWN_META: { key: keyof ScoreBreakdown; label: string; icon: any; tip: string; href?: string }[] = [
  {
    key: "credit",
    label: "Credit Standing",
    icon: ShieldCheck,
    tip: "Maintain approved credit status and aim for Premium tier.",
    href: "/provider/operations",
  },
  {
    key: "responseRate",
    label: "Quote Response Rate",
    icon: CheckCircle,
    tip: "Respond to every procurement request you're invited to, even with a decline.",
    href: "/provider/procurement",
  },
  {
    key: "responseSpeed",
    label: "Response Speed",
    icon: Hourglass,
    tip: "Respond within 2 hours to earn the maximum speed score.",
    href: "/provider/procurement",
  },
  {
    key: "completedOrders",
    label: "Completed Orders",
    icon: Package,
    tip: "Win procurement requests and fulfil them to build your track record.",
    href: "/provider/procurement",
  },
  {
    key: "profileCompleteness",
    label: "Profile Completeness",
    icon: UserCircle,
    tip: "Fill in your description, website, logo, city, phone, experience, certifications, and service areas.",
    href: "/provider/profile",
  },
];

const CHECKLIST = [
  { label: "Complete your company profile (description, logo, website, phone)", href: "/provider/profile" },
  { label: "Add certifications and service areas to your profile", href: "/provider/profile" },
  { label: "Add products and keep your catalog updated", href: "/provider/products" },
  { label: "Respond to every RFQ invitation — fast", href: "/provider/procurement" },
  { label: "Submit competitive quotes to win procurement orders", href: "/provider/procurement" },
  { label: "Fulfil won orders promptly to build your completed-order count", href: "/provider/procurement" },
  { label: "Maintain approved credit status with admin review", href: "/provider/operations" },
];

function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ProviderRankingPage() {
  const [data, setData] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/provider/supplier-score")
      .then((res: any) => setData(res))
      .catch((err: any) => setError(err.message || "Failed to load score"))
      .finally(() => setLoading(false));
  }, []);

  const score = data?.supplierScore ?? 0;
  const scoreColor =
    score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-gray-400";
  const barColor =
    score >= 70 ? "bg-emerald-400" : score >= 40 ? "bg-amber-400" : "bg-gray-300";

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-accent">
          <TrendUp size={22} weight="bold" />
          <span className="text-sm font-semibold uppercase tracking-wider">Supplier Ranking</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-ink">Improve Your Ranking</h1>
        <p className="mt-1 text-sm text-muted">
          Buyers see your Trust Score when choosing suppliers. A higher score means more invitations and better chances of winning procurement orders.
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted">
          Loading your score…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <Warning size={18} />
          {error}
        </div>
      )}

      {data && (
        <>
          {/* Overall score card */}
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Your Trust Score</p>
                <p className={`mt-1 text-5xl font-extrabold leading-none ${scoreColor}`}>
                  {score}
                  <span className="text-2xl font-semibold text-muted">/100</span>
                </p>
              </div>
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-border bg-surface">
                <Star size={32} weight="fill" className={scoreColor} />
              </div>
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-surface">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${score}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {score >= 70 ? "Excellent — you are highly competitive."
                : score >= 40 ? "Good start — there is room to climb."
                : "New supplier — complete your profile and respond to RFQs to build your score."}
            </p>
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="text-sm font-semibold text-ink">Score Breakdown</h2>
            <div className="mt-4 space-y-5">
              {BREAKDOWN_META.map(({ key, label, icon: Icon, tip, href }) => {
                const comp = data.scoreBreakdown[key];
                const compColor =
                  comp.score >= comp.max * 0.8 ? "bg-emerald-400"
                  : comp.score >= comp.max * 0.4 ? "bg-amber-400"
                  : "bg-gray-300";
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="shrink-0 text-accent" weight="bold" />
                        <span className="text-sm font-medium text-ink">{label}</span>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-ink">
                        {comp.score}
                        <span className="font-normal text-muted">/{comp.max}</span>
                      </span>
                    </div>
                    <ScoreBar score={comp.score} max={comp.max} color={compColor} />
                    <p className="mt-1 text-xs text-muted">{comp.label}</p>
                    {comp.score < comp.max && (
                      <p className="mt-0.5 text-xs text-accent/80 italic">{tip}
                        {href && (
                          <Link href={href} className="ml-1 inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">
                            Go <ArrowRight size={10} weight="bold" />
                          </Link>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Improvement checklist */}
          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="text-sm font-semibold text-ink">Improvement Checklist</h2>
            <p className="mt-1 text-xs text-muted">Complete these actions to increase your Trust Score.</p>
            <ul className="mt-4 space-y-3">
              {CHECKLIST.map(({ label, href }) => {
                // Mark items as done based on trust signals
                const ts = data.trustSignals;
                let done = false;
                if (label.startsWith("Complete your company profile") && ts.profileCompleteness >= 0.8) done = true;
                if (label.startsWith("Add certifications") && ts.profileCompleteness >= 0.9) done = true;
                if (label.startsWith("Respond to every RFQ") && ts.quoteResponseRate !== null && ts.quoteResponseRate >= 0.9) done = true;
                if (label.startsWith("Maintain approved credit") && ts.creditStatus === "approved") done = true;
                if (label.startsWith("Fulfil won orders") && ts.completedProcurementOrders >= 10) done = true;

                return (
                  <li key={label} className="flex items-start gap-2.5">
                    {done ? (
                      <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle size={18} className="mt-0.5 shrink-0 text-gray-300" />
                    )}
                    <div className="flex-1 text-sm">
                      <span className={done ? "text-muted line-through" : "text-ink"}>{label}</span>
                      {!done && (
                        <Link href={href} className="ml-2 text-xs font-semibold text-accent hover:underline">
                          Take action →
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
