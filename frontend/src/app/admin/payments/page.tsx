"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Bank, CreditCard } from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import DataTable from "@/components/admin/DataTable";
import type { Column } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { TableSkeleton } from "@/components/admin/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/lib/format";

type Tab = "all" | "bank_transfers" | "order_payments";

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [bankTransfers, setBankTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { page: String(page), limit: String(limit) };
      if (tab === "bank_transfers") params.method = "bank_transfer";
      const res = await api.adminGetPayments(params);
      setPayments(res.payments || []);
      setBankTransfers(res.bankTransfers || []);
      setTotal(res.pagination?.total || 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [tab]);

  useEffect(() => {
    load();
  }, [tab, page]);

  const allItems = [...payments, ...(tab === "all" ? bankTransfers : [])].filter(
    (item, idx, arr) => arr.findIndex((i) => i.id === item.id) === idx
  );
  const displayItems = tab === "bank_transfers" ? bankTransfers : tab === "order_payments" ? payments : allItems;

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "bank_transfers", label: "Bank Transfers" },
    { key: "order_payments", label: "Order Payments" },
  ];

  const totalPages = Math.ceil(total / limit);

  const columns: Column<any>[] = [
    {
      key: "type",
      label: "Type",
      render: (item) => {
        const isTransfer = item.bank_name !== undefined || item.transfer_reference !== undefined;
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {isTransfer ? <Bank size={15} weight="duotone" /> : <CreditCard size={15} weight="duotone" />}
          </div>
        );
      },
    },
    {
      key: "customer",
      label: "Customer",
      render: (item) => {
        const name = `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.customer_name;
        return <span className="font-medium">{name || "\u2014"}</span>;
      },
    },
    {
      key: "order_number",
      label: "Order #",
      render: (item) => <span className="text-muted">{item.order_number || item.order?.order_number || "\u2014"}</span>,
    },
    {
      key: "amount",
      label: "Amount",
      render: (item) => <span className="font-medium">{formatCurrency(item.amount || item.total || 0)}</span>,
    },
    {
      key: "method",
      label: "Method",
      render: (item) => {
        const isTransfer = item.bank_name !== undefined || item.transfer_reference !== undefined;
        return (
          <span className={`badge ${isTransfer ? "badge-blue" : "badge-green"}`}>
            {isTransfer ? "Bank Transfer" : item.method || item.payment_method || "\u2014"}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (item) => {
        const raw = item.status || item.payment_status || "";
        const normalized = raw === "successful" || raw === "paid" ? "completed"
          : raw === "pending_verification" ? "pending"
          : raw || "completed";
        return <StatusBadge status={normalized} />;
      },
    },
    {
      key: "date",
      label: "Date",
      render: (item) => (
        <span className="text-muted whitespace-nowrap">{formatDate(item.created_at || item.createdAt || item.date)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 h-8 w-48 skeleton rounded-lg" />
        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-9 w-28 skeleton rounded-lg" />)}
        </div>
        <TableSkeleton rows={5} cols={7} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Payments</h1>
          <p className="mt-1 text-sm text-soft">{total} total transactions</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 rounded-lg border border-border bg-white p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-accent text-white" : "text-soft hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={displayItems} emptyIcon="payments" emptyTitle="No payments found" />

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
