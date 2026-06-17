"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import StatusBadge from "@/components/admin/StatusBadge";
import type { Column } from "@/components/admin/DataTable";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { CurrencyCircleDollar, Receipt, TrendUp } from "@phosphor-icons/react";

type CommissionRow = {
  id: string;
  order_number: string;
  buyer_name: string;
  category_name?: string | null;
  base_amount: string | number;
  rate_percent: string | number;
  commission_amount: string | number;
  currency: string;
  status: string;
  accrued_at: string;
};

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: any;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
          <p className="mt-1 text-xs text-muted">{helper}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
          <Icon size={22} weight="duotone" />
        </div>
      </div>
    </div>
  );
}

export default function ProviderCommissionsPage() {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [summary, setSummary] = useState({ baseTotal: 0, commissionTotal: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getProviderCommissions({ page: String(page), limit: String(limit) });
      setRows(res.commissions || []);
      setSummary(res.summary || { baseTotal: 0, commissionTotal: 0 });
      setPagination(res.pagination || { page, limit, total: 0, pages: 0 });
    } catch (err: any) {
      toast.error(err.message || "Failed to load commission statement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page]);

  const effectiveRate = summary.baseTotal > 0
    ? (Number(summary.commissionTotal) / Number(summary.baseTotal)) * 100
    : 0;

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
      label: "Order Value",
      render: (row) => <span className="font-medium">{formatCurrency(row.base_amount)}</span>,
    },
    {
      key: "rate",
      label: "Rate",
      render: (row) => `${Number(row.rate_percent).toFixed(2)}%`,
    },
    {
      key: "commission",
      label: "Platform Fee",
      render: (row) => <span className="font-semibold text-amber-700">{formatCurrency(row.commission_amount)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div>
        <div className="flex items-center gap-2 text-accent">
          <CurrencyCircleDollar size={22} weight="bold" />
          <span className="text-sm font-semibold uppercase tracking-wider">Commission Statement</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-ink">Your Platform Fees</h1>
        <p className="mt-1 text-sm text-muted">
          Review Balican commission entries accrued from your completed marketplace orders.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Completed Order Value"
          value={formatCurrency(summary.baseTotal)}
          helper="Orders that reached completed status"
          icon={TrendUp}
          tone="bg-blue-50 text-blue-600"
        />
        <SummaryCard
          label="Commission Accrued"
          value={formatCurrency(summary.commissionTotal)}
          helper="Total platform fees recorded"
          icon={Receipt}
          tone="bg-amber-50 text-amber-600"
        />
        <SummaryCard
          label="Effective Rate"
          value={`${effectiveRate.toFixed(2)}%`}
          helper="Commission divided by completed value"
          icon={CurrencyCircleDollar}
          tone="bg-emerald-50 text-emerald-600"
        />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        These entries are accounting records for completed orders. Settlement and invoicing status may update later as finance reconciles each period.
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-muted">
          Loading your statement...
        </div>
      ) : (
        <>
          <DataTable columns={columns} data={rows} emptyIcon="payments" emptyTitle="No commission entries yet" />
          <Pagination page={page} totalPages={pagination.pages || 0} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
