"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  Users, ArrowLeft, Plus, X, Envelope, Shield, UserCircle,
  CheckCircle, Prohibit, Star, UserPlus,
} from "@phosphor-icons/react";

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin",
  buyer: "Buyer",
  finance: "Finance",
  viewer: "Viewer",
};

const ROLE_PERMISSIONS: Record<string, string> = {
  company_admin: "Full access — manage team, view prices, place orders",
  buyer: "Place orders, request quotes, view prices",
  finance: "View invoices, payment terms, store credit",
  viewer: "View products, request quotes, no pricing",
};

export default function TeamPage() {
  const { user, loading: authLoading } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", password: "", firstName: "", lastName: "", phone: "", companyRole: "buyer" });
  const [inviting, setInviting] = useState(false);

  const fetchTeam = () => {
    api.getCompanyTeam()
      .then((res) => { setTeam(res.team); setCanManage(res.canManage); })
      .catch(() => toast.error("Failed to load team"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) fetchTeam();
    else setLoading(false);
  }, [user]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.password.trim() || !inviteForm.firstName.trim() || !inviteForm.lastName.trim()) {
      toast.error("Please fill in all required fields"); return;
    }
    setInviting(true);
    try {
      await api.createCompanyTeamMember(inviteForm);
      toast.success("Team member added");
      setShowInvite(false);
      setInviteForm({ email: "", password: "", firstName: "", lastName: "", phone: "", companyRole: "buyer" });
      fetchTeam();
    } catch (err: any) {
      toast.error(err.message || "Failed to add team member");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      await api.updateCompanyTeamMember(memberId, { companyRole: newRole });
      toast.success("Role updated");
      fetchTeam();
    } catch (err: any) {
      toast.error(err.message || "Failed to update role");
    }
  };

  const handleToggleStatus = async (member: any) => {
    const newStatus = member.account_status === "active" ? "suspended" : "active";
    try {
      await api.updateCompanyTeamMember(member.id, { accountStatus: newStatus });
      toast.success(`Member ${newStatus === "active" ? "activated" : "suspended"}`);
      fetchTeam();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  if (authLoading || loading) return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="h-8 w-48 skeleton mb-6" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
      </div>
    </div>
  );

  if (!user) return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Users size={48} className="mx-auto text-muted" weight="light" />
      <p className="mt-4 text-soft">Login to manage your team</p>
      <Link href="/auth/login" className="btn mt-4">Login</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href="/account" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Team Members</h1>
          <p className="mt-1 text-sm text-soft">Manage your company team and their roles</p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} className="btn btn-primary gap-2">
            <Plus size={18} weight="bold" />
            Add Member
          </button>
        )}
      </div>

      {/* Invite Form Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Invite Team Member</h2>
              <button onClick={() => setShowInvite(false)} className="text-muted hover:text-ink"><X size={20} /></button>
            </div>
            <form onSubmit={handleInvite} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="input-label">First Name *</label>
                  <input value={inviteForm.firstName} onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })} className="input" required />
                </div>
                <div>
                  <label className="input-label">Last Name *</label>
                  <input value={inviteForm.lastName} onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })} className="input" required />
                </div>
              </div>
              <div>
                <label className="input-label">Email *</label>
                <input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} className="input" required />
              </div>
              <div>
                <label className="input-label">Password * <span className="text-xs text-muted font-normal">(min 8 characters)</span></label>
                <input type="password" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} className="input" required minLength={8} />
              </div>
              <div>
                <label className="input-label">Phone</label>
                <input value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} className="input" />
              </div>
              <div>
                <label className="input-label">Role *</label>
                <select value={inviteForm.companyRole} onChange={(e) => setInviteForm({ ...inviteForm, companyRole: e.target.value })} className="input">
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">{ROLE_PERMISSIONS[inviteForm.companyRole]}</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={inviting} className="btn btn-primary gap-2">
                  {inviting ? "Adding..." : "Add Member"}
                </button>
                <button type="button" onClick={() => setShowInvite(false)} className="btn btn-ghost">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team List */}
      {team.length > 0 ? (
        <div className="mt-8 space-y-3">
          {team.map((member: any) => (
            <div key={member.id} className="card flex flex-wrap items-center gap-4 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-bold shrink-0">
                <UserCircle size={24} weight="fill" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink">{member.first_name} {member.last_name}</p>
                <p className="text-sm text-soft truncate">{member.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  member.account_status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                }`}>
                  {member.account_status === "active" ? <CheckCircle size={10} weight="fill" /> : <Prohibit size={10} />}
                  {member.account_status}
                </span>
              </div>
              {canManage && member.id !== user?.id ? (
                <div className="flex items-center gap-2">
                  <select
                    value={member.company_role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    className="input text-sm py-1.5 w-32"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleToggleStatus(member)}
                    className={`btn btn-sm ${member.account_status === "active" ? "text-red-500" : "text-emerald-600"}`}
                    title={member.account_status === "active" ? "Suspend member" : "Activate member"}
                  >
                    {member.account_status === "active" ? "Suspend" : "Activate"}
                  </button>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-bold">
                  <Shield size={12} weight="fill" />
                  {ROLE_LABELS[member.company_role] || member.company_role}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <Users size={48} className="text-muted" weight="light" />
          <div>
            <p className="text-sm text-soft">No team members yet</p>
            {canManage && (
              <p className="mt-1 text-xs text-muted">Add team members to collaborate on orders, quotes, and procurement.</p>
            )}
          </div>
          {canManage && (
            <button onClick={() => setShowInvite(true)} className="btn btn-primary gap-2">
              <UserPlus size={18} weight="bold" />
              Invite Your First Team Member
            </button>
          )}
        </div>
      )}

      {/* Role Permissions Reference */}
      {canManage && (
        <div className="card mt-8 p-6">
          <h3 className="font-display text-base font-semibold text-ink">Role Permissions</h3>
          <div className="mt-4 space-y-3">
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <div key={value} className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-bold shrink-0 mt-0.5">
                  <Shield size={14} weight="fill" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="text-xs text-soft">{ROLE_PERMISSIONS[value]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
