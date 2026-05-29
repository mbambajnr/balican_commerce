"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ClipboardText, Eye, Funnel } from "@phosphor-icons/react";
import DataTable from "@/components/admin/DataTable";
import StatusBadge from "@/components/admin/StatusBadge";
import { formatDate } from "@/lib/format";

export default function AdminRfqsPage() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [sourceFilter, setSourceFilter] = useState("");

  const load = () => {
    const params: any = {};
    if (sourceFilter) params.source = sourceFilter;
    api.get<{ rfqs: any[] }>(`/rfqs${sourceFilter ? `?source=${sourceFilter}` : ""}`)
      .then((res) => setRfqs(res.rfqs)).catch(() => {});
  };
  useEffect(() => { load(); }, [sourceFilter]);

  const columns = [
    {
      key: "customer",
      label: "Customer",
      render: (r: any) => (
        <div>
          {r.source === "guest" ? (
            <span className="font-medium">{r.contact_name || r.company_name || "Guest"}</span>
          ) : (
            <span className="font-medium">{r.first_name} {r.last_name || ""}</span>
          )}
          <div className="text-xs text-soft">{r.source === "guest" ? r.email : r.user_email}</div>
        </div>
      ),
    },
    {
      key: "source",
      label: "Source",
      render: (r: any) => (
        <span className={`badge ${r.source === "guest" ? "badge-yellow" : "badge-blue"}`}>
          {r.source === "guest" ? "Guest RFQ" : "Company RFQ"}
        </span>
      ),
    },
    { key: "product_name", label: "Product", render: (r: any) => <span className="text-muted">{r.product_name || r.product_name || "\u2014"}</span> },
    { key: "quantity", label: "Qty" },
    { key: "utm_source", label: "Marketing", render: (r: any) => <span className="text-xs text-muted">{r.utm_source || r.utm_campaign ? `${r.utm_source || ""}${r.utm_campaign ? ` / ${r.utm_campaign}` : ""}` : "\u2014"}</span> },
    { key: "status", label: "Status", render: (r: any) => <StatusBadge status={r.status} /> },
    { key: "date", label: "Date", render: (r: any) => <span className="text-muted">{formatDate(r.created_at)}</span> },
    { key: "actions", label: "", render: (r: any) => <Link href={`/admin/rfqs/${r.id}`} className="btn btn-sm gap-1"><Eye size={14} /> View</Link> },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">RFQs</h1>
        <div className="relative w-48">
          <Funnel size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="input pl-9 text-sm appearance-none"
          >
            <option value="">All Sources</option>
            <option value="guest">Guest RFQ</option>
            <option value="registered">Company RFQ</option>
          </select>
        </div>
      </div>
      <DataTable columns={columns} data={rfqs} emptyIcon="rfqs" emptyTitle="No RFQs" />
    </div>
  );
}
