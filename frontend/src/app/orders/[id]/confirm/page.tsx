"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fireConversion } from "@/components/TrackingScripts";
import toast from "react-hot-toast";
import Link from "next/link";
import { CreditCard, CalendarCheck, ArrowLeft, Cube } from "@phosphor-icons/react";

export default function OrderConfirmPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    api.getOrder(id as string)
      .then((res) => {
        setOrder(res.order);
        if (res.order.payment_method === "credit") {
          api.getOrderPayments(id as string)
            .then((p) => setPayments(p.payments))
            .catch(() => {});
        }
        // Fire Purchase conversion event once per session per order
        const firedKey = `ss_purchase_${id}`;
        if (!sessionStorage.getItem(firedKey)) {
          fireConversion("Purchase", {
            order_id: res.order.order_number,
            value: Number(res.order.total),
            currency: "GHS",
            order_source: res.order.order_source || "direct",
          });
          try { sessionStorage.setItem(firedKey, "1"); } catch { /* noop */ }
        }
      })
      .catch(() => toast.error("Order not found"))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePay = async () => {
    if (!user) return;
    try {
      const res = await api.initPaystack(id as string, user.email);
      window.location.href = res.authorizationUrl;
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    }
  };

  if (loading) return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <div className="card p-8 space-y-4">
        <div className="h-6 w-2/3 mx-auto skeleton" />
        <div className="h-4 w-1/3 mx-auto skeleton" />
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 skeleton" />)}
      </div>
    </div>
  );

  if (!order) return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Cube size={48} className="mx-auto text-muted" weight="light" />
      <p className="mt-4 text-soft">Order not found</p>
      <Link href="/account/orders" className="btn mt-6">View Orders</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/account/orders" className="inline-flex items-center gap-1.5 text-sm text-soft hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Orders
      </Link>

      <div className="card mt-6 p-8">
        <div className="text-center">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
            order.status === "paid" ? "bg-accent-soft text-accent-bold" : "bg-amber-50 text-warn"
          }`}>
            {order.status === "paid" ? <CalendarCheck size={28} weight="duotone" /> : <CreditCard size={28} weight="duotone" />}
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Order #{order.order_number}</h1>
          <span className={`badge mt-2 ${
            order.status === "paid" ? "badge-green" :
            order.status === "pending" ? "badge-yellow" : "badge-gray"
          }`}>{order.status}</span>
        </div>

        <div className="mt-8 divide-y divide-border">
          {order.items.map((item: any, i: number) => (
            <div key={i} className="flex justify-between py-3 text-sm">
              <span className="text-soft">{item.name} <span className="text-muted">x{item.quantity}</span></span>
              <span className="font-medium text-ink">GH₵{(item.price * item.quantity).toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between py-4 text-base font-semibold">
            <span>Total</span>
            <span className="text-accent">GH₵{Number(order.total).toLocaleString()}</span>
          </div>
        </div>

        {order.payment_method === "credit" && (
          <div className="mt-6 space-y-3 border-t border-border pt-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted">Terms</span>
                <p className="font-medium">{order.payment_terms}</p>
              </div>
              {order.po_number && (
                <div>
                  <span className="text-muted">PO Number</span>
                  <p className="font-medium">{order.po_number}</p>
                </div>
              )}
              <div>
                <span className="text-muted">Balance Due</span>
                <p className="font-medium text-warn">GH₵{Number(order.balance_due).toLocaleString()}</p>
              </div>
              {order.payment_due_date && (
                <div>
                  <span className="text-muted">Due Date</span>
                  <p className="font-medium">{new Date(order.payment_due_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {payments.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Payments</p>
                <div className="space-y-2">
                  {payments.map((p: any) => (
                    <div key={p.id} className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                      <span className="text-soft">{p.method} {p.reference && <span className="text-muted">({p.reference})</span>}</span>
                      <span className="font-medium text-accent-bold">GH₵{Number(p.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Number(order.balance_due) === 0 && (
              <p className="text-center text-sm text-accent-bold font-medium">Fully Paid</p>
            )}
          </div>
        )}

        {order.payment_method === "paystack" && order.status === "pending" && (
          <button onClick={handlePay} className="btn btn-primary mt-6 w-full gap-2">
            <CreditCard size={18} weight="bold" />
            Pay with Paystack
          </button>
        )}

        {order.payment_method === "paystack" && order.status === "paid" && (
          <div className="mt-6 space-y-3">
            <p className="text-center text-sm text-accent-bold font-medium">Payment confirmed</p>
            <Link href={`/booking?order=${order.id}`} className="btn btn-primary w-full gap-2">
              <CalendarCheck size={18} weight="bold" />
              Book Installation
            </Link>
          </div>
        )}

        {(order.payment_method === "credit" && order.status !== "cancelled") && (
          <div className="mt-6 text-center">
            <Link href={`/booking?order=${order.id}`} className="btn btn-primary w-full gap-2">
              <CalendarCheck size={18} weight="bold" />
              Book Installation
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
