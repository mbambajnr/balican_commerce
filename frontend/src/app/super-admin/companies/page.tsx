"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  active: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  suspended: "bg-gray-100 text-gray-700",
  payment_suspended: "bg-purple-100 text-purple-700",
};

const VERIFICATION_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-500",
  required: "bg-amber-100 text-amber-700",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-indigo-100 text-indigo-700",
  changes_requested: "bg-rose-100 text-rose-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function SuperAdminCompanies() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vStatusFilter, setVStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    const params: any = { page: String(page), limit: String(limit) };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (vStatusFilter) params.verificationStatus = vStatusFilter;
    if (typeFilter) params.companyType = typeFilter;
    if (sortBy) params.sortBy = sortBy;
    api.getSuperAdminCompanies(params)
      .then((res) => { setCompanies(res.companies); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search, statusFilter, vStatusFilter, typeFilter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Companies</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm w-64"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="payment_suspended">Payment Suspended</option>
        </select>
        <select value={vStatusFilter} onChange={(e) => { setVStatusFilter(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Verification</option>
          <option value="not_started">Not Started</option>
          <option value="required">Required</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="changes_requested">Changes Requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Types</option>
          <option value="buyer">Buyer</option>
          <option value="supplier">Supplier</option>
          <option value="service_provider">Service Provider</option>
          <option value="both_supplier_and_service_provider">Both</option>
        </select>
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name A-Z</option>
          <option value="status">Status</option>
          <option value="verification">Verification</option>
          <option value="type">Type</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>
      ) : companies.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No companies found</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Verification</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Users</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/companies/${c.id}`} className="text-accent hover:underline font-medium">
                      {c.name}
                    </Link>
                    <div className="text-xs text-gray-400">{c.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{c.company_type?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || "bg-gray-100"}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.verification_status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VERIFICATION_COLORS[c.verification_status] || "bg-gray-100"}`}>
                        {c.verification_status.replace(/_/g, " ")}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">{c.plan_name || "free"}</td>
                  <td className="px-4 py-3">{c.user_count}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
