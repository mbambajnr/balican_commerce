"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const VERIFICATION_STATUS_COLORS: Record<string, string> = {
  not_started: "text-gray-500",
  required: "text-amber-600",
  submitted: "text-blue-600",
  under_review: "text-indigo-600",
  changes_requested: "text-rose-600",
  approved: "text-green-600",
  rejected: "text-red-600",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  business_registration: "Business Registration",
  certificate_of_incorporation: "Certificate of Incorporation",
  tax_identification: "Tax Identification",
  company_profile: "Company Profile",
  director_or_owner_id: "Director/Owner ID",
  proof_of_address: "Proof of Address",
  professional_license: "Professional License",
  insurance_certificate: "Insurance Certificate",
  portfolio_or_past_projects: "Portfolio/Past Projects",
  other: "Other",
};

export default function SuperAdminCompanyDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [docActionId, setDocActionId] = useState<string | null>(null);
  const [docRejectReason, setDocRejectReason] = useState("");
  const [docNotes, setDocNotes] = useState("");

  useEffect(() => {
    if (!id) return;
    api.getSuperAdminCompany(id)
      .then(setCompany)
      .catch(() => setError("Failed to load company"))
      .finally(() => setLoading(false));
  }, [id]);

  const performAction = async (action: string, endpoint: string) => {
    setActionLoading(action);
    setMessage("");
    setError("");
    try {
      const res = await (api as any)[endpoint](id, reason || undefined);
      setMessage(res.message);
      setReason("");
      const updated = await api.getSuperAdminCompany(id);
      setCompany(updated);
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading("");
    }
  };

  const actionMap: Record<string, string> = {
    approve: "superApproveCompany",
    reject: "superRejectCompany",
    suspend: "superSuspendCompany",
    reactivate: "superReactivateCompany",
    "payment-suspend": "superPaymentSuspendCompany",
    "clear-payment": "superClearPaymentSuspend",
  };

  const handleDocAction = async (docId: string, action: "approve" | "reject" | "request-reupload") => {
    setDocActionId(docId);
    setError("");
    try {
      if (action === "approve") {
        await api.approveDocument(docId, docNotes || undefined);
      } else if (action === "reject") {
        await api.rejectDocument(docId, docRejectReason || "Document does not meet requirements", docNotes || undefined);
      } else {
        await api.requestDocumentReupload(docId, docRejectReason || "Please re-upload with corrections", docNotes || undefined);
      }
      setDocRejectReason("");
      setDocNotes("");
      const updated = await api.getSuperAdminCompany(id);
      setCompany(updated);
    } catch (e: any) {
      setError(e.message || "Document action failed");
    } finally {
      setDocActionId(null);
    }
  };

  if (loading) return <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>;
  if (error && !company) return <div className="text-red-500 text-center py-12">{error}</div>;
  if (!company) return <div className="text-center py-12 text-gray-400">Company not found</div>;

  const isProvider = company.is_provider || (company.company_type !== "buyer" && company.company_type !== "platform_admin");

  return (
    <div>
      <button onClick={() => router.push("/super-admin/companies")} className="text-sm text-accent hover:underline mb-4 inline-block">
        ← Back to Companies
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-sm text-gray-500">{company.email} · {company.company_type?.replace(/_/g, " ")}</p>
        </div>
        <div className="flex gap-2">
          <StatusButton
            label="Approve"
            loading={actionLoading === "approve"}
            onClick={() => performAction("approve", actionMap.approve)}
            variant="primary"
            disabled={company.status === "active"}
          />
          <StatusButton
            label="Reject"
            loading={actionLoading === "reject"}
            onClick={() => performAction("reject", actionMap.reject)}
            variant="danger"
            disabled={company.status === "rejected"}
          />
          <StatusButton
            label="Suspend"
            loading={actionLoading === "suspend"}
            onClick={() => performAction("suspend", actionMap.suspend)}
            variant="warning"
            disabled={company.status === "suspended"}
          />
          <StatusButton
            label="Reactivate"
            loading={actionLoading === "reactivate"}
            onClick={() => performAction("reactivate", actionMap.reactivate)}
            variant="secondary"
            disabled={company.status === "active"}
          />
          <StatusButton
            label="Payment Suspend"
            loading={actionLoading === "payment-suspend"}
            onClick={() => performAction("payment-suspend", actionMap["payment-suspend"])}
            variant="danger"
            disabled={company.status === "payment_suspended"}
          />
          <StatusButton
            label="Clear Payment"
            loading={actionLoading === "clear-payment"}
            onClick={() => performAction("clear-payment", actionMap["clear-payment"])}
            variant="secondary"
            disabled={company.status !== "payment_suspended"}
          />
        </div>
      </div>

      {message && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{message}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="mb-4">
        <input
          type="text"
          placeholder="Reason for action (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-full max-w-md"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Company Details</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Status", company.status],
                ["Verification", company.verification_status || "—"],
                ["Company Type", company.company_type?.replace(/_/g, " ")],
                ["Is Provider", company.is_provider ? "Yes" : "No"],
                ["Created", new Date(company.created_at).toLocaleString()],
                ["Status Changed", company.status_changed_at ? new Date(company.status_changed_at).toLocaleString() : "—"],
                ["Change Reason", company.status_change_reason || "—"],
                ["Subscription", `${company.plan_display_name || "Free"} (${company.subscription_status || "free_active"})`],
                ["Period End", company.current_period_end ? new Date(company.current_period_end).toLocaleDateString() : "—"],
                ["Trial End", company.trial_end_at ? new Date(company.trial_end_at).toLocaleDateString() : "—"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-400">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Verification Documents */}
          {isProvider && company.verification_documents && company.verification_documents.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold mb-4">Verification Documents</h2>
              <div className="space-y-4">
                {company.verification_documents.map((doc: any) => (
                  <div key={doc.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                          doc.status === "approved" ? "bg-green-100 text-green-700" :
                          doc.status === "rejected" ? "bg-red-100 text-red-700" :
                          doc.status === "needs_reupload" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {doc.status}
                        </span>
                      </div>
                      <a
                        href={api.getDocumentDownloadUrl(doc.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:underline"
                      >
                        View
                      </a>
                    </div>
                    <p className="text-xs text-gray-400">{doc.file_name} · {(doc.file_size / 1024).toFixed(1)} KB</p>
                    {doc.rejection_reason && <p className="text-xs text-red-500 mt-1">Reason: {doc.rejection_reason}</p>}
                    {doc.admin_review_notes && <p className="text-xs text-gray-500 mt-1">Notes: {doc.admin_review_notes}</p>}

                    {doc.status === "pending" && (
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          placeholder="Rejection reason (for reject/reupload)"
                          value={docRejectReason}
                          onChange={(e) => setDocRejectReason(e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-full"
                        />
                        <input
                          type="text"
                          placeholder="Internal notes (optional)"
                          value={docNotes}
                          onChange={(e) => setDocNotes(e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-full"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDocAction(doc.id, "approve")}
                            disabled={docActionId === doc.id}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            {docActionId === doc.id ? "..." : "Approve"}
                          </button>
                          <button
                            onClick={() => handleDocAction(doc.id, "reject")}
                            disabled={docActionId === doc.id}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            {docActionId === doc.id ? "..." : "Reject"}
                          </button>
                          <button
                            onClick={() => handleDocAction(doc.id, "request-reupload")}
                            disabled={docActionId === doc.id}
                            className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                          >
                            {docActionId === doc.id ? "..." : "Request Re-upload"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Users</h2>
            <div className="space-y-3">
              {company.users?.map((u: any) => (
                <div key={u.id} className="text-sm border-b pb-2 last:border-0">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                  <p className="text-xs text-gray-500 capitalize">{u.company_role || u.role} · {u.account_status}</p>
                </div>
              ))}
              {(!company.users || company.users.length === 0) && (
                <p className="text-sm text-gray-400">No users</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusButton({ label, loading, onClick, variant, disabled }: {
  label: string; loading: boolean; onClick: () => void; variant: "primary" | "danger" | "warning" | "secondary"; disabled: boolean;
}) {
  const colors = {
    primary: "bg-accent text-white hover:bg-accent-bold",
    danger: "bg-red-600 text-white hover:bg-red-700",
    warning: "bg-amber-600 text-white hover:bg-amber-700",
    secondary: "bg-gray-600 text-white hover:bg-gray-700",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-40 ${colors[variant]}`}
    >
      {loading ? "..." : label}
    </button>
  );
}
