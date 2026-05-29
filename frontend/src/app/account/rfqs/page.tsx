"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { FileText, Cube, Plus, Eye } from "@phosphor-icons/react";

export default function RfqsPage() {
  const { user, loading: authLoading } = useAuth();
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      api.getRfqs().then((res) => setRfqs(res.rfqs)).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "badge-yellow", under_review: "badge-blue", quote_sent: "badge-blue",
      quoted: "badge-blue", accepted: "badge-green", rejected: "badge-red",
    };
    return map[s] || "badge-gray";
  };

  if (authLoading || loading) return null;
  if (!user) return <div className="mx-auto max-w-lg px-4 py-20 text-center"><p className="text-soft">Please login</p></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">RFQs</h1>
        <Link href="/rfq/new" className="btn btn-primary btn-sm gap-2">
          <Plus size={16} weight="bold" />
          New RFQ
        </Link>
      </div>
      {rfqs.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Cube size={48} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No RFQs submitted yet</p>
          <Link href="/rfq/new" className="btn btn-primary">Request a Quote</Link>
        </div>
      ) : (
        <div className="card mt-8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Qty</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Response</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50 text-sm hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4 font-medium">{r.product_name || "\u2014"}</td>
                    <td className="px-6 py-4 text-muted">{r.quantity}</td>
                    <td className="px-6 py-4"><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                    <td className="px-6 py-4 text-muted max-w-[200px] truncate">{r.admin_notes || "\u2014"}</td>
                    <td className="px-6 py-4 text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <Link href={`/account/rfqs/${r.id}`} className="btn btn-sm gap-1">
                        <Eye size={14} /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
