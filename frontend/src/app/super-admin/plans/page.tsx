"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function SuperAdminPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [feeSettings, setFeeSettings] = useState<any>(null);
  const [feeForm, setFeeForm] = useState({ amount: "500", renewalPeriodDays: "365", gracePeriodDays: "14" });

  const loadPlans = () => {
    setLoading(true);
    Promise.all([api.getPlans(), api.getVerificationFeeSettings()])
      .then(([plansData, feeData]) => {
        setPlans(plansData);
        setFeeSettings(feeData);
        setFeeForm({
          amount: String(feeData.amount),
          renewalPeriodDays: String(feeData.renewal_period_days),
          gracePeriodDays: String(feeData.grace_period_days),
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPlans(); }, []);

  const startEdit = (plan: any) => {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      displayName: plan.display_name,
      description: plan.description || "",
      priceMonthly: plan.price_monthly,
      priceYearly: plan.price_yearly,
      maxUsers: plan.max_users,
      maxProducts: plan.max_products,
      maxServices: plan.max_services,
      sortOrder: plan.sort_order,
      isActive: plan.is_active,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await api.updatePlan(editingId, form);
      setEditingId(null);
      loadPlans();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const saveFeeSettings = async () => {
    try {
      await api.updateVerificationFeeSettings({
        amount: Number(feeForm.amount),
        renewalPeriodDays: Number(feeForm.renewalPeriodDays),
        gracePeriodDays: Number(feeForm.gracePeriodDays),
      });
      loadPlans();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) return <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Subscription Plans</h1>

      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Balican Verified Fee</h2>
        <p className="text-sm text-gray-500 mb-4">Configure the provider verification payment and renewal grace period.</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded px-3 py-2 text-sm" type="number" value={feeForm.amount} onChange={(e) => setFeeForm({...feeForm, amount: e.target.value})} placeholder="Amount" />
          <input className="border rounded px-3 py-2 text-sm" value="GH₵" disabled />
          <input className="border rounded px-3 py-2 text-sm" type="number" value={feeForm.renewalPeriodDays} onChange={(e) => setFeeForm({...feeForm, renewalPeriodDays: e.target.value})} placeholder="Renewal days" />
          <input className="border rounded px-3 py-2 text-sm" type="number" value={feeForm.gracePeriodDays} onChange={(e) => setFeeForm({...feeForm, gracePeriodDays: e.target.value})} placeholder="Grace days" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={saveFeeSettings} className="px-3 py-2 bg-accent text-white rounded text-sm">Save Verification Fee</button>
          {feeSettings?.updated_at && <span className="text-xs text-gray-400">Updated {new Date(feeSettings.updated_at).toLocaleString()}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white rounded-lg shadow-sm border p-6">
            {editingId === plan.id ? (
              <div className="space-y-3">
                <input className="border rounded px-2 py-1 text-sm w-full" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Name" />
                <input className="border rounded px-2 py-1 text-sm w-full" value={form.displayName} onChange={(e) => setForm({...form, displayName: e.target.value})} placeholder="Display Name" />
                <textarea className="border rounded px-2 py-1 text-sm w-full" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Description" />
                <div className="grid grid-cols-2 gap-2">
                  <input className="border rounded px-2 py-1 text-sm" type="number" value={form.priceMonthly} onChange={(e) => setForm({...form, priceMonthly: e.target.value})} placeholder="Price Monthly" />
                  <input className="border rounded px-2 py-1 text-sm" type="number" value={form.priceYearly} onChange={(e) => setForm({...form, priceYearly: e.target.value})} placeholder="Price Yearly" />
                  <input className="border rounded px-2 py-1 text-sm" type="number" value={form.maxUsers} onChange={(e) => setForm({...form, maxUsers: e.target.value})} placeholder="Max Users" />
                  <input className="border rounded px-2 py-1 text-sm" type="number" value={form.sortOrder} onChange={(e) => setForm({...form, sortOrder: e.target.value})} placeholder="Sort Order" />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="px-3 py-1 bg-accent text-white rounded text-sm">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1 border rounded text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">{plan.display_name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${plan.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {plan.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-3">{plan.description}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-400">Monthly:</span> GH₵ {parseFloat(plan.price_monthly).toLocaleString()}</div>
                  <div><span className="text-gray-400">Yearly:</span> GH₵ {parseFloat(plan.price_yearly).toLocaleString()}</div>
                  <div><span className="text-gray-400">Max Users:</span> {plan.max_users}</div>
                  <div><span className="text-gray-400">Products:</span> {plan.max_products}</div>
                  <div><span className="text-gray-400">Services:</span> {plan.max_services}</div>
                  <div><span className="text-gray-400">Sort:</span> {plan.sort_order}</div>
                </div>
                <div className="mt-3">
                  {plan.features?.length > 0 && (
                    <ul className="text-xs text-gray-500 space-y-1">
                      {plan.features.map((f: string, i: number) => (
                        <li key={i} className="flex items-center gap-1">• {f}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button onClick={() => startEdit(plan)} className="mt-4 text-sm text-accent hover:underline">Edit</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
