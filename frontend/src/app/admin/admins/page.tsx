"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Users, Plus, X, CheckCircle, Prohibit,
  ShieldCheck, EnvelopeSimple, Phone,
} from "@phosphor-icons/react";

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [admins, setAdmins] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", phone: "" });

  useEffect(() => {
    if (authLoading) return;
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      router.push("/admin/login");
      return;
    }
    load();
  }, [user, authLoading]);

  const load = () => {
    setFetching(true);
    api.getAdminUsers()
      .then((r) => setAdmins(r.admins))
      .catch(() => toast.error("Failed to load admin users"))
      .finally(() => setFetching(false));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createAdminUser(form);
      toast.success("Admin user created");
      setShowCreate(false);
      setForm({ email: "", password: "", firstName: "", lastName: "", phone: "" });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async (id: string, name: string) => {
    if (!confirm(`Disable ${name}? They will lose admin access.`)) return;
    try {
      await api.disableAdminUser(id);
      toast.success("Admin disabled");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to disable");
    }
  };

  const handleEnable = async (id: string, name: string) => {
    if (!confirm(`Re-enable ${name}?`)) return;
    try {
      await api.enableAdminUser(id);
      toast.success("Admin re-enabled");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to enable");
    }
  };

  if (authLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 skeleton rounded-lg" />
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Admin Users</h1>
          <p className="mt-1 text-sm text-muted">
            Manage administrator accounts. Only visible to super admins.
          </p>
        </div>
        {user?.role === "super_admin" && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary gap-2">
            <Plus size={16} weight="bold" /> New Admin
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Create Admin User</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted hover:text-ink">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First Name *</label>
                  <input className="input" required value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input className="input" required value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Email *</label>
                <input className="input" type="email" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">Password *</label>
                <input className="input" type="password" required minLength={8} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Creating..." : "Create Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List */}
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-white">
        {fetching ? (
          <div className="space-y-4 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
            ))}
          </div>
        ) : admins.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={40} className="mx-auto text-muted" weight="light" />
            <p className="mt-3 text-sm text-muted">No admin users found.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {admins.map((a) => {
              const isYou = a.id === user?.id;
              return (
                <div key={a.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                        {a.firstName?.charAt(0)}{a.lastName?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">
                          {a.firstName} {a.lastName}
                          {isYou && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">You</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                          <span className="flex items-center gap-1">
                            <EnvelopeSimple size={11} /> {a.email}
                          </span>
                          {a.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} /> {a.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      a.role === "super_admin"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                    }`}>
                      <ShieldCheck size={12} className="mr-1 inline" />
                      {a.role === "super_admin" ? "Super Admin" : "Admin"}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      a.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    }`}>
                      {a.status}
                    </span>
                    {user?.role === "super_admin" && !isYou && a.role !== "super_admin" && (
                      a.status === "active" ? (
                        <button
                          onClick={() => handleDisable(a.id, `${a.firstName} ${a.lastName}`)}
                          className="btn gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <Prohibit size={14} /> Disable
                        </button>
                      ) : (
                        <button
                          onClick={() => handleEnable(a.id, `${a.firstName} ${a.lastName}`)}
                          className="btn gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckCircle size={14} /> Enable
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
