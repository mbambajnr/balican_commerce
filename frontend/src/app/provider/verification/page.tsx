"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "business_registration", label: "Business Registration" },
  { value: "certificate_of_incorporation", label: "Certificate of Incorporation" },
  { value: "tax_identification", label: "TIN (GRA)" },
  { value: "company_profile", label: "Company Profile" },
  { value: "director_or_owner_id", label: "Director/Owner ID" },
  { value: "proof_of_address", label: "Proof of Address" },
  { value: "professional_license", label: "Professional License" },
  { value: "insurance_certificate", label: "Insurance Certificate" },
  { value: "portfolio_or_past_projects", label: "Portfolio/Past Projects" },
  { value: "other", label: "Other" },
];

const STATUS_META: Record<string, { label: string; color: string; desc: string }> = {
  not_started: { label: "Not Started", color: "text-gray-500", desc: "Verification not yet initiated." },
  required: { label: "Verification Required", color: "text-amber-600", desc: "Please upload documents to begin verification." },
  submitted: { label: "Submitted", color: "text-blue-600", desc: "Documents submitted, awaiting admin review." },
  under_review: { label: "Under Review", color: "text-indigo-600", desc: "An admin is reviewing your documents." },
  changes_requested: { label: "Changes Requested", color: "text-rose-600", desc: "Some documents need correction. Please check the feedback and re-upload." },
  approved: { label: "Approved", color: "text-green-600", desc: "Verification complete. You can now trade on the platform." },
  rejected: { label: "Rejected", color: "text-red-600", desc: "Verification was rejected. Contact support for more information." },
};

export default function ProviderVerificationPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [docType, setDocType] = useState(DOCUMENT_TYPE_OPTIONS[0].value);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const loadStatus = () => {
    setLoading(true);
    api.getVerificationStatus()
      .then(setStatus)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStatus(); }, []);

  const handleUpload = async () => {
    if (!file) { setError("Please select a file"); return; }
    setUploading(true);
    setError("");
    setSuccessMsg("");
    try {
      await api.uploadVerificationDocument(docType, file);
      setSuccessMsg("Document uploaded successfully");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteVerificationDocument(id);
      loadStatus();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    setSuccessMsg("");
    try {
      await api.submitVerification();
      setSuccessMsg("Verification submitted for review");
      loadStatus();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayment = async () => {
    setPaying(true);
    setError("");
    setSuccessMsg("");
    try {
      const result = await api.initVerificationPayment();
      if (result.alreadyPaid) {
        setSuccessMsg("Verification fee already paid. You can submit for review.");
        loadStatus();
        return;
      }
      if (!result.authorizationUrl) {
        throw new Error("Payment authorization URL was not returned");
      }
      window.location.href = result.authorizationUrl;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>;

  const meta = STATUS_META[status?.verificationStatus] || STATUS_META.not_started;
  const canSubmit = ["not_started", "required", "changes_requested"].includes(status?.verificationStatus);
  const docs = status?.documents || [];
  const fee = status?.verificationFee;
  const feePaid = fee?.latestPayment?.status === "paid";
  const feeWaived = status?.feeWaiver?.active;
  const canSubmitForReview = Boolean(fee?.canSubmitForReview);
  const businessProfileComplete = status?.businessProfile?.complete !== false;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Provider Verification</h1>

      <div className={`mb-6 rounded-lg border bg-white p-5 shadow-sm sm:p-6 ${status?.verificationStatus === "approved" ? "border-green-200" : ""}`}>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Status</h2>
          <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
        </div>
        <p className="text-sm text-gray-500">{meta.desc}</p>
        {status?.verifiedUntil && (
          <p className="text-xs text-green-700 mt-2">Balican Verified until {new Date(status.verifiedUntil).toLocaleDateString()}</p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{successMsg}</div>
      )}
      {!businessProfileComplete && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Complete your company profile before submitting.</p>
          <p className="mt-1 text-xs">Missing: {status.businessProfile.missingFields.map((field: any) => field.label).join(", ")}.</p>
          <Link href="/account/company-profile?returnTo=%2Fprovider" className="mt-3 inline-block font-semibold underline">Complete company profile</Link>
        </div>
      )}

      {/* Payment Section */}
      <div className="mb-6 rounded-lg border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">Balican Verified Fee</h2>
            <p className="text-sm text-gray-500">
              Pay once per verification period before your documents enter admin review.
            </p>
            {fee && (
              <p className="text-sm font-medium mt-2">GH₵ {Number(fee.amount).toLocaleString()} / {fee.renewalPeriodDays} days</p>
            )}
            {feeWaived && (
              <p className="text-xs text-amber-700 mt-2">
                Fee waived until {new Date(status.feeWaiver.waivedUntil).toLocaleDateString()}
                {status.feeWaiver.reason ? ` — ${status.feeWaiver.reason}` : ""}
              </p>
            )}
            {feePaid && (
              <p className="text-xs text-green-700 mt-2">
                Paid {fee.latestPayment.paid_at ? new Date(fee.latestPayment.paid_at).toLocaleString() : ""}
              </p>
            )}
            {fee?.latestPayment?.status === "pending" && (
              <p className="text-xs text-blue-700 mt-2">Payment initialized. Complete checkout or wait for Paystack confirmation.</p>
            )}
          </div>
          <button
            onClick={handlePayment}
            disabled={paying || feePaid || feeWaived || status?.verificationStatus === "approved"}
            className="min-h-11 w-full shrink-0 rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent-bold disabled:opacity-50 sm:w-auto"
          >
            {paying ? "Starting..." : feePaid || feeWaived ? "Payment Complete" : "Pay Fee"}
          </button>
        </div>
      </div>

      {/* Upload Section */}
      <div className="mb-6 rounded-lg border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Upload Document</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full">
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File (PDF, PNG, JPG — max 10MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="border rounded-lg px-3 py-2 text-sm w-full"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="min-h-11 w-full rounded-lg bg-accent px-4 py-2 text-sm text-white hover:bg-accent-bold disabled:opacity-50 sm:w-auto"
          >
            {uploading ? "Uploading..." : "Upload Document"}
          </button>
        </div>
      </div>

      {/* Uploaded Documents */}
      {docs.length > 0 && (
        <div className="mb-6 rounded-lg border bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold mb-4">Uploaded Documents ({docs.length})</h2>
          <div className="space-y-3">
            {docs.map((doc: any) => (
              <div key={doc.id} className="flex flex-col gap-2 border-b pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{DOCUMENT_TYPE_OPTIONS.find(o => o.value === doc.document_type)?.label || doc.document_type}</p>
                  <p className="text-xs text-gray-400">{doc.file_name} ({(doc.file_size / 1024).toFixed(1)} KB)</p>
                  {doc.status === "needs_reupload" && doc.rejection_reason && (
                    <p className="text-xs text-amber-600 mt-1">Feedback: {doc.rejection_reason}</p>
                  )}
                  {doc.status === "rejected" && doc.rejection_reason && (
                    <p className="text-xs text-red-500 mt-1">Rejected: {doc.rejection_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${
                    doc.status === "approved" ? "text-green-600" :
                    doc.status === "rejected" ? "text-red-600" :
                    doc.status === "needs_reupload" ? "text-amber-600" :
                    "text-gray-500"
                  }`}>
                    {doc.status.replace(/_/g, " ")}
                  </span>
                  {doc.status === "pending" && (
                    <button onClick={() => handleDelete(doc.id)} className="min-h-11 rounded-lg px-3 text-xs text-red-500 hover:bg-red-50">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div className="rounded-lg border bg-white p-5 shadow-sm sm:p-6">
        <button
          onClick={handleSubmit}
          disabled={submitting || !canSubmit || docs.length === 0 || !canSubmitForReview || !businessProfileComplete}
          className="min-h-11 w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit for Review"}
        </button>
        <p className="text-xs text-gray-400 text-center mt-2">
          {!businessProfileComplete
            ? "Complete your company profile before submitting"
            : docs.length === 0
            ? "Upload at least one document before submitting"
            : !canSubmitForReview
              ? "Pay the Balican Verified fee or request a waiver before submitting"
              : "Once submitted, an admin will review your documents"}
        </p>
      </div>
    </div>
  );
}
