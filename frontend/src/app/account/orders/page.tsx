"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ShoppingBag, Cube } from "@phosphor-icons/react";

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      api.getOrders().then((res) => setOrders(res.orders)).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [user]);

  if (authLoading || loading) return null;
  if (!user) return <div className="mx-auto max-w-lg px-4 py-20 text-center"><p className="text-soft">Please login</p></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Orders</h1>
      {orders.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Cube size={48} className="text-muted" weight="light" />
          <p className="text-sm text-soft">No orders yet</p>
          <Link href="/products" className="btn btn-primary">Browse Products</Link>
        </div>
      ) : (
        <div className="card mt-8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted uppercase tracking-wider">
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Items</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="border-b border-border/50 text-sm hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4"><Link href={`/orders/${o.id}/confirm`} className="font-medium text-accent">{o.order_number}</Link></td>
                    <td className="px-6 py-4 text-muted">{(o.items || []).length} item(s)</td>
                    <td className="px-6 py-4 font-medium">GH₵{Number(o.total).toLocaleString()}</td>
                    <td className="px-6 py-4"><span className={`badge ${o.status === "paid" ? "badge-green" : o.status === "pending" ? "badge-yellow" : "badge-gray"}`}>{o.status}</span></td>
                    <td className="px-6 py-4 text-muted">{new Date(o.created_at).toLocaleDateString()}</td>
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
