"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

export default function SuperAdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSuperAdminDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto" /></div>;
  if (error) return <div className="text-red-500 text-center py-12">{error}</div>;
  if (!data) return null;

  const { companies, pendingVerifications, pendingDocuments, planDistribution, recentActivity } = data;

  const statCards = [
    { label: "Total Companies", value: companies.total, color: "bg-blue-500" },
    { label: "Pending", value: companies.pending, color: "bg-amber-500" },
    { label: "Active", value: companies.active, color: "bg-green-500" },
    { label: "Rejected", value: companies.rejected, color: "bg-red-500" },
    { label: "Payment Suspended", value: companies.payment_suspended, color: "bg-purple-500" },
    { label: "Suspended", value: companies.suspended, color: "bg-gray-500" },
    { label: "Pending Verifications", value: pendingVerifications, color: "bg-indigo-500" },
    { label: "Pending Documents", value: pendingDocuments, color: "bg-rose-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Super Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${card.color}`} />
              <span className="text-sm text-gray-500">{card.label}</span>
            </div>
            <p className="text-2xl font-bold mt-2">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Plan Distribution</h2>
          {planDistribution.length === 0 ? (
            <p className="text-gray-400 text-sm">No active subscribers</p>
          ) : (
            <div className="space-y-3">
              {planDistribution.map((p: any) => (
                <div key={p.name} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.display_name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-100 rounded-full h-2">
                      <div className="bg-accent h-2 rounded-full" style={{ width: `${Math.min(100, (p.subscriber_count / Math.max(...planDistribution.map((x: any) => x.subscriber_count))) * 100)}%` }} />
                    </div>
                    <span className="text-sm text-gray-500 w-8 text-right">{p.subscriber_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity (30 days)</h2>
          {recentActivity.length === 0 ? (
            <p className="text-gray-400 text-sm">No activity recorded</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((a: any) => (
                <div key={a.action} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 capitalize">{a.action.replace(/_/g, " ")}</span>
                  <span className="text-gray-500 font-medium">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <Link href="/super-admin/companies" className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-bold transition-colors">
          Manage Companies
        </Link>
        <Link href="/super-admin/documents" className="px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy/90 transition-colors">
          Review Documents
        </Link>
      </div>
    </div>
  );
}
