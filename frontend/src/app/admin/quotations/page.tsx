"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Funnel, Eye } from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import DataTable from "@/components/admin/DataTable";
import type { Column } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AdminQuotationsPage() {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async (page = 1) => {
    try {
      const params: any = { page: String(page) };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.adminGetQuotations(params);
      setQuotations(res.quotations);
      setPagination(res.pagination);
    } catch { toast.error("Failed to load"); }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const columns: Column<any>[] = [
    {
      key: "quotation_number",
      label: "Quotation #",
      render: (q) => <span className="font-mono text-xs">{q.quotation_number}</span>,
    },
    {
      key: "customer",
      label: "Customer",
      render: (q) => <span className="font-medium">{q.first_name} {q.last_name}</span>,
    },
    {
      key: "item_count",
      label: "Items",
      render: (q) => <span className="text-muted">{q.item_count || 0}</span>,
    },
    {
      key: "total_amount",
      label: "Total",
      render: (q) => <span>{formatCurrency(q.total_amount)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (q) => <StatusBadge status={q.status} />,
    },
    {
      key: "created_at",
      label: "Date",
      render: (q) => <span className="text-muted">{formatDate(q.created_at)}</span>,
    },
    {
      key: "actions",
      label: "",
      render: (q) => (
        <Link href={"/admin/rfqs/" + (q.rfq_id || "")} className="btn btn-sm gap-1">
          <Eye size={14} /> View RFQ
        </Link>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Quotations</h1>
          <p className="mt-1 text-sm text-soft">{pagination.total} quotations</p>
        </div>
      </div>

      <div className="card mt-6 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="input-label">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="input" placeholder="Quotation # or customer name..." />
          </div>
          <div className="w-40">
            <label className="input-label">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input">
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
              <option value="converted_to_order">Converted</option>
            </select>
          </div>
          <button onClick={() => load()} className="btn btn-sm"><Funnel size={14} /> Filter</button>
        </div>
      </div>

      <DataTable columns={columns} data={quotations} emptyIcon="quotations" emptyTitle="No quotations found" />

      <Pagination page={pagination.page} totalPages={pagination.pages} onPageChange={load} />
    </div>
  );
}
