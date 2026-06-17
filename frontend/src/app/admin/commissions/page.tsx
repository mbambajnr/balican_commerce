"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import DataTable from "@/components/admin/DataTable";
import StatusBadge from "@/components/admin/StatusBadge";
import type { Column } from "@/components/admin/DataTable";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  ArrowClockwise,
  DownloadSimple,
  FunnelSimple,
  Percent,
  Receipt,
  TrendUp,
} from "@phosphor-icons/react";

type CommissionRow = {
  id: string;
  order_number: string;
  provider_name: string;
  buyer_name: string;
  category_name?: string | null;
  base_amount: string | number;
  rate_percent: string | number;
  commission_amount: string | number;
  currency: string;
  status: string;
  accrued_at: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "accrued", label: "Accrued" },
  { value: "invoiced", label: "Invoiced" },
  { value: "settled", label: "Settled" },
];

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: any;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={22} weight="duotone" />
        </div>
      </div>
    </div>
  );
}

export default function AdminCommissionsPage() {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [summary, setSummary] = useState({ count: 0, baseTotal: 0, commissionTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [status, setStatus] = useState("");
  const [providerCompanyId, setProviderCompanyId] = useState("");

  const queryParams = useMemo(() => ({
    days,
    status: status || undefined,
    providerCompanyId: providerCompanyId.trim() || undefined,
  }), [days, status, providerCompanyId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getAdminCommissions(queryParams);
      setRows(res.commissions || []);
      setSummary(res.summary || { count: 0, baseTotal: 0, commissionTotal: 0 });
    } catch (err: any) {
      toast.error(err.message || "Failed to load commissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queryParams]);

  const exportCsv = () => {
    const qs = new URLSearchParams();
    qs.set("days", days);
    qs.set("format", "csv");
    if (status) qs.set("status", status);
    if (providerCompanyId.trim()) qs.set("providerCompanyId", providerCompanyId.trim());
    window.open(`/backend-api/admin/commissions?${qs.toString()}`, "_blank");
  };

  const columns: Column<CommissionRow>[] = [
    {
      key: "order",
      label: "Order",
      render: (row) => (
        <div>
          <p className="font-medium text-ink">{row.order_number}</p>
          <p className="text-xs text-muted">{formatDateTime(row.accrued_at)}</p>
        </div>
      ),
    },
    {
      key: "provider",
      label: "Provider",
      render: (row) => <span className="font-medium text-ink">{row.provider_name}</span>,
    },
    {
      key: "buyer",
      label: "Buyer",
      render: (row) => <span className="text-muted">{row.buyer_name}</span>,
    },
    {
      key: "category",
      label: "Category",
      render: (row) => row.category_name || <span className="text-muted">Default</span>,
    },
    {
      key: "base_amount",
      label: "Base",
      render: (row) => <span className="font-medium">{formatCurrency(row.base_amount)}</span>,
    },
    {
      key: "rate",
      label: "Rate",
      render: (row) => `${Number(row.rate_percent).toFixed(2)}%`,
    },
    {
      key: "commission",
      label: "Commission",
      render: (row) => <span className="font-semibold text-emerald-700">{formatCurrency(row.commission_amount)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Receipt size={22} weight="bold" />
            <span className="text-sm font-semibold uppercase tracking-wider">Revenue Operations</span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Commission Ledger</h1>
          <p className="mt-1 text-sm text-soft">
            Track Balican take-rate accruals from completed marketplace orders.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-soft gap-2" disabled={loading}>
            <ArrowClockwise size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button onClick={exportCsv} className="btn btn-primary gap-2">
            <DownloadSimple size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <SummaryCard label="Ledger Entries" value={String(summary.count || 0)} icon={Receipt} tone="bg-blue-50 text-blue-600" />
        <SummaryCard label="Completed GMV" value={formatCurrency(summary.baseTotal)} icon={TrendUp} tone="bg-purple-50 text-purple-600" />
        <SummaryCard label="Commission Accrued" value={formatCurrency(summary.commissionTotal)} icon={Percent} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <FunnelSimple size={16} />
          Filters
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Window</span>
            <select value={days} onChange={(e) => setDays(e.target.value)} className="input w-full">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 365 days</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-full">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-muted">Provider company ID</span>
            <input
              value={providerCompanyId}
              onChange={(e) => setProviderCompanyId(e.target.value)}
              placeholder="Optional exact company UUID"
              className="input w-full"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 rounded-xl border border-border bg-white p-8 text-center text-sm text-muted">
          Loading commission ledger...
        </div>
      ) : (
        <DataTable columns={columns} data={rows} emptyIcon="payments" emptyTitle="No commissions found" />
      )}
    </div>
  );
}
