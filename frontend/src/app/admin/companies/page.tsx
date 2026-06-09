"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import EmptyState from "@/components/admin/EmptyState";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import {
  Building, MagnifyingGlass, Funnel, CheckCircle, XCircle, Clock,
  ArrowRight, Users as UsersIcon, CaretDown, ShoppingCart, Toolbox, Handshake, ArrowsLeftRight
} from "@phosphor-icons/react";
import toast from "react-hot-toast";

export default function CompaniesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [page, setPage] = useState(1);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showTypeFilter, setShowTypeFilter] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) {
      router.push("/admin/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user?.role === "admin" || user?.role === "super_admin") {
      api.getCompanies({ search: search || undefined, status: status || undefined, companyType: companyType || undefined, page: String(page), limit: "20" })
        .then(setData).catch(() => toast.error("Failed to fetch companies"));
    }
  }, [user, search, status, companyType, page]);

  if (authLoading || !data) return <PageSkeleton />;

  const columns = [
    { key: "name", label: "Company", render: (item: any) => (
      <Link href={`/admin/companies/${item.id}`} className="font-medium text-accent hover:underline flex items-center gap-2">
        <Building size={16} /> {item.name}
      </Link>
    )},
    { key: "email", label: "Email" },
    { key: "company_type", label: "Type", render: (item: any) => {
      const typeLabels: Record<string, { label: string; icon: any }> = {
        buyer: { label: "Buyer", icon: ShoppingCart },
        supplier: { label: "Supplier", icon: Toolbox },
        service_provider: { label: "Service", icon: Handshake },
        both_supplier_and_service_provider: { label: "Both", icon: ArrowsLeftRight },
      };
      const info = typeLabels[item.company_type] || { label: item.company_type || "—", icon: Building };
      const Icon = info.icon;
      return <span className="flex items-center gap-1.5 text-sm"><Icon size={14} className="text-muted" /> {info.label}</span>;
    }},
    { key: "contact_person_name", label: "Contact" },
    { key: "user_count", label: "Users", render: (item: any) => (
      <span className="flex items-center gap-1"><UsersIcon size={14} /> {item.user_count || 0}</span>
    )},
    { key: "status", label: "Status", render: (item: any) => {
      const colors: Record<string, string> = { active: "badge-green", pending: "badge-yellow", rejected: "badge-red" };
      return <span className={`badge ${colors[item.status] || "badge-gray"}`}>{item.status || "N/A"}</span>;
    }},
    { key: "verification_status", label: "Verified", render: (item: any) => {
      if (item.company_type === "buyer" || !item.company_type) return <span className="text-xs text-muted">—</span>;
      const vColors: Record<string, string> = { approved: "badge-green", pending: "badge-yellow", rejected: "badge-red", suspended: "badge-red" };
      return <span className={`badge ${vColors[item.verification_status] || "badge-gray"}`}>{item.verification_status || "pending"}</span>;
    }},
    { key: "created_at", label: "Registered", render: (item: any) => new Date(item.created_at).toLocaleDateString() },
    { key: "actions", label: "", render: (item: any) => (
      <Link href={`/admin/companies/${item.id}`} className="btn btn-sm btn-ghost gap-1">
        View <ArrowRight size={14} />
      </Link>
    )},
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Companies</h1>
          <p className="mt-1 text-sm text-muted">Manage B2B company accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search companies..."
              className="input pl-9 w-56 text-sm"
            />
          </div>
          <div className="relative">
            <button onClick={() => setShowStatusFilter(!showStatusFilter)} className="btn btn-sm border-border gap-1.5">
              <Funnel size={14} /> {status || "All Status"} <CaretDown size={12} />
            </button>
            {showStatusFilter && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-white shadow-lg">
                {["", "active", "pending", "rejected"].map((s) => (
                  <button key={s} onClick={() => { setStatus(s); setShowStatusFilter(false); setPage(1); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 capitalize">{s || "All"}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setShowTypeFilter(!showTypeFilter)} className="btn btn-sm border-border gap-1.5">
              <Funnel size={14} /> {companyType ? companyType.replace(/_/g, " ") : "All Types"} <CaretDown size={12} />
            </button>
            {showTypeFilter && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-white shadow-lg">
                {[
                  { value: "", label: "All Types" },
                  { value: "buyer", label: "Buyer" },
                  { value: "supplier", label: "Supplier" },
                  { value: "service_provider", label: "Service Provider" },
                  { value: "both_supplier_and_service_provider", label: "Both" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => { setCompanyType(opt.value); setShowTypeFilter(false); setPage(1); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">{opt.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {data.companies.length === 0 ? (
        <EmptyState icon="default" title="No companies found" description="Companies will appear here when businesses register." />
      ) : (
        <>
          <DataTable columns={columns} data={data.companies} />
          {data.pagination && <Pagination page={data.pagination.page} totalPages={data.pagination.pages} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
