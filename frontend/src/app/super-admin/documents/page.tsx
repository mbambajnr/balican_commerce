"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  business_registration: "Business Registration",
  certificate_of_incorporation: "Certificate of Inc.",
  tax_identification: "Tax ID",
  company_profile: "Company Profile",
  director_or_owner_id: "Director/Owner ID",
  proof_of_address: "Proof of Address",
  professional_license: "Professional License",
  insurance_certificate: "Insurance Certificate",
  portfolio_or_past_projects: "Portfolio",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  needs_reupload: "bg-blue-100 text-blue-700",
  expired: "bg-gray-100 text-gray-600",
};

export default function SuperAdminDocuments() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    api.getSuperAdminDocuments({ status: statusFilter, page: String(page), limit: String(limit) })
      .then((res) => { setDocuments(res.documents); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Verification Documents</h1>

      <div className="mb-6">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs_reupload">Needs Re-upload</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No documents found</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">File</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Uploaded By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</td>
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/companies/${doc.company_id}`} className="text-accent hover:underline">
                      {doc.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <a href={api.getDocumentDownloadUrl(doc.id)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs">
                      {doc.file_name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs">{doc.uploaded_by_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[doc.status] || "bg-gray-100"}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Link href={`/super-admin/companies/${doc.company_id}`} className="text-xs text-accent hover:underline">
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Previous</button>
          <span className="px-3 py-1 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
