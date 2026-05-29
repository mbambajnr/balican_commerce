"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import Link from "next/link";
import { Warning, ArrowRight } from "@phosphor-icons/react";
import { TableSkeleton } from "@/components/admin/LoadingSkeleton";
import DataTable from "@/components/admin/DataTable";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AdminOverdueOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getOrdersWithParams({ paymentStatus: "overdue", limit: "100" });
      setOrders(res.orders || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load overdue orders");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOverdue = async () => {
    setChecking(true);
    try {
      const res = await api.adminCheckOverdue();
      toast.success(`${res.updated} order(s) marked as overdue`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to check overdue");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const daysOverdue = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 h-8 w-56 skeleton rounded-lg" />
        <TableSkeleton rows={5} cols={8} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Overdue Orders</h1>
          <p className="mt-1 text-sm text-soft">{orders.length} overdue order(s)</p>
        </div>
        <button
          onClick={handleCheckOverdue}
          disabled={checking}
          className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
        >
          <Warning size={15} weight="bold" />
          {checking ? "Checking..." : "Check for Overdue"}
        </button>
      </div>

      <DataTable
        columns={[
          { key: "order_number", label: "Order #", render: (o: any) => <span className="font-medium">{o.order_number}</span> },
          { key: "customer", label: "Customer", render: (o: any) => (
            <span className="text-muted">{o.first_name ? `${o.first_name} ${o.last_name}` : o.user?.first_name ? `${o.user.first_name} ${o.user.last_name}` : "\u2014"}</span>
          )},
          { key: "total", label: "Total", render: (o: any) => <span className="font-medium">{formatCurrency(o.total)}</span> },
          { key: "amount_paid", label: "Amount Paid", render: (o: any) => formatCurrency(o.amount_paid) },
          { key: "balance_due", label: "Outstanding", render: (o: any) => <span className="font-medium text-red-600">{formatCurrency(o.balance_due || o.total)}</span> },
          { key: "due_date", label: "Due Date", render: (o: any) => <span className="text-muted">{o.due_date ? formatDate(o.due_date) : "\u2014"}</span> },
          { key: "days_overdue", label: "Days Overdue", render: (o: any) => {
            const overdue = o.due_date ? daysOverdue(o.due_date) : 0;
            return (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                overdue > 30 ? "bg-red-50 text-red-700" :
                overdue > 14 ? "bg-orange-50 text-orange-700" :
                "bg-amber-50 text-amber-700"
              }`}>
                <Warning size={12} weight="fill" />
                {overdue} day{overdue !== 1 ? "s" : ""}
              </span>
            );
          }},
          { key: "actions", label: "", render: (o: any) => (
            <Link href={`/admin/orders/${o.id}/payments`} className="btn btn-sm btn-soft gap-1">
              Payments <ArrowRight size={14} />
            </Link>
          )},
        ]}
        data={orders}
        emptyIcon="orders"
        emptyTitle="No overdue orders"
      />
    </div>
  );
}
