"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getUTM } from "@/lib/utm";
import { fireConversion } from "@/components/TrackingScripts";
import toast from "react-hot-toast";
import { PaperPlaneRight, User, Trash } from "@phosphor-icons/react";
import ProductSearchSelect from "@/components/ProductSearchSelect";

function RfqForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isGuest = !user;

  // Parse pre-selected products from query params
  const productsParam = searchParams.get("products");
  const singleProductParam = searchParams.get("product");
  const preselectedIds = productsParam ? productsParam.split(",").filter(Boolean) : [];

  const [items, setItems] = useState<{ productId: string; quantity: number }[]>(() => {
    if (preselectedIds.length > 0) {
      return preselectedIds.map((id) => ({ productId: id, quantity: 1 }));
    }
    if (singleProductParam) {
      return [{ productId: singleProductParam, quantity: 1 }];
    }
    return [];
  });

  const isBulk = items.length > 1;

  const [shared, setShared] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    message: "",
    deliveryRequirements: "",
    notes: "",
  });

  useEffect(() => {
    api.getProducts().then((res) => setAllProducts(res.products)).catch(() => {});
  }, []);

  const productMap = new Map(allProducts.map((p: any) => [p.id, p]));

  const updateItemQuantity = (productId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) => (item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item))
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { productId: "", quantity: 1 }]);
  };

  const updateItemProduct = (index: number, productId: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, productId } : item)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate items
    const validItems = items.filter((item) => item.productId);
    if (validItems.length === 0) { toast.error("Please select at least one product"); return; }
    for (const item of validItems) {
      if (!item.productId) { toast.error("Please select a product"); return; }
    }

    setSubmitting(true);

    try {
      const utm = getUTM();

      if (isBulk) {
        // Use bulk endpoint for multiple items
        const data: any = { items: validItems, ...utm };
        if (isGuest) {
          if (!shared.companyName.trim()) { toast.error("Company name is required"); setSubmitting(false); return; }
          if (!shared.contactName.trim()) { toast.error("Contact name is required"); setSubmitting(false); return; }
          if (!shared.email.trim()) { toast.error("Email is required"); setSubmitting(false); return; }
          if (!shared.phone.trim()) { toast.error("Phone/WhatsApp is required"); setSubmitting(false); return; }
          if (!shared.address.trim()) { toast.error("Address is required"); setSubmitting(false); return; }
          if (!shared.message.trim()) { toast.error("Message/specification is required"); setSubmitting(false); return; }
          data.companyName = shared.companyName.trim();
          data.contactName = shared.contactName.trim();
          data.email = shared.email.trim();
          data.phone = shared.phone.trim();
          data.address = shared.address.trim();
          data.message = shared.message.trim();
        } else {
          if (shared.deliveryRequirements) data.deliveryRequirements = shared.deliveryRequirements;
          if (shared.notes) data.notes = shared.notes;
        }
        await api.bulkRfq(data);
        toast.success(isGuest ? "Quote requests submitted! Our team will contact you shortly." : "RFQs submitted");
        fireConversion("Lead", { value: 0, currency: "GHS" });
        router.push(isGuest ? "/" : "/account/rfqs");
      } else {
        // Single product — use original endpoints for backward compat
        if (isGuest) {
          if (!shared.companyName.trim()) { toast.error("Company name is required"); setSubmitting(false); return; }
          if (!shared.contactName.trim()) { toast.error("Contact name is required"); setSubmitting(false); return; }
          if (!shared.email.trim()) { toast.error("Email is required"); setSubmitting(false); return; }
          if (!shared.phone.trim()) { toast.error("Phone/WhatsApp is required"); setSubmitting(false); return; }
          if (!shared.address.trim()) { toast.error("Address is required"); setSubmitting(false); return; }
          if (!shared.message.trim()) { toast.error("Message/specification is required"); setSubmitting(false); return; }

          const selected = productMap.get(validItems[0].productId);
          await api.guestRfq({
            companyName: shared.companyName.trim(),
            contactName: shared.contactName.trim(),
            email: shared.email.trim(),
            phone: shared.phone.trim(),
            address: shared.address.trim(),
            productId: validItems[0].productId,
            productName: selected?.name || null,
            productSku: selected?.sku || null,
            quantity: validItems[0].quantity,
            message: shared.message.trim(),
            ...utm,
          });
          toast.success("Quote request submitted! Our team will contact you shortly.");
          fireConversion("Lead", { value: 0, currency: "GHS" });
          router.push("/");
        } else {
          await api.createRfq({
            productId: validItems[0].productId,
            quantity: validItems[0].quantity,
            deliveryRequirements: shared.deliveryRequirements || undefined,
            notes: shared.notes || undefined,
            ...utm,
          });
          toast.success("RFQ submitted");
          fireConversion("Lead", { value: 0, currency: "GHS" });
          router.push("/account/rfqs");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Request a Quote</h1>
        {isBulk ? (
          <p className="mt-1 text-sm text-soft">You have {items.length} product(s) selected for quotation.</p>
        ) : isGuest ? (
          <p className="mt-1 text-sm text-soft">Submit your company details and our sales team will respond.</p>
        ) : (
          <p className="mt-1 text-sm text-soft">Tell us what you need and we&apos;ll get back to you within hours</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6 p-5 sm:p-8">
        {/* Product selection area */}
        <div className="space-y-4">
          <label className="input-label">{isBulk || items.length > 1 ? "Products" : "Product"}</label>
          {items.length === 0 ? (
            <ProductSearchSelect
              products={allProducts}
              value=""
              onChange={(id) => setItems([{ productId: id, quantity: 1 }])}
            />
          ) : (
            items.map((item, index) => (
              <div key={item.productId || index} className={`grid items-start gap-2 sm:gap-3 ${isBulk ? "grid-cols-[minmax(0,1fr)_5rem_2.75rem]" : "grid-cols-[minmax(0,1fr)_5rem]"}`}>
                <div className="flex-1 min-w-0">
                  <ProductSearchSelect
                    products={allProducts}
                    value={item.productId}
                    onChange={(id) => updateItemProduct(index, id)}
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value) || 1)}
                  className="input w-20 text-center shrink-0"
                  required
                />
                {isBulk && (
                  <button type="button" onClick={() => removeItem(item.productId)} aria-label="Remove product" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-red-500">
                    <Trash size={16} />
                  </button>
                )}
              </div>
            ))
          )}
          {items.length > 0 && !items.some((item) => !item.productId) && (
            <button type="button" onClick={addItem} className="text-sm text-accent hover:underline">
              + Add another product
            </button>
          )}
        </div>

        {/* Guest fields */}
        {isGuest && (
          <div className="border-t border-border pt-6">
            <h2 className="font-display text-base font-semibold text-ink mb-4">Your Company Details</h2>
            <div className="space-y-4">
              <div>
                <label className="input-label">Company Name <span className="text-red-500">*</span></label>
                <input type="text" value={shared.companyName} onChange={(e) => setShared({ ...shared, companyName: e.target.value })} className="input" placeholder="Your company name" required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="input-label">Contact Person Name <span className="text-red-500">*</span></label>
                  <input type="text" value={shared.contactName} onChange={(e) => setShared({ ...shared, contactName: e.target.value })} className="input" placeholder="Full name" required />
                </div>
                <div>
                  <label className="input-label">Phone / WhatsApp <span className="text-red-500">*</span></label>
                  <input type="tel" value={shared.phone} onChange={(e) => setShared({ ...shared, phone: e.target.value })} className="input" placeholder="+233 XX XXX XXXX" required />
                </div>
              </div>
              <div>
                <label className="input-label">Email <span className="text-red-500">*</span></label>
                <input type="email" value={shared.email} onChange={(e) => setShared({ ...shared, email: e.target.value })} className="input" placeholder="email@company.com" required />
              </div>
              <div>
                <label className="input-label">Company Address / Location <span className="text-red-500">*</span></label>
                <textarea rows={2} value={shared.address} onChange={(e) => setShared({ ...shared, address: e.target.value })} className="input" placeholder="Street, city, region" required />
              </div>
              <div>
                <label className="input-label">Message / Specifications <span className="text-red-500">*</span></label>
                <textarea rows={4} value={shared.message} onChange={(e) => setShared({ ...shared, message: e.target.value })} className="input" placeholder="Describe what you need, technical specifications, delivery timeline, etc." required />
              </div>
            </div>
          </div>
        )}

        {/* Auth-only fields */}
        {!isGuest && (
          <>
            <div>
              <label className="input-label">Delivery Requirements</label>
              <textarea rows={3} value={shared.deliveryRequirements} onChange={(e) => setShared({ ...shared, deliveryRequirements: e.target.value })} className="input" placeholder="Where should we deliver? Any special handling needed?" />
            </div>
            <div>
              <label className="input-label">Additional Notes</label>
              <textarea rows={3} value={shared.notes} onChange={(e) => setShared({ ...shared, notes: e.target.value })} className="input" />
            </div>
          </>
        )}

        <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
          <PaperPlaneRight size={18} weight="bold" />
          {submitting ? "Submitting..." : isBulk ? `Submit Quote Requests (${items.length} products)` : "Submit Quote Request"}
        </button>

        {isGuest && (
          <p className="text-center text-xs text-muted">
            <User size={14} className="inline mr-1" />
            Already have an account?{" "}
            <Link href="/auth/login" className="text-accent hover:underline">Login</Link>
            {" — "}
            <Link href="/auth/register" className="text-accent hover:underline">Register to view company pricing</Link>
          </p>
        )}
      </form>
    </div>
  );
}

export default function RfqPageClient() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-4 py-10"><div className="h-96 skeleton" /></div>}>
      <RfqForm />
    </Suspense>
  );
}
