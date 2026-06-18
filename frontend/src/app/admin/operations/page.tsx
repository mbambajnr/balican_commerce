"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  ArrowClockwise,
  ArrowDown,
  CheckCircle,
  ClipboardText,
  Coins,
  DownloadSimple,
  Handshake,
  Timer,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";

type OpsReport = {
  window: { days: number; startsAt: string; endsAt: string };
  sourcing: {
    requestsCreated: number;
    requestsWithOneResponse48h: number;
    requestsWithTwoResponses48h: number;
    oneResponseRate48h: number;
    twoResponseRate48h: number;
  };
  proposals: { submitted: number; accepted: number; acceptanceRate: number };
  deals: { agreementsCreated: number; procurementOrdersCreated: number; ordersFulfilled: number };
  credit: {
    totalApprovedLimits: number;
    creditUsed: number;
    utilizationRate: number;
    overdueOrdersCount: number;
    overdueOrdersValue: number;
  };
  repayments: { received: number; value: number; onTime: number; onTimeRate: number };
  funnel: {
    stages: Array<{ key: string; label: string; count: number }>;
    conversions: Array<{ from: string; to: string; rate: number }>;
  };
};

const periods = [7, 30, 90];

const money = (value: number) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value);

function MetricCard({ label, value, detail, icon: Icon, tone = "blue" }: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof ClipboardText;
  tone?: "blue" | "gold" | "green" | "red";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    gold: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon size={20} weight="duotone" />
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
    </article>
  );
}

export default function AdminOperationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<OpsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError("");
    api.get<OpsReport>(`/admin/ops-report?days=${days}`)
      .then(setData)
      .catch(() => setError("The operations report could not be loaded."))
      .finally(() => setLoading(false));
  }, [days, refreshKey, user]);

  const csvRows = useMemo(() => data ? [
    ["Metric", "Value"],
    ["Window (days)", data.window.days],
    ["Sourcing requests created", data.sourcing.requestsCreated],
    ["Requests with 1+ response in 48h", data.sourcing.requestsWithOneResponse48h],
    ["1+ response rate in 48h", `${data.sourcing.oneResponseRate48h}%`],
    ["Requests with 2+ responses in 48h", data.sourcing.requestsWithTwoResponses48h],
    ["2+ response rate in 48h", `${data.sourcing.twoResponseRate48h}%`],
    ["Proposals submitted", data.proposals.submitted],
    ["Proposals accepted", data.proposals.accepted],
    ["Proposal acceptance rate", `${data.proposals.acceptanceRate}%`],
    ["Agreements created", data.deals.agreementsCreated],
    ["Procurement orders created", data.deals.procurementOrdersCreated],
    ["Orders fulfilled", data.deals.ordersFulfilled],
    ["Total approved credit limits", data.credit.totalApprovedLimits],
    ["Credit used", data.credit.creditUsed],
    ["Credit utilization rate", `${data.credit.utilizationRate}%`],
    ["Overdue orders", data.credit.overdueOrdersCount],
    ["Overdue order value", data.credit.overdueOrdersValue],
    ["Repayments received", data.repayments.received],
    ["Repayment value", data.repayments.value],
    ["On-time repayment rate", `${data.repayments.onTimeRate}%`],
    ...data.funnel.stages.map((stage) => [`Funnel: ${stage.label}`, stage.count]),
    ...data.funnel.conversions.map((conversion) => [
      `Conversion: ${conversion.from} to ${conversion.to}`,
      `${conversion.rate}%`,
    ]),
  ] : [], [data]);

  const downloadCsv = () => {
    if (!data) return;
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `balican-operations-${data.window.days}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading || (loading && !data)) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <section className="overflow-hidden rounded-2xl bg-navy px-6 py-7 text-white shadow-xl shadow-blue-950/10 sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
              <TrendUp size={16} weight="bold" /> Weekly deal loop
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Operations pulse</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/80">
              Follow sourcing demand from supplier response through agreement, order, fulfilment, and repayment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-white/10 p-1" aria-label="Report period">
              {periods.map((period) => (
                <button
                  key={period}
                  onClick={() => setDays(period)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${days === period ? "bg-white text-navy shadow-sm" : "text-blue-100 hover:bg-white/10"}`}
                >
                  {period} days
                </button>
              ))}
            </div>
            <button onClick={downloadCsv} disabled={!data} className="flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-xs font-bold text-navy transition hover:brightness-105 disabled:opacity-50">
              <DownloadSimple size={16} weight="bold" /> Export CSV
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setRefreshKey((current) => current + 1)} aria-label="Retry"><ArrowClockwise size={18} /></button>
        </div>
      )}

      {data && (
        <>
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Demand and response</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">Can the market answer within 48 hours?</h2>
              </div>
              {loading && <ArrowClockwise className="animate-spin text-muted" size={18} />}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Sourcing requests" value={data.sourcing.requestsCreated} detail={`Created in the last ${data.window.days} days`} icon={ClipboardText} />
              <MetricCard label="One supplier response" value={`${data.sourcing.oneResponseRate48h}%`} detail={`${data.sourcing.requestsWithOneResponse48h} requests answered within 48h`} icon={Timer} tone="gold" />
              <MetricCard label="Competitive response" value={`${data.sourcing.twoResponseRate48h}%`} detail={`${data.sourcing.requestsWithTwoResponses48h} requests received 2+ responses`} icon={Handshake} tone="green" />
              <MetricCard label="Proposal acceptance" value={`${data.proposals.acceptanceRate}%`} detail={`${data.proposals.accepted} of ${data.proposals.submitted} proposals accepted`} icon={CheckCircle} tone="green" />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-border bg-white p-6 xl:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">First-party funnel</p>
                  <h2 className="mt-1 text-xl font-semibold text-ink">From activation to platform revenue</h2>
                </div>
                <p className="text-xs text-muted">Conversion compares each stage with the one before it.</p>
              </div>
              <div className="mt-6 overflow-x-auto pb-2">
                <div className="flex min-w-max items-stretch gap-2">
                  {data.funnel.stages.map((stage, index) => {
                    const conversion = index > 0 ? data.funnel.conversions[index - 1] : null;
                    return (
                      <div key={stage.key} className="flex items-center gap-2">
                        {conversion && (
                          <div className="w-14 text-center">
                            <p className="text-xs font-bold text-accent">{conversion.rate}%</p>
                            <div className="mt-1 h-px bg-border" />
                          </div>
                        )}
                        <div className="w-36 rounded-xl bg-surface p-4">
                          <p className="text-2xl font-semibold text-ink">{stage.count}</p>
                          <p className="mt-1 text-xs leading-5 text-muted">{stage.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Deal progression</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {([
                  { label: "Agreements", value: data.deals.agreementsCreated, icon: Handshake },
                  { label: "Orders", value: data.deals.procurementOrdersCreated, icon: Coins },
                  { label: "Fulfilled", value: data.deals.ordersFulfilled, icon: CheckCircle },
                ] satisfies Array<{ label: string; value: number; icon: typeof Handshake }>).map(({ label, value, icon: Icon }, index) => (
                  <div key={label} className="relative rounded-xl bg-surface p-5">
                    <Icon size={21} className="text-accent" weight="duotone" />
                    <p className="mt-5 text-3xl font-semibold text-ink">{value}</p>
                    <p className="text-sm text-muted">{label}</p>
                    {index < 2 && <ArrowDown className="absolute -bottom-4 left-1/2 z-10 text-muted sm:-right-4 sm:bottom-auto sm:left-auto sm:top-1/2 sm:-rotate-90" size={16} />}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Credit exposure</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{money(data.credit.creditUsed)}</p>
                  <p className="text-sm text-muted">of {money(data.credit.totalApprovedLimits)} approved</p>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-lg font-semibold text-blue-700">{data.credit.utilizationRate}%</div>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(data.credit.utilizationRate, 100)}%` }} />
              </div>
              <div className="mt-6 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-red-700">
                <Warning size={20} weight="fill" />
                <div><p className="text-sm font-semibold">{data.credit.overdueOrdersCount} overdue orders</p><p className="text-xs text-red-600">{money(data.credit.overdueOrdersValue)} outstanding</p></div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Repayments received" value={data.repayments.received} detail={`${money(data.repayments.value)} collected in period`} icon={Coins} />
            <MetricCard label="On-time repayments" value={data.repayments.onTime} detail="Payments received on or before due date" icon={CheckCircle} tone="green" />
            <MetricCard label="On-time rate" value={`${data.repayments.onTimeRate}%`} detail="Share of period repayments received on time" icon={Timer} tone={data.repayments.onTimeRate >= 80 ? "green" : "gold"} />
          </section>
        </>
      )}
    </div>
  );
}
