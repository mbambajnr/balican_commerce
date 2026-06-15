"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import CreditApplicationModal from "@/components/CreditApplicationModal";
import {
  Building, ShoppingBag, FileText, CalendarCheck, ArrowRight, Cube,
  Coins, Wrench, Clock, CheckCircle, Users, Truck, CreditCard,
  Phone, Envelope, MapPin, Plus, Star, UserPlus, ShoppingCart,
  UploadSimple, ClipboardText, ChatText, Clipboard,
} from "@phosphor-icons/react";

export default function CompanyDashboard() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [vettingStatus, setVettingStatus] = useState<any>(null);

  useEffect(() => {
    // Super admins belong on the platform operator dashboard
    if (user?.role === "super_admin") {
      router.replace("/super-admin");
      return;
    }
    // Providers/suppliers belong on the provider dashboard
    if ((user as any)?.is_provider) {
      router.replace("/provider");
      return;
    }
    if (!user) { setLoading(false); return; }
    api.getCompanyDashboard()
      .then(setDashboard)
      .catch(() => {})
      .finally(() => setLoading(false));
    api.getOrders().then((res) => setOrders(res.orders || [])).catch(() => {});
    api.getRfqs().then((res) => setRfqs(res.rfqs || [])).catch(() => {});
    api.getVettingStatus().then((res) => setVettingStatus(res.vetting)).catch(() => {});
  }, [user]);

  if (authLoading || loading) return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="h-8 w-64 skeleton mb-6" />
      <div className="grid gap-6 sm:grid-cols-3">
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-32 skeleton rounded-xl" />
      </div>
    </div>
  );

  if (!user) return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Cube size={48} className="mx-auto text-muted" weight="light" />
      <p className="mt-4 text-soft">Login to view your dashboard</p>
      <Link href="/auth/login" className="btn mt-4">Login</Link>
    </div>
  );

  const company = dashboard?.company;
  const salesRep = dashboard?.salesRep;
  const stats = dashboard?.stats || { ordersCount: 0, rfqsCount: 0, procurementListsCount: 0, teamMembersCount: 0 };
  const needsOnboarding = dashboard?.onboarding?.needsOnboarding ?? (stats.rfqsCount === 0 && stats.ordersCount === 0);
  const companyStatus = company?.status || (user as any)?.account_status;
  const companyName = company?.name || (user as any)?.company_name;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Status Banner */}
      {companyStatus && companyStatus !== "active" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <Clock size={20} className="shrink-0" />
          <span>
            {companyStatus === "pending"
              ? "Your company account is pending review. You will be notified once it is activated."
              : "Your company account requires attention. Please contact support."}
          </span>
        </div>
      )}

      {/* Vetting CTA Banner */}
      {companyStatus === "active" && !vettingStatus && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-accent/20 bg-accent-soft px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white shrink-0">
            <Clipboard size={20} weight="bold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">Complete your business profile</p>
            <p className="text-xs text-muted">Help us serve you better — it only takes a few minutes</p>
          </div>
          <Link href="/account/vetting" className="btn btn-primary btn-sm shrink-0 gap-1.5">
            <ArrowRight size={14} weight="bold" /> Start
          </Link>
        </div>
      )}
      {companyStatus === "active" && vettingStatus && vettingStatus.submission?.status === "needs_info" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
            <Clipboard size={20} weight="bold" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-ink">More information needed</p>
            <p className="text-xs text-amber-700">Please update your business profile with the requested information</p>
          </div>
          <Link href="/account/vetting" className="btn btn-sm border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0 gap-1.5">
            <ArrowRight size={14} weight="bold" /> Update
          </Link>
        </div>
      )}

      {/* Welcome Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Welcome, {companyName || `${user.first_name} ${user.last_name}`}
          </h1>
          <p className="mt-1 text-sm text-soft">
            {companyName ? "Company Dashboard" : "My Account"}
          </p>
        </div>
        <Link href="/booking" className="btn btn-primary gap-2">
          <CalendarCheck size={18} weight="bold" />
          Book Service
        </Link>
      </div>

      {/* Onboarding Empty State */}
      {needsOnboarding && companyStatus === "active" && (
        <div className="mt-8 rounded-2xl border border-accent/20 bg-accent-soft/50 p-8">
          <h2 className="font-display text-xl font-semibold text-navy">Get Started with Bali-Can Limited</h2>
          <p className="mt-1 text-sm text-soft">
            Your company is approved and ready. Here&apos;s what you can do:
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/products" className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-6 text-center transition-all hover:border-accent hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-bold">
                <ShoppingCart size={24} weight="duotone" />
              </div>
              <div>
                <p className="font-semibold text-ink group-hover:text-accent transition-colors">Browse Products</p>
                <p className="mt-0.5 text-xs text-soft">Explore our full catalog</p>
              </div>
            </Link>
            <Link href="/rfq/new" className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-6 text-center transition-all hover:border-accent hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-warn">
                <FileText size={24} weight="duotone" />
              </div>
              <div>
                <p className="font-semibold text-ink group-hover:text-accent transition-colors">Request Quote</p>
                <p className="mt-0.5 text-xs text-soft">Get pricing for products</p>
              </div>
            </Link>
            <Link href="/quick-order" className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-6 text-center transition-all hover:border-accent hover:shadow-md">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <UploadSimple size={24} weight="duotone" />
              </div>
              <div>
                <p className="font-semibold text-ink group-hover:text-accent transition-colors">Quick Order</p>
                <p className="mt-0.5 text-xs text-soft">Order by SKU or upload list</p>
              </div>
            </Link>
            <div className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <ClipboardText size={24} weight="duotone" />
              </div>
              <div>
                <p className="font-semibold text-ink">Procurement List</p>
                <p className="mt-0.5 text-xs text-soft">Contact your sales rep</p>
              </div>
            </div>
          </div>
          {salesRep && (
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-white px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-bold">
                <Star size={20} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Your Sales Representative</p>
                <p className="text-sm text-soft">{salesRep.name}</p>
              </div>
              {salesRep.email && (
                <a href={`mailto:${salesRep.email}`} className="btn btn-sm gap-2">
                  <Envelope size={14} /> Contact
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-bold">
            <Building size={20} weight="duotone" />
          </div>
          <h3 className="mt-4 font-display text-base font-semibold text-ink">
            {companyName || `${user.first_name} ${user.last_name}`}
          </h3>
          <p className="text-sm text-soft">{user.email}</p>
          {companyStatus === "active" && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle size={12} weight="fill" /> Active
            </span>
          )}
        </div>
        <Link href="/account/orders" className="card p-6 transition-all hover:shadow-md group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-signal">
            <ShoppingBag size={20} weight="duotone" />
          </div>
          <p className="mt-4 font-display text-base font-semibold text-ink">{stats.ordersCount} Orders</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-soft transition-colors group-hover:text-accent">
            View all <ArrowRight size={14} />
          </p>
        </Link>
        <Link href="/account/rfqs" className="card p-6 transition-all hover:shadow-md group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-warn">
            <FileText size={20} weight="duotone" />
          </div>
          <p className="mt-4 font-display text-base font-semibold text-ink">{stats.rfqsCount} RFQs</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-soft transition-colors group-hover:text-accent">
            View all <ArrowRight size={14} />
          </p>
        </Link>
        <Link href="/account/bookings" className="card p-6 transition-all hover:shadow-md group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
            <Wrench size={20} weight="duotone" />
          </div>
          <p className="mt-4 font-display text-base font-semibold text-ink">Service Bookings</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-soft transition-colors group-hover:text-accent">
            View all <ArrowRight size={14} />
          </p>
        </Link>
        <Link href="/account/procurement/activity" className="card p-6 transition-all hover:shadow-md group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <ClipboardText size={20} weight="duotone" />
          </div>
          <p className="mt-4 font-display text-base font-semibold text-ink">Procurement Activity</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-soft transition-colors group-hover:text-accent">
            View all <ArrowRight size={14} />
          </p>
        </Link>
      </div>

      {/* Company Profile Card */}
      {company && (
        <div className="card mt-8 p-6">
          <h2 className="font-display text-base font-semibold text-ink">Company Profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Company Name</p>
              <p className="mt-1 text-sm text-ink">{company.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Status</p>
              <p className="mt-1">
                <span className={`badge ${company.status === "active" ? "badge-green" : company.status === "pending" ? "badge-yellow" : "badge-red"}`}>
                  {company.status}
                </span>
              </p>
            </div>
            {company.email && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">Email</p>
                <p className="mt-1 text-sm text-ink">{company.email}</p>
              </div>
            )}
            {company.phone && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">Phone</p>
                <p className="mt-1 text-sm text-ink">{company.phone}</p>
              </div>
            )}
            {company.address && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">Address</p>
                <p className="mt-1 text-sm text-ink">{company.address}</p>
              </div>
            )}
            {company.regNumber && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">Registration No.</p>
                <p className="mt-1 text-sm text-ink">{company.regNumber}</p>
              </div>
            )}
            {company.taxId && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">Tax ID</p>
                <p className="mt-1 text-sm text-ink">{company.taxId}</p>
              </div>
            )}
            {company.contactPerson?.name && (
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider">Contact Person</p>
                <p className="mt-1 text-sm text-ink">{company.contactPerson.name}</p>
                {company.contactPerson.email && <p className="text-xs text-soft">{company.contactPerson.email}</p>}
              </div>
            )}
          </div>
          {salesRep && (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-zinc-50 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-bold">
                <Star size={20} weight="fill" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">Assigned Sales Representative</p>
                <p className="text-sm text-soft">{salesRep.name}{salesRep.email ? ` · ${salesRep.email}` : ""}</p>
              </div>
              {salesRep.email && (
                <a href={`mailto:${salesRep.email}`} className="btn btn-sm gap-2">
                  <Envelope size={14} /> Email
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Company Credit Status */}
      {company && (
        <div className="card mt-6 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-warn">
                <Coins size={20} weight="duotone" />
              </div>
              <div>
                <p className="font-display text-base font-semibold text-ink">Credit Sales</p>
                {dashboard?.companyCredit && (() => {
                  const cc = dashboard.companyCredit;
                  if (cc.creditStatus === "approved") {
                    return <p className="text-sm text-emerald-600 font-medium">Approved — GH₵{Number(cc.availableCredit).toLocaleString()} available</p>;
                  }
                  if (cc.creditStatus === "pending_review") {
                    return <p className="text-sm text-amber-600 font-medium">Credit application under review</p>;
                  }
                  if (cc.creditStatus === "rejected") {
                    return <p className="text-sm text-red-600 font-medium">Credit not approved</p>;
                  }
                  if (cc.creditStatus === "suspended") {
                    return <p className="text-sm text-red-600 font-medium">Credit facility suspended — Contact sales</p>;
                  }
                  return <p className="text-sm text-muted">Not yet applied</p>;
                })()}
              </div>
            </div>
            {dashboard?.companyCredit?.creditStatus === "not_requested" && company.status === "active" && (
              <button onClick={() => setShowCreditModal(true)} className="btn btn-primary btn-sm">Apply for Credit Sales</button>
            )}
          </div>

          <CreditApplicationModal
            open={showCreditModal}
            onClose={() => setShowCreditModal(false)}
            onSubmit={async (limit, terms) => {
              await api.applyCompanyCredit({
                requestedCreditLimit: limit,
                preferredPaymentTerms: terms || undefined,
              });
              toast.success("Credit application submitted!");
              await api.getCompanyDashboard().then(setDashboard);
            }}
          />

          {dashboard?.companyCredit?.creditStatus === "approved" && (() => {
            const cc = dashboard.companyCredit;
            return (
              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-muted">Approved Limit</p>
                  <p className="text-lg font-bold text-ink">GH₵{Number(cc.approvedCreditLimit).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-muted">Used</p>
                  <p className="text-lg font-bold text-ink">GH₵{Number(cc.creditUsed).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-muted">Available</p>
                  <p className="text-lg font-bold text-ink">GH₵{Number(cc.availableCredit).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-muted">Risk Rating</p>
                  <p className="text-lg font-bold text-ink capitalize">{cc.creditRiskRating}</p>
                </div>
                {cc.nextReviewAt && (
                  <div className="rounded-lg bg-zinc-50 p-3 text-center">
                    <p className="text-xs text-muted">Next Review</p>
                    <p className="text-sm font-bold text-ink">{new Date(cc.nextReviewAt).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Store Credit */}
      {dashboard?.storeCredit?.balance > 0 && (
        <div className="mt-6">
          <div className="card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CreditCard size={20} weight="duotone" />
              </div>
              <div>
                <p className="font-display text-base font-semibold text-ink">Store Credit</p>
                <p className="text-sm text-soft">
                  Balance: GH₵{Number(dashboard.storeCredit.balance).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vetting Status */}
      {vettingStatus && (
        <div className="mt-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-bold shrink-0">
                  <Clipboard size={20} weight="duotone" />
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-ink">Business Profile</p>
                  <p className="text-sm text-soft">
                    {vettingStatus.submission?.status === "approved" && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle size={14} weight="fill" /> Vetting approved
                      </span>
                    )}
                    {vettingStatus.submission?.status === "submitted" && (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                        <Clock size={14} weight="fill" /> Submitted — under review
                        {vettingStatus.submission?.score != null && (
                          <span className="ml-2 text-muted font-normal">
                            Score: {vettingStatus.submission.score}
                          </span>
                        )}
                      </span>
                    )}
                    {vettingStatus.submission?.status === "draft" && (
                      <span className="text-muted">Draft</span>
                    )}
                    {vettingStatus.submission?.status === "needs_info" && (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                        <Clock size={14} weight="fill" /> More information needed
                      </span>
                    )}
                    {vettingStatus.submission?.status === "rejected" && (
                      <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                        <span className="text-red-600 font-bold">✕</span> Not approved — Contact support
                      </span>
                    )}
                    {!vettingStatus.submission?.status && (
                      <span className="text-muted">Not yet completed</span>
                    )}
                  </p>
                </div>
              </div>
              {vettingStatus.submission?.status === "draft" || vettingStatus.submission?.status === "needs_info" ? (
                <Link href="/account/vetting" className="btn btn-primary btn-sm gap-1.5">
                  <ArrowRight size={14} weight="bold" /> {vettingStatus.submission?.status === "needs_info" ? "Update" : "Continue"}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Payment Methods & Shipping Methods */}
      {(dashboard?.paymentMethods?.length > 0 || dashboard?.shippingMethods?.length > 0) && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {dashboard?.paymentMethods?.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-muted" />
                <h3 className="font-display text-base font-semibold text-ink">Available Payment Methods</h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboard.paymentMethods.map((m: string) => (
                  <span key={m} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-ink capitalize">
                    {m.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {dashboard?.shippingMethods?.length > 0 && (
            <div className="card p-6">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-muted" />
                <h3 className="font-display text-base font-semibold text-ink">Available Shipping Methods</h3>
              </div>
              <div className="mt-3 space-y-2">
                {dashboard.shippingMethods.map((sm: any) => (
                  <div key={sm.code} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{sm.name}</span>
                    <span className="text-muted">GH₵{Number(sm.custom_rate || sm.base_rate).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Team Members Quick Link */}
      {dashboard?.user?.companyRole === "company_admin" && (
        <div className="mt-6">
          <Link href="/account/team" className="card flex items-center gap-4 p-6 transition-all hover:shadow-md group">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-bold">
              <Users size={24} weight="duotone" />
            </div>
            <div className="flex-1">
              <p className="font-display text-base font-semibold text-ink">Team Members</p>
              <p className="text-sm text-soft">{stats.teamMembersCount} member{stats.teamMembersCount !== 1 ? "s" : ""} — Manage your team</p>
            </div>
            <ArrowRight size={18} className="text-muted group-hover:text-accent transition-colors" />
          </Link>
        </div>
      )}

      {/* Procurement Lists */}
      {dashboard?.procurementLists?.length > 0 && (
        <div className="card mt-8 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-ink">Procurement Lists</h3>
          </div>
          <div className="mt-3 space-y-2">
            {dashboard.procurementLists.map((pl: any) => (
              <div key={pl.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
                <span className="text-ink font-medium">{pl.name}</span>
                <span className="text-muted">{new Date(pl.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders Section */}
      <div className="mt-8">
        {orders.length > 0 ? (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="font-display text-base font-semibold text-ink">Recent Orders</h3>
              <Link href="/account/orders" className="text-sm text-accent hover:text-accent-bold">View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                    <th className="px-6 py-3">Order #</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((o: any) => (
                    <tr key={o.id} className="border-b border-border/50 text-sm hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-3"><Link href={`/orders/${o.id}/confirm`} className="font-medium text-accent">{o.order_number}</Link></td>
                      <td className="px-6 py-3 font-medium">GH₵{Number(o.total).toLocaleString()}</td>
                      <td className="px-6 py-3"><span className={`badge ${o.status === "paid" ? "badge-green" : o.status === "pending" ? "badge-yellow" : "badge-gray"}`}>{o.status}</span></td>
                      <td className="px-6 py-3 text-muted">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : !needsOnboarding && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <ShoppingBag size={36} className="text-muted" weight="light" />
            <p className="text-sm text-soft">No orders yet</p>
            <Link href="/products" className="btn btn-primary btn-sm">Browse Products</Link>
          </div>
        )}
      </div>

      {/* RFQs Section */}
      <div className="mt-6">
        {rfqs.length > 0 ? (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="font-display text-base font-semibold text-ink">Recent RFQs</h3>
              <Link href="/account/rfqs" className="text-sm text-accent hover:text-accent-bold">View all</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">Qty</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqs.slice(0, 5).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/50 text-sm hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-3">{r.product_name || "\u2014"}</td>
                      <td className="px-6 py-3">{r.quantity}</td>
                      <td className="px-6 py-3"><span className={`badge ${r.status === "quoted" ? "badge-blue" : r.status === "accepted" ? "badge-green" : r.status === "rejected" ? "badge-red" : "badge-yellow"}`}>{r.status}</span></td>
                      <td className="px-6 py-3 text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : !needsOnboarding && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
            <FileText size={36} className="text-muted" weight="light" />
            <p className="text-sm text-soft">No RFQs yet</p>
            <Link href="/rfq/new" className="btn btn-primary btn-sm">Request a Quote</Link>
          </div>
        )}
      </div>
    </div>
  );
}
