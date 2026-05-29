"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import toast from "react-hot-toast";
import { CheckCircle, Clock, XCircle, NotePencil, Clipboard } from "@phosphor-icons/react";

export default function CompanyDetailPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [customerGroups, setCustomerGroups] = useState<any[]>([]);
  const [salesReps, setSalesReps] = useState<any[]>([]);
  const [approving, setApproving] = useState(false);

  // Credit approval state
  const [creditTab, setCreditTab] = useState<string>("view");
  const [creditApproving, setCreditApproving] = useState(false);
  const [creditForm, setCreditForm] = useState({
    approvedCreditLimit: 0,
    paymentTermsDays: 30,
    creditRiskRating: "low",
    reviewNotes: "",
    nextReviewAt: "",
    rejectionReason: "",
  });
  const [vetting, setVetting] = useState<any>(null);
  const [vettingLoading, setVettingLoading] = useState(false);
  const [bizVetting, setBizVetting] = useState<any>(null);
  const [bizVettingLoading, setBizVettingLoading] = useState(false);
  const [bizVettingTab, setBizVettingTab] = useState<string>("view");
  const [bizVettingNote, setBizVettingNote] = useState("");
  const [bizVettingActing, setBizVettingActing] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "admin" && user.role !== "super_admin"))) {
      router.push("/admin/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!id || (user?.role !== "admin" && user?.role !== "super_admin")) return;
    Promise.all([
      api.getCompany(id as string),
      api.getCustomerGroups(),
      api.getSalesReps(),
    ]).then(([c, groups, reps]) => {
      setCompany(c.company);
      setCustomerGroups(groups.customerGroups);
      setSalesReps(reps.salesReps);
    }).catch(() => toast.error("Failed to load company")).finally(() => setLoading(false));
  }, [id, user]);

  const fetchVetting = async () => {
    setVettingLoading(true);
    try {
      const v = await api.adminGetCreditVetting(id as string);
      setVetting(v);
    } catch {
      // Non-critical; silently ignore
    } finally {
      setVettingLoading(false);
    }
  };

  const fetchBizVetting = async () => {
    setBizVettingLoading(true);
    try {
      const v = await api.adminGetCompanyVetting(id as string);
      setBizVetting(v.vetting);
    } catch {
      // Non-critical
    } finally {
      setBizVettingLoading(false);
    }
  };

  const handleBizVettingAction = async (status: string) => {
    setBizVettingActing(true);
    try {
      const res = await api.adminUpdateVettingStatus(id as string, { status, note: bizVettingNote || undefined });
      toast.success(`Vetting ${status}`);
      setBizVettingTab("view");
      setBizVettingNote("");
      // Refresh
      const v = await api.adminGetCompanyVetting(id as string);
      setBizVetting(v.vetting);
    } catch (err: any) {
      toast.error(err.message || "Failed to update vetting status");
    } finally {
      setBizVettingActing(false);
    }
  };

  const handleAddBizVettingNote = async () => {
    if (!bizVettingNote.trim()) return toast.error("Note is required");
    setBizVettingActing(true);
    try {
      await api.adminAddVettingNote(id as string, { note: bizVettingNote });
      toast.success("Note added");
      setBizVettingNote("");
      const v = await api.adminGetCompanyVetting(id as string);
      setBizVetting(v.vetting);
    } catch (err: any) {
      toast.error(err.message || "Failed to add note");
    } finally {
      setBizVettingActing(false);
    }
  };

  useEffect(() => {
    fetchBizVetting();
  }, [id]);

  const handleApprove = async (status: string) => {
    setApproving(true);
    try {
      const res = await api.approveCompany(id as string, {
        status,
        customerGroupId: company.customer_group_id || undefined,
        assignedSalesRepId: company.assigned_sales_rep_id || undefined,
      });
      setCompany({ ...company, ...res.company });
      toast.success(`Company ${status === "active" ? "approved" : "rejected"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setApproving(false);
    }
  };

  const handleUpdate = async (data: any) => {
    try {
      const res = await api.updateCompany(id as string, data);
      setCompany({ ...company, ...res.company });
      toast.success("Company updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  const handleCreditApprove = async () => {
    setCreditApproving(true);
    try {
      const res = await api.adminApproveCompanyCredit(id as string, {
        approvedCreditLimit: creditForm.approvedCreditLimit,
        paymentTermsDays: creditForm.paymentTermsDays,
        creditRiskRating: creditForm.creditRiskRating,
        reviewNotes: creditForm.reviewNotes || undefined,
        nextReviewAt: creditForm.nextReviewAt || undefined,
      });
      setCompany({ ...company, ...res.company });
      setCreditTab("view");
      toast.success("Credit approved");
    } catch (err: any) {
      toast.error(err.message || "Failed to approve credit");
    } finally {
      setCreditApproving(false);
    }
  };

  const handleCreditReject = async () => {
    if (!creditForm.rejectionReason) return toast.error("Rejection reason is required");
    setCreditApproving(true);
    try {
      const res = await api.adminRejectCompanyCredit(id as string, {
        rejectionReason: creditForm.rejectionReason,
        reviewNotes: creditForm.reviewNotes || undefined,
      });
      setCompany({ ...company, ...res.company });
      setCreditTab("view");
      toast.success("Credit rejected");
    } catch (err: any) {
      toast.error(err.message || "Failed to reject credit");
    } finally {
      setCreditApproving(false);
    }
  };

  const handleCreditSuspend = async () => {
    if (!confirm("Suspend credit facility for this company?")) return;
    setCreditApproving(true);
    try {
      const res = await api.adminSuspendCompanyCredit(id as string);
      setCompany({ ...company, ...res.company });
      toast.success("Credit suspended");
    } catch (err: any) {
      toast.error(err.message || "Failed to suspend credit");
    } finally {
      setCreditApproving(false);
    }
  };

  const handleCreditReactivate = async () => {
    setCreditApproving(true);
    try {
      const res = await api.adminReactivateCompanyCredit(id as string);
      setCompany({ ...company, ...res.company });
      toast.success("Credit reactivated");
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate credit");
    } finally {
      setCreditApproving(false);
    }
  };

  const creditStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      not_requested: "badge-gray",
      pending_review: "badge-yellow",
      approved: "badge-green",
      rejected: "badge-red",
      suspended: "badge-red",
    };
    return map[status] || "badge-gray";
  };

  if (authLoading || loading) return <PageSkeleton />;
  if (!company) return <div className="p-8 text-center text-soft">Company not found</div>;

  const credit = company;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{company.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {company.email} &middot; Registered {new Date(company.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          {company.status === "pending" && (
            <>
              <button onClick={() => handleApprove("active")} disabled={approving}
                className="btn btn-primary btn-sm gap-1.5"><span className="text-green-300">✓</span> Approve</button>
              <button onClick={() => handleApprove("rejected")} disabled={approving}
                className="btn btn-sm border-red-200 text-red-600 hover:bg-red-50 gap-1.5">✕ Reject</button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Company Info */}
        <div className="card p-6">
          <h2 className="font-display text-sm font-semibold text-ink mb-4 uppercase tracking-wider">Company Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Status</dt>
              <dd><span className={`badge ${company.status === "active" ? "badge-green" : company.status === "pending" ? "badge-yellow" : "badge-red"}`}>{company.status}</span></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Credit Status</dt>
              <dd><span className={`badge ${creditStatusBadge(company.credit_status)}`}>{company.credit_status?.replace(/_/g, " ") || "not requested"}</span></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Business Type</dt><dd>{company.business_type || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Industry</dt><dd>{company.industry || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax / TIN</dt><dd>{company.tax_id || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Reg Number</dt><dd>{company.business_registration_number || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Customer Group</dt>
              <dd>
                <select value={company.customer_group_id || ""} onChange={(e) => {
                  const val = e.target.value;
                  setCompany({ ...company, customer_group_id: val });
                  handleUpdate({ customerGroupId: val || null });
                }} className="rounded-lg border border-border px-2 py-1 text-sm">
                  <option value="">None</option>
                  {customerGroups.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name} (min: GH₵{Number(g.minimum_order_amount).toLocaleString()})</option>
                  ))}
                </select>
              </dd></div>
          </dl>
        </div>

        {/* Contact Info */}
        <div className="card p-6">
          <h2 className="font-display text-sm font-semibold text-ink mb-4 uppercase tracking-wider">Contact</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Address</dt><dd className="text-right">{company.address || "\u2014"}{company.city ? `, ${company.city}` : ""}{company.state ? `, ${company.state}` : ""}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Contact Person</dt><dd>{company.contact_person_name || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Contact Email</dt><dd>{company.contact_person_email || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Contact Phone</dt><dd>{company.contact_person_phone || "\u2014"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Payment Terms</dt><dd>{company.requested_payment_terms || "\u2014"}</dd></div>
          </dl>

          {/* Registration Attribution */}
          {company.registration_attribution?.utm_source && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Registration Source</p>
              <dl className="space-y-2 text-sm">
                {company.registration_attribution.utm_source && <div className="flex justify-between"><dt className="text-muted">Source</dt><dd>{company.registration_attribution.utm_source}</dd></div>}
                {company.registration_attribution.utm_campaign && <div className="flex justify-between"><dt className="text-muted">Campaign</dt><dd>{company.registration_attribution.utm_campaign}</dd></div>}
                {company.registration_attribution.utm_medium && <div className="flex justify-between"><dt className="text-muted">Medium</dt><dd>{company.registration_attribution.utm_medium}</dd></div>}
                {company.registration_attribution.referrer_url && <div className="flex justify-between"><dt className="text-muted">Referrer</dt><dd className="text-right text-xs max-w-[200px] truncate">{company.registration_attribution.referrer_url}</dd></div>}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        {[
          { label: "Users", value: company.user_count },
          { label: "Orders", value: company.stats?.totalOrders || 0 },
          { label: "RFQs", value: company.stats?.totalRfqs || 0 },
          { label: "Total Spent", value: `GH₵${Number(company.stats?.totalSpent || 0).toLocaleString()}` },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-xl font-bold text-ink">{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Sales Rep Assignment */}
      <div className="card p-6 mb-6">
        <h2 className="font-display text-sm font-semibold text-ink mb-4 uppercase tracking-wider">Account Manager</h2>
        <div className="flex items-center gap-4">
          <select value={company.assigned_sales_rep_id || ""} onChange={(e) => {
            const val = e.target.value;
            setCompany({ ...company, assigned_sales_rep_id: val });
            handleUpdate({ assignedSalesRepId: val || null });
          }} className="input max-w-xs">
            <option value="">No sales rep assigned</option>
            {salesReps.map((r: any) => (
              <option key={r.id} value={r.id}>{r.first_name} {r.last_name} ({r.role})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Credit Approval Section */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold text-ink uppercase tracking-wider">
            Credit Approval
            <span className={`ml-2 badge ${creditStatusBadge(company.credit_status)}`}>
              {company.credit_status?.replace(/_/g, " ") || "not requested"}
            </span>
          </h2>
          <div className="flex gap-2">
            {(company.credit_status === "pending_review" || company.credit_status === "rejected" || company.credit_status === "suspended") && (
              <button onClick={() => { setCreditTab("approve"); setCreditForm({ ...creditForm, rejectionReason: "" }); }}
                className="btn btn-primary btn-sm">Approve</button>
            )}
            {company.credit_status === "pending_review" && (
              <button onClick={() => setCreditTab("reject")}
                className="btn btn-sm border-red-200 text-red-600 hover:bg-red-50">Reject</button>
            )}
            {company.credit_status === "approved" && (
              <button onClick={handleCreditSuspend} disabled={creditApproving}
                className="btn btn-sm border-red-200 text-red-600 hover:bg-red-50">Suspend</button>
            )}
            {(company.credit_status === "suspended" || company.credit_status === "rejected") && (
              <button onClick={handleCreditReactivate} disabled={creditApproving}
                className="btn btn-sm border-blue-200 text-accent hover:bg-blue-50">Reactivate</button>
            )}
            <button onClick={() => { setCreditTab("vetting"); if (!vetting) fetchVetting(); }}
              className={`btn btn-sm ${creditTab === "vetting" ? "btn-primary" : "btn-ghost"}`}>Vetting</button>
          </div>
        </div>

        {/* Credit Status Display */}
        {creditTab === "view" && (
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs text-muted uppercase tracking-wider">Approved Limit</p>
              <p className="text-lg font-bold text-ink">GH₵{Number(company.approved_credit_limit || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs text-muted uppercase tracking-wider">Credit Used</p>
              <p className="text-lg font-bold text-ink">GH₵{Number(company.credit_used || 0).toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-4">
              <p className="text-xs text-muted uppercase tracking-wider">Available</p>
              <p className="text-lg font-bold text-ink">
                GH₵{Math.max(0, Number(company.approved_credit_limit || 0) - Number(company.credit_used || 0)).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Credit Details */}
        {creditTab === "view" && (
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><dt className="text-muted">Risk Rating</dt><dd className="font-medium capitalize">{company.credit_risk_rating || "low"}</dd></div>
            <div><dt className="text-muted">Requested Limit</dt><dd className="font-medium">GH₵{Number(company.requested_credit_limit || 0).toLocaleString()}</dd></div>
            {company.credit_rejection_reason && (
              <div className="sm:col-span-2"><dt className="text-muted">Rejection Reason</dt><dd className="font-medium text-red-600">{company.credit_rejection_reason}</dd></div>
            )}
            {company.credit_review_notes && (
              <div className="sm:col-span-2"><dt className="text-muted">Review Notes</dt><dd className="font-medium">{company.credit_review_notes}</dd></div>
            )}
            {company.credit_approved_at && (
              <div><dt className="text-muted">Approved At</dt><dd className="font-medium">{new Date(company.credit_approved_at).toLocaleDateString()}</dd></div>
            )}
            {company.next_review_at && (
              <div><dt className="text-muted">Next Review</dt><dd className="font-medium">{new Date(company.next_review_at).toLocaleDateString()}</dd></div>
            )}
            {company.finance_contact_name && (
              <div className="sm:col-span-2"><dt className="text-muted">Finance Contact</dt><dd className="font-medium">{company.finance_contact_name}{company.finance_contact_email ? ` · ${company.finance_contact_email}` : ""}{company.finance_contact_phone ? ` · ${company.finance_contact_phone}` : ""}</dd></div>
            )}
          </dl>
        )}

        {/* Approve Form */}
        {creditTab === "approve" && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="input-label">Approved Credit Limit (GH₵)</label>
                <input type="number" min={0} className="input" value={creditForm.approvedCreditLimit}
                  onChange={(e) => setCreditForm({ ...creditForm, approvedCreditLimit: Number(e.target.value) })} />
              </div>
              <div>
                <label className="input-label">Payment Terms (days)</label>
                <input type="number" min={0} max={365} className="input" value={creditForm.paymentTermsDays}
                  onChange={(e) => setCreditForm({ ...creditForm, paymentTermsDays: Number(e.target.value) })} />
              </div>
              <div>
                <label className="input-label">Risk Rating</label>
                <select className="input" value={creditForm.creditRiskRating}
                  onChange={(e) => setCreditForm({ ...creditForm, creditRiskRating: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="input-label">Next Review Date</label>
                <input type="date" className="input" value={creditForm.nextReviewAt}
                  onChange={(e) => setCreditForm({ ...creditForm, nextReviewAt: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="input-label">Review Notes (internal)</label>
                <textarea className="input" rows={3} value={creditForm.reviewNotes}
                  onChange={(e) => setCreditForm({ ...creditForm, reviewNotes: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreditApprove} disabled={creditApproving || !creditForm.approvedCreditLimit}
                className="btn btn-primary">Confirm Approval</button>
              <button onClick={() => setCreditTab("view")} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Reject Form */}
        {creditTab === "reject" && (
          <div className="space-y-4 border-t border-border pt-4">
            <div>
              <label className="input-label">Rejection Reason *</label>
              <textarea className="input" rows={3} value={creditForm.rejectionReason}
                onChange={(e) => setCreditForm({ ...creditForm, rejectionReason: e.target.value })} />
            </div>
            <div>
              <label className="input-label">Internal Notes</label>
              <textarea className="input" rows={2} value={creditForm.reviewNotes}
                onChange={(e) => setCreditForm({ ...creditForm, reviewNotes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreditReject} disabled={creditApproving || !creditForm.rejectionReason}
                className="btn btn-danger">Confirm Rejection</button>
              <button onClick={() => setCreditTab("view")} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Vetting Results */}
        {creditTab === "vetting" && (
          <div className="border-t border-border pt-4">
            {vettingLoading ? (
              <p className="text-sm text-muted">Running credit assessment...</p>
            ) : !vetting ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted mb-3">Run a heuristic assessment to help guide credit decisions.</p>
                <button onClick={fetchVetting} className="btn btn-primary btn-sm">Run Vetting</button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Risk Level Banner */}
                <div className={`rounded-lg p-4 ${vetting.suggestedRiskLevel === "low" ? "bg-green-50 border border-green-200" : vetting.suggestedRiskLevel === "medium" ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wider">Suggested Risk Level</p>
                      <p className={`text-xl font-bold mt-0.5 capitalize ${vetting.suggestedRiskLevel === "low" ? "text-green-700" : vetting.suggestedRiskLevel === "medium" ? "text-amber-700" : "text-red-700"}`}>
                        {vetting.suggestedRiskLevel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted uppercase tracking-wider">Heuristic Score</p>
                      <p className={`text-xl font-bold mt-0.5 ${vetting.scores.weightedTotal >= 70 ? "text-green-700" : vetting.scores.weightedTotal >= 40 ? "text-amber-700" : "text-red-700"}`}>
                        {vetting.scores.weightedTotal}%
                      </p>
                    </div>
                  </div>
                  {vetting.suggestedCreditLimit !== null && (
                    <p className="text-sm mt-2">
                      Suggested starting limit: <span className="font-semibold">GH₵{Number(vetting.suggestedCreditLimit).toLocaleString()}</span>
                    </p>
                  )}
                  {vetting.suggestedCreditLimit === null && (
                    <p className="text-sm mt-2 text-muted">Insufficient data to suggest a credit limit.</p>
                  )}
                </div>

                {/* Score Breakdown */}
                <div>
                  <p className="text-xs text-muted uppercase tracking-wider mb-2 font-semibold">Score Breakdown</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Account Age", score: vetting.scores.accountAge, weight: "10%" },
                      { label: "Profile", score: vetting.scores.profileCompleteness, weight: "15%" },
                      { label: "Order History", score: vetting.scores.orderHistory, weight: "30%" },
                      { label: "Payment History", score: vetting.scores.paymentHistory, weight: "25%" },
                      { label: "Engagement", score: vetting.scores.engagementLevel, weight: "10%" },
                      { label: "Sales Rep", score: vetting.scores.salesRepAssignment, weight: "10%" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg bg-zinc-50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted">{s.label} ({s.weight})</span>
                          <span className={`text-xs font-bold ${s.score >= 70 ? "text-green-600" : s.score >= 40 ? "text-amber-600" : "text-red-600"}`}>{s.score}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-zinc-200">
                          <div className={`h-1.5 rounded-full transition-all ${s.score >= 70 ? "bg-green-500" : s.score >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${s.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Warnings */}
                {vetting.warnings.length > 0 && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wider mb-2 font-semibold">Flags / Warnings</p>
                    <ul className="space-y-1">
                      {vetting.warnings.map((w: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="mt-0.5 text-amber-500 shrink-0">⚠</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Details */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted hover:text-ink font-medium">View details</summary>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2 text-sm bg-zinc-50 rounded-lg p-3">
                    <div className="flex justify-between"><dt className="text-muted">Account age</dt><dd>{vetting.details.accountAgeDays} days</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Profile fields</dt><dd>{vetting.details.profileFieldsPresent}/{vetting.details.profileFieldsTotal}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Total orders</dt><dd>{vetting.details.totalOrders}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Total spent</dt><dd>GH₵{Number(vetting.details.totalSpent).toLocaleString()}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Avg order value</dt><dd>{vetting.details.avgOrderValue ? `GH₵${Number(vetting.details.avgOrderValue).toLocaleString()}` : "\u2014"}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Overdue</dt><dd className={vetting.details.overdueOutstanding > 0 ? "text-red-600 font-medium" : ""}>{vetting.details.overdueOutstanding > 0 ? `GH₵${Number(vetting.details.overdueOutstanding).toLocaleString()}` : "None"}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Cancelled orders</dt><dd>{vetting.details.cancelledOrderCount}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Payments</dt><dd>{vetting.details.totalPayments}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">RFQs</dt><dd>{vetting.details.totalRfqs}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Quotations</dt><dd>{vetting.details.totalQuotations}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Accepted quotes</dt><dd>{vetting.details.acceptedQuotations}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Requested limit</dt><dd>{vetting.details.requestedCreditLimit ? `GH₵${Number(vetting.details.requestedCreditLimit).toLocaleString()}` : "\u2014"}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Sales rep</dt><dd>{vetting.details.hasAssignedSalesRep ? "Yes" : "No"}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Tax ID</dt><dd>{vetting.details.hasTaxId ? "Yes" : "No"}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Reg number</dt><dd>{vetting.details.hasRegNumber ? "Yes" : "No"}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Finance contact</dt><dd>{vetting.details.hasFinanceContact ? "Complete" : "Incomplete"}</dd></div>
                  </dl>
                </details>

                <p className="text-xs text-muted italic border-t border-border pt-3">
                  This assessment is heuristic only and does not auto-approve credit. Final decisions must be made by authorized personnel.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Company Users */}
      <div className="card overflow-hidden mb-6">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-sm font-semibold text-ink uppercase tracking-wider">Company Users</h2>
          <button onClick={() => {
            const email = prompt("Email:");
            if (!email) return;
            const password = prompt("Password (min 8 chars):");
            if (!password || password.length < 8) return toast.error("Password min 8 characters");
            const firstName = prompt("First name:");
            if (!firstName) return;
            const lastName = prompt("Last name:");
            if (!lastName) return;
            const companyRole = prompt("Role (company_admin / buyer / finance / viewer):") || "buyer";
            api.createCompanyUser(id as string, { email, password, firstName, lastName, companyRole })
              .then(() => { toast.success("User created"); return api.getCompany(id as string); })
              .then((res) => setCompany({ ...company, ...res.company }))
              .catch((err: any) => toast.error(err.message || "Failed to create user"));
          }} className="btn btn-primary btn-sm">+ Add User</button>
        </div>
        {company.users && company.users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {company.users.map((u: any) => (
                  <tr key={u.id} className="border-b border-border/50 text-sm hover:bg-zinc-50">
                    <td className="px-6 py-3 font-medium">{u.first_name} {u.last_name}</td>
                    <td className="px-6 py-3 text-muted">{u.email}</td>
                    <td className="px-6 py-3 capitalize">{u.company_role}</td>
                    <td className="px-6 py-3"><span className={`badge ${u.account_status === "active" ? "badge-green" : "badge-yellow"}`}>{u.account_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-sm text-muted">No users yet</div>
        )}
      </div>

      {/* Business Vetting Profile */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-sm font-semibold text-ink uppercase tracking-wider">
            Business Vetting Profile
          </h2>
          <button onClick={() => { if (!bizVetting) fetchBizVetting(); }} className="btn btn-sm btn-ghost">
            {bizVettingLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {bizVettingLoading ? (
          <p className="text-sm text-muted py-4">Loading vetting profile...</p>
        ) : !bizVetting ? (
          <div className="py-6 text-center">
            <Clipboard size={32} className="mx-auto text-muted mb-2" weight="light" />
            <p className="text-sm text-muted">No vetting profile submitted yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status Badge + Score */}
            <div className="flex flex-wrap items-center gap-3">
              <span className={`badge ${
                bizVetting.submission?.status === "approved" ? "badge-green" :
                bizVetting.submission?.status === "submitted" ? "badge-yellow" :
                bizVetting.submission?.status === "needs_info" ? "badge-yellow" :
                bizVetting.submission?.status === "rejected" ? "badge-red" :
                "badge-gray"
              }`}>
                {bizVetting.submission?.status?.replace(/_/g, " ") || "draft"}
              </span>
              {bizVetting.submission?.score != null && (
                <span className={`text-sm font-semibold ${
                  (bizVetting.scoreBandInfo?.color || "gray") === "green" ? "text-emerald-600" :
                  (bizVetting.scoreBandInfo?.color || "gray") === "amber" ? "text-amber-600" : "text-red-600"
                }`}>
                  Score: {bizVetting.submission.score} / {bizVetting.maxScore}
                </span>
              )}
              {bizVetting.scoreBandInfo && (
                <span className="text-xs text-muted">({bizVetting.scoreBandInfo.label} — {bizVetting.scoreBandInfo.description})</span>
              )}
              {bizVetting.submission?.submitted_at && (
                <span className="text-xs text-muted">
                  Submitted {new Date(bizVetting.submission.submitted_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Response Data */}
            {bizVetting.responses && bizVetting.responses.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 bg-zinc-50 rounded-xl p-4">
                {bizVetting.responses.map((r: any) => (
                  <div key={r.id} className="text-sm">
                    <p className="text-xs text-muted mb-0.5">{r.question_label || r.question_key}</p>
                    <p className="font-medium text-ink">{r.display_label || r.raw_value || "\u2014"}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Admin Actions */}
            {bizVetting.submission?.status === "submitted" || bizVetting.submission?.status === "needs_info" ? (
              <div className="border-t border-border pt-4 space-y-3">
                {bizVettingTab === "view" ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setBizVettingTab("approve")}
                      className="btn btn-sm btn-primary gap-1.5"><CheckCircle size={14} weight="bold" /> Approve</button>
                    <button onClick={() => setBizVettingTab("needs_info")}
                      className="btn btn-sm border-amber-200 text-amber-700 hover:bg-amber-50 gap-1.5"><Clock size={14} weight="bold" /> Needs More Info</button>
                    <button onClick={() => setBizVettingTab("reject")}
                      className="btn btn-sm border-red-200 text-red-600 hover:bg-red-50 gap-1.5"><XCircle size={14} weight="bold" /> Reject</button>
                  </div>
                ) : null}

                {bizVettingTab === "approve" && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-emerald-700">Approve this vetting profile?</p>
                    <textarea className="input w-full" rows={2} placeholder="Approval note (optional)"
                      value={bizVettingNote} onChange={(e) => setBizVettingNote(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => handleBizVettingAction("approved")} disabled={bizVettingActing}
                        className="btn btn-primary btn-sm">Confirm Approval</button>
                      <button onClick={() => { setBizVettingTab("view"); setBizVettingNote(""); }} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                )}

                {bizVettingTab === "reject" && (
                  <div className="space-y-3 border border-red-200 rounded-lg p-4 bg-red-50">
                    <p className="text-sm font-medium text-red-700">Reject vetting profile</p>
                    <textarea className="input w-full" rows={2} placeholder="Rejection reason..."
                      value={bizVettingNote} onChange={(e) => setBizVettingNote(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => handleBizVettingAction("rejected")} disabled={bizVettingActing || !bizVettingNote.trim()}
                        className="btn btn-sm border-red-200 text-red-600 hover:bg-red-100">Confirm Rejection</button>
                      <button onClick={() => { setBizVettingTab("view"); setBizVettingNote(""); }} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                )}

                {bizVettingTab === "needs_info" && (
                  <div className="space-y-3 border border-amber-200 rounded-lg p-4 bg-amber-50">
                    <p className="text-sm font-medium text-amber-700">Request more information</p>
                    <textarea className="input w-full" rows={2} placeholder="Describe what information is needed..."
                      value={bizVettingNote} onChange={(e) => setBizVettingNote(e.target.value)} />
                    <div className="flex gap-2">
                      <button onClick={() => handleBizVettingAction("needs_info")} disabled={bizVettingActing || !bizVettingNote.trim()}
                        className="btn btn-sm border-amber-200 text-amber-700 hover:bg-amber-100">Request Update</button>
                      <button onClick={() => { setBizVettingTab("view"); setBizVettingNote(""); }} className="btn btn-ghost btn-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {/* Add Note */}
            <div className="border-t border-border pt-3">
              <div className="flex gap-2">
                <input type="text" className="input flex-1" placeholder="Add an internal note..."
                  value={bizVettingNote} onChange={(e) => setBizVettingNote(e.target.value)} />
                <button onClick={handleAddBizVettingNote} disabled={bizVettingActing || !bizVettingNote.trim()}
                  className="btn btn-sm gap-1.5"><NotePencil size={14} /> Add Note</button>
              </div>
            </div>

            {/* Audit Log */}
            {bizVetting.auditLog && bizVetting.auditLog.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted uppercase tracking-wider mb-2 font-semibold">Activity Log</p>
                <div className="space-y-2">
                  {bizVetting.auditLog.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 text-sm bg-zinc-50 rounded-lg p-3">
                      <div className="mt-0.5">
                        {log.action === "approved" ? (
                          <CheckCircle size={14} className="text-emerald-500" weight="fill" />
                        ) : log.action === "rejected" ? (
                          <XCircle size={14} className="text-red-500" weight="fill" />
                        ) : (
                          <Clock size={14} className="text-amber-500" weight="fill" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-ink capitalize">{log.action?.replace(/_/g, " ")}</p>
                        {log.note && <p className="text-xs text-muted mt-0.5">{log.note}</p>}
                        <p className="text-xs text-muted mt-0.5">
                          {log.admin_name ? `by ${log.admin_name} · ` : ""}{new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                      {log.score_at_action != null && (
                        <span className="text-xs font-medium text-muted">Score: {log.score_at_action}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
