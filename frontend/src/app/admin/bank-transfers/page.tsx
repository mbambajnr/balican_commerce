"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Bank, Check, X } from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import EmptyState from "@/components/admin/EmptyState";
import { CardSkeleton } from "@/components/admin/LoadingSkeleton";
import { formatCurrency, formatDate } from "@/lib/format";

type Tab = "pending" | "approved" | "rejected";

export default function AdminBankTransfersPage() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [rejecting, setRejecting] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.adminGetPayments({ method: "bank_transfer" });
      setTransfers(res.bankTransfers || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = transfers.filter((t: any) => {
    if (tab === "pending") return t.status === "pending_verification";
    if (tab === "approved") return t.status === "successful";
    return t.status === "rejected";
  });

  const handleApprove = async (id: string) => {
    try {
      await api.adminApproveBankTransfer(id);
      toast.success("Bank transfer approved");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    try {
      await api.adminRejectBankTransfer(rejecting.id, rejectReason || undefined);
      toast.success("Bank transfer rejected");
      setRejecting(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to reject");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Bank Transfers</h1>
          <p className="mt-1 text-sm text-soft">Verify and manage bank transfer payments</p>
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

      {loading ? (
        <CardSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="default" title={`No ${tab} transfers`} />
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t: any) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Bank size={20} weight="duotone" />
                </div>
                <StatusBadge status={t.status} />
              </div>
              <p className="mt-4 text-2xl font-bold tracking-tight text-ink">
                {formatCurrency(t.amount || 0)}
              </p>
              <div className="mt-3 space-y-1.5 text-sm">
                <p className="text-muted">
                  Bank: <span className="text-ink font-medium">{t.bank_name || "\u2014"}</span>
                </p>
                <p className="text-muted">
                  Reference: <span className="text-ink font-medium">{t.transfer_reference || t.reference || "\u2014"}</span>
                </p>
                <p className="text-muted">
                  Customer: <span className="text-ink font-medium">{t.first_name ? `${t.first_name} ${t.last_name}` : t.customer_name || "\u2014"}</span>
                </p>
                <p className="text-muted">
                  Order: <span className="text-ink font-medium">{t.order_number || t.order?.order_number || "\u2014"}</span>
                </p>
                <p className="text-muted">
                  Date: <span className="text-ink font-medium">{formatDate(t.created_at || t.createdAt)}</span>
                </p>
              </div>
              {(t.notes || t.admin_notes) && (
                <p className="mt-3 text-xs text-soft italic">{(t.notes || t.admin_notes)}</p>
              )}
              {tab === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleApprove(t.id)}
                    className="btn btn-sm btn-primary gap-1 flex-1"
                  >
                    <Check size={14} weight="bold" /> Approve
                  </button>
                  <button
                    onClick={() => setRejecting({ id: t.id, name: t.transfer_reference || t.id })}
                    className="btn btn-sm gap-1 flex-1 border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <X size={14} weight="bold" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setRejecting(null)}>
          <div className="card mx-4 w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold text-ink">Reject Transfer</h2>
            <p className="mt-1 text-sm text-soft">Reference: {rejecting.name}</p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="input-label">Reason for rejection</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="textarea"
                  rows={3}
                  placeholder="Enter reason..."
                />
              </div>
              <div className="flex gap-3">
                <button onClick={handleReject} className="btn btn-danger flex-1">Reject</button>
                <button onClick={() => setRejecting(null)} className="btn flex-1">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
