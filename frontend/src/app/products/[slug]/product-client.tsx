"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { ShoppingCart, FileText, UserPlus, Clock } from "@phosphor-icons/react";

export default function ProductClient({ product }: { product: any }) {
  const router = useRouter();
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);

  const canSeePrices = product.price !== null && product.price !== undefined;
  const companyStatus = (user as any)?.company_status;
  const isPending = companyStatus === "pending";
  const isRejected = companyStatus === "rejected";

  useEffect(() => {
    api.trackView(product.id, product.name).catch(() => {});
  }, [product.id, product.name]);

  const createOrder = (paymentMethod: string, paymentTerms?: string) => {
    api.createOrder({
      items: [{ productId: product.id, name: product.name, price: Number(product.price), quantity }],
      subtotal: Number(product.price) * quantity,
      tax: 0,
      total: Number(product.price) * quantity,
      paymentMethod,
      ...(paymentTerms ? { paymentTerms } : {}),
    }).then((res) => {
      if (paymentMethod === "credit") toast.success("Order placed on credit");
      router.push(`/orders/${res.order.id}/confirm`);
    }).catch((err) => toast.error(err.message || "Failed to create order"));
  };

  return (
    <div className="mt-8 flex flex-wrap items-end gap-4">
      <div>
        <label className="input-label">Quantity</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          className="input w-24"
        />
      </div>
      {canSeePrices ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary gap-2" onClick={() => createOrder("paystack")}>
            <ShoppingCart size={18} weight="bold" />
            Pay Now — GH₵{Number(product.price).toLocaleString()}
          </button>
          <button className="btn gap-2" onClick={() => createOrder("credit", "net_30")}>
            <FileText size={18} />
            Buy on Credit
          </button>
        </div>
      ) : !user ? (
        <div className="flex flex-wrap gap-2">
          <Link href="/auth/register" className="btn btn-primary gap-2">
            <UserPlus size={18} weight="bold" />
            Register to View Company Pricing
          </Link>
          <Link href={`/rfq/new?product=${product.id}`} className="btn gap-2">
            <FileText size={18} />
            Request Quote
          </Link>
        </div>
      ) : isPending ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            <Clock size={18} />
            Pricing available after account approval
          </span>
          <Link href={`/rfq/new?product=${product.id}`} className="btn gap-2">
            <FileText size={18} />
            Request Quote
          </Link>
        </div>
      ) : isRejected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            <Clock size={18} />
            Account rejected — contact support
          </span>
          <Link href={`/rfq/new?product=${product.id}`} className="btn gap-2">
            <FileText size={18} />
            Request Quote
          </Link>
        </div>
      ) : (
        <Link href={`/rfq/new?product=${product.id}`} className="btn btn-primary gap-2">
          <FileText size={18} weight="bold" />
          Request Quote
        </Link>
      )}
    </div>
  );
}
