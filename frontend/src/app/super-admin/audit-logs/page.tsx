"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function SuperAdminAuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 50;

  useEffect(() => {
    setLoading(true);
    api.getAuditLogs({ action: actionFilter || undefined, page: String(page), limit: String(limit) })
      .then((res) => { setLogs(res.logs); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, actionFilter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>

      <div className="mb-6">
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">All Actions</option>
          <option value="company_approved">Company Approved</option>
          <option value="company_rejected">Company Rejected</option>
          <option value="company_suspended">Company Suspended</option>
          <option value="company_reactivated">Company Reactivated</option>
          <option value="company_payment_suspended">Payment Suspended</option>
          <option value="company_payment_suspend_cleared">Payment Cleared</option>
          <option value="document_approved">Document Approved</option>
          <option value="document_rejected">Document Rejected</option>
          <option value="document_reupload_requested">Re-upload Requested</option>
          <option value="plan_created">Plan Created</option>
          <option value="plan_updated">Plan Updated</option>
          <option value="subscription_updated">Subscription Updated</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No audit logs found</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Admin</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Target</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs">{log.admin_name || log.admin_email}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-xs font-medium">{log.action.replace(/_/g, " ")}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{log.target_type}:{log.target_id?.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{log.reason || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
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
