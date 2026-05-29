"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { MagnifyingGlass, Plus, PencilSimple, FunnelSimple, X } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { TableSkeleton } from "@/components/admin/LoadingSkeleton";
import EmptyState from "@/components/admin/EmptyState";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [limitModal, setLimitModal] = useState<{ id: string; name: string; current: number } | null>(null);
  const [newLimit, setNewLimit] = useState("");
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", phone: "", companyName: "" });
  const [submitting, setSubmitting] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [creditApproved, setCreditApproved] = useState<boolean | undefined>();
  const [hasOutstanding, setHasOutstanding] = useState<boolean | undefined>();
  const [overdueBalance, setOverdueBalance] = useState<boolean | undefined>();
  const [company, setCompany] = useState("");

  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    params.page = String(page);
    params.sortBy = sortBy;
    params.sortOrder = sortOrder;
    if (creditApproved !== undefined) params.creditApproved = String(creditApproved);
    if (hasOutstanding !== undefined) params.hasOutstanding = String(hasOutstanding);
    if (overdueBalance !== undefined) params.overdueBalance = String(overdueBalance);
    if (company) params.company = company;
    api.getCustomers(params)
      .then((res) => {
        setCustomers(res.customers);
        if (res.pagination) setTotalPages(res.pagination.totalPages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, page, sortBy, sortOrder, creditApproved, hasOutstanding, overdueBalance, company]);

  useEffect(() => {
    setPage(1);
  }, [search, creditApproved, hasOutstanding, overdueBalance, company, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const sortIcon = (field: string) => {
    if (sortBy !== field) return "";
    return sortOrder === "asc" ? "\u2191" : "\u2193";
  };

  const toggleFilter = (v: boolean | undefined): boolean | undefined => {
    if (v === undefined) return true;
    if (v === true) return false;
    return undefined;
  };

  const saveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limitModal) return;
    try {
      await api.updateCreditSettings(limitModal.id, { creditLimit: Number(newLimit) });
      toast.success("Credit limit updated");
      setLimitModal(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed");
    }
  };

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createCustomer(form);
      toast.success("Customer created");
      setCreateModal(false);
      setForm({ email: "", password: "", firstName: "", lastName: "", phone: "", companyName: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: "name",
      label: "Name",
      render: (c: any) => (
        <Link href={`/admin/customers/${c.id}`} className="font-medium text-accent hover:underline">
          {c.first_name} {c.last_name}
        </Link>
      ),
    },
    {
      key: "contact",
      label: "Email / Phone",
      render: (c: any) => (
        <div>
          <div className="text-muted">{c.email}</div>
          {c.phone && <div className="text-soft text-xs">{c.phone}</div>}
        </div>
      ),
    },
    {
      key: "company",
      label: "Company",
      render: (c: any) => <span className="text-muted">{c.company_name || "\u2014"}</span>,
    },
    {
      key: "total_orders",
      label: "Total Orders",
      render: (c: any) => <span>{c.total_orders ?? "\u2014"}</span>,
    },
    {
      key: "outstanding_balance",
      label: "Outstanding Balance",
      render: (c: any) =>
        Number(c.outstanding_balance) > 0 ? (
          <span className="font-medium text-warn">{formatCurrency(c.outstanding_balance)}</span>
        ) : (
          <span className="text-muted">{formatCurrency(0)}</span>
        ),
    },
    {
      key: "credit_status",
      label: "Credit Limit / Status",
      render: (c: any) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{c.credit_limit ? formatCurrency(c.credit_limit) : "\u2014"}</span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              c.is_credit_approved ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {c.is_credit_approved ? "Approved" : "Not Set"}
          </span>
        </div>
      ),
    },
    {
      key: "last_activity",
      label: "Last Activity",
      render: (c: any) => (
        <span className="text-muted text-xs">{c.last_activity_at ? formatDate(c.last_activity_at) : "\u2014"}</span>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (c: any) => (
        <button
          onClick={() => {
            setLimitModal({
              id: c.id,
              name: `${c.first_name} ${c.last_name}`,
              current: Number(c.credit_limit || 0),
            });
            setNewLimit(String(c.credit_limit || ""));
          }}
          className="btn btn-sm btn-soft gap-1"
        >
          <PencilSimple size={14} weight="bold" />
          Set Limit
        </button>
      ),
    },
  ];

  const sortableColumns = [
    { field: "name", label: "Name" },
    { field: "email", label: "Email" },
    { field: "credit_limit", label: "Credit Limit" },
    { field: "outstanding_balance", label: "Outstanding" },
    { field: "created_at", label: "Created" },
  ];

  const filters = [
    { label: "Credit Approved", value: creditApproved, set: setCreditApproved },
    { label: "Has Outstanding", value: hasOutstanding, set: setHasOutstanding },
    { label: "Overdue Balance", value: overdueBalance, set: setOverdueBalance },
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Customers</h1>
          <p className="mt-1 text-sm text-soft">{customers.length} registered</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn btn-sm gap-1 ${showFilters ? "btn-primary" : "btn-soft"}`}
          >
            <FunnelSimple size={16} weight="bold" />
            Filters
          </button>
          <button onClick={() => setCreateModal(true)} className="btn btn-primary gap-1.5 shrink-0">
            <Plus size={16} weight="bold" />
            Create
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
          {filters.map(({ label, value, set }) => (
            <button
              key={label}
              onClick={() => set(toggleFilter(value))}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                value === true
                  ? "bg-green-100 text-green-700"
                  : value === false
                    ? "bg-red-100 text-red-600"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {label}
              {value !== undefined && <X size={12} weight="bold" />}
            </button>
          ))}
          <input
            type="text"
            placeholder="Company name..."
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="input text-sm py-1.5 w-40"
          />
          {company && (
            <button onClick={() => setCompany("")} className="text-muted hover:text-ink">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-medium text-muted uppercase tracking-wider">
        <span className="mr-1">Sort by:</span>
        {sortableColumns.map(({ field, label }) => (
          <button
            key={field}
            onClick={() => handleSort(field)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
              sortBy === field
                ? "bg-accent/10 text-accent font-semibold"
                : "hover:bg-zinc-100 text-muted"
            }`}
          >
            {label}
            <span className="text-xs">{sortIcon(field)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : (
        <DataTable columns={columns} data={customers} emptyIcon="customers" emptyTitle="No customers found" />
      )}

      {!loading && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}

      {limitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setLimitModal(null)}
        >
          <div className="card mx-4 w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Credit Limit</h2>
            <p className="mt-1 text-sm text-soft">{limitModal.name}</p>
            <form onSubmit={saveLimit} className="mt-6 space-y-4">
              <div>
                <label className="input-label">Credit Limit (GH₵)</label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn btn-primary flex-1">Save</button>
                <button type="button" onClick={() => setLimitModal(null)} className="btn flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setCreateModal(false)}
        >
          <div className="card mx-4 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Create Customer</h2>
            <p className="mt-1 text-sm text-soft">Create a new customer account</p>
            <form onSubmit={createCustomer} className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">First Name</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="input-label">Last Name</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="input-label">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="input-label">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="input-label">Company</label>
                <input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="input"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="input-label">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input"
                  placeholder="Optional"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting} className="btn btn-primary flex-1">
                  {submitting ? "Creating..." : "Create Customer"}
                </button>
                <button type="button" onClick={() => setCreateModal(false)} className="btn flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
