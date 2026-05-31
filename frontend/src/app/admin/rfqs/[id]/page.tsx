"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ArrowLeft, PaperPlaneRight, X, Plus, FloppyDisk, FileText,
} from "@phosphor-icons/react";
import StatusBadge from "@/components/admin/StatusBadge";
import EmptyState from "@/components/admin/EmptyState";
import { PageSkeleton } from "@/components/admin/LoadingSkeleton";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

export default function AdminRfqDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [rfq, setRfq] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Draft quotation editing
  const [editingQ, setEditingQ] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [qForm, setQForm] = useState({
    discountAmount: 0, taxAmount: 0, serviceFee: 0, deliveryFee: 0,
    validUntil: "", terms: "", notesToCustomer: "", internalNotes: "",
  });
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rfqRes, quoRes] = await Promise.all([
        api.getRfq(id),
        api.adminGetRfqQuotations(id),
      ]);
      setRfq(rfqRes.rfq);
      setQuotations(quoRes.quotations);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const startNewQuotation = () => {
    setEditingQ(null);
    setItems([{ description: "", productId: "", quantity: 1, unitPrice: 0 }]);
    setQForm({ discountAmount: 0, taxAmount: 0, serviceFee: 0, deliveryFee: 0, validUntil: "", terms: "", notesToCustomer: "", internalNotes: "" });
    setShowNewForm(true);
  };

  const startEditDraft = async (q: any) => {
    setEditingQ(q);
    setItems(q.items?.length > 0 ? q.items.map((i: any) => ({
      id: i.id, description: i.description, productId: i.product_id || "",
      quantity: Number(i.quantity), unitPrice: Number(i.unit_price),
    })) : [{ description: "", productId: "", quantity: 1, unitPrice: 0 }]);
    setQForm({
      discountAmount: Number(q.discount_amount || 0),
      taxAmount: Number(q.tax_amount || 0),
      serviceFee: Number(q.service_fee || 0),
      deliveryFee: Number(q.delivery_fee || 0),
      validUntil: q.valid_until ? q.valid_until.split("T")[0] : "",
      terms: q.terms || "",
      notesToCustomer: q.notes_to_customer || "",
      internalNotes: q.internal_notes || "",
    });
    setShowNewForm(true);
  };

  const addItem = () => setItems([...items, { description: "", productId: "", quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const next = [...items];
    next[i][field] = value;
    if (field === "quantity" || field === "unitPrice") {
      next[i].lineTotal = Number(next[i].quantity) * Number(next[i].unitPrice);
    }
    setItems(next);
  };

  const calcSubtotal = () => items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitPrice)), 0);
  const calcTotal = () => {
    const sub = calcSubtotal();
    const disc = Number(qForm.discountAmount) || 0;
    const tax = Number(qForm.taxAmount) || 0;
    const svc = Number(qForm.serviceFee) || 0;
    const del = Number(qForm.deliveryFee) || 0;
    return Math.max(0, sub - disc + tax + svc + del);
  };

  const handleCreateAndEdit = async () => {
    setSaving(true);
    try {
      let q: any;
      if (editingQ) {
        q = editingQ;
      } else {
        const res = await api.adminCreateQuotation(id);
        q = res.quotation;
      }

      // Update with items and fields
      const payload: any = {
        items: items.map((i) => ({
          productId: i.productId || undefined,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
        discountAmount: Number(qForm.discountAmount) || 0,
        taxAmount: Number(qForm.taxAmount) || 0,
        serviceFee: Number(qForm.serviceFee) || 0,
        deliveryFee: Number(qForm.deliveryFee) || 0,
        validUntil: qForm.validUntil || undefined,
        terms: qForm.terms || undefined,
        notesToCustomer: qForm.notesToCustomer || undefined,
        internalNotes: qForm.internalNotes || undefined,
      };

      await api.adminUpdateQuotation(q.id, payload);
      toast.success(editingQ ? "Quotation updated" : "Quotation created");
      setShowNewForm(false);
      setEditingQ(null);
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
    finally { setSaving(false); }
  };

  const handleSend = async (qId: string) => {
    try {
      await api.adminSendQuotation(qId);
      toast.success("Quotation sent to customer");
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleCancel = async (qId: string) => {
    if (!confirm("Cancel this quotation?")) return;
    try {
      await api.adminCancelQuotation(qId);
      toast.success("Quotation cancelled");
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  const handleRevise = async (qId: string) => {
    try {
      const res = await api.adminReviseQuotation(qId);
      toast.success(`Revision ${res.quotation.revision_number} created`);
      load();
    } catch (err: any) { toast.error(err.message || "Failed"); }
  };

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-10"><PageSkeleton /></div>;
  if (!rfq) return <div className="mx-auto max-w-5xl px-4 py-10"><EmptyState icon="default" title="RFQ not found" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <button onClick={() => router.push("/admin/rfqs")} className="mb-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
        <ArrowLeft size={16} /> Back to RFQs
      </button>

      {/* RFQ Info Card */}
      <div className="card p-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">RFQ Details</h1>
          <p className="mt-1 text-sm text-muted">ID: {rfq.id.substring(0, 8)}&hellip;</p>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <span className={`badge ${rfq.source === "guest" ? "badge-yellow" : "badge-blue"}`}>
            {rfq.source === "guest" ? "Guest RFQ" : "Company RFQ"}
          </span>
          <StatusBadge status={rfq.status} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Customer</p>
            {rfq.source === "guest" ? (
              <>
                <p className="mt-1 text-sm font-medium">{rfq.contact_name}</p>
                <p className="text-xs text-soft">{rfq.company_name}</p>
                <p className="text-xs text-soft">{rfq.email}</p>
                {rfq.phone && <p className="text-xs text-soft">{rfq.phone}</p>}
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium">{rfq.first_name} {rfq.last_name}</p>
                <p className="text-xs text-soft">{rfq.user_email}</p>
                {rfq.user_phone && <p className="text-xs text-soft">{rfq.user_phone}</p>}
              </>
            )}
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Product</p>
            <p className="mt-1 text-sm font-medium">{rfq.product_name || "\u2014"}</p>
            {rfq.product_sku && <p className="text-xs text-soft">SKU: {rfq.product_sku}</p>}
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Quantity</p>
            <p className="mt-1 text-sm font-medium">{rfq.quantity}</p>
          </div>
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Date</p>
            <p className="mt-1 text-sm">{formatDate(rfq.created_at)}</p>
          </div>
        </div>
        {rfq.address && (
          <div className="mt-4">
            <p className="text-xs text-muted uppercase tracking-wider">Address</p>
            <p className="mt-1 text-sm text-soft">{rfq.address}</p>
          </div>
        )}
        {rfq.message && (
          <div className="mt-4">
            <p className="text-xs text-muted uppercase tracking-wider">Message / Specifications</p>
            <p className="mt-1 text-sm text-soft whitespace-pre-wrap">{rfq.message}</p>
          </div>
        )}
        {rfq.delivery_requirements && (
          <div className="mt-4">
            <p className="text-xs text-muted uppercase tracking-wider">Delivery Requirements</p>
            <p className="mt-1 text-sm text-soft">{rfq.delivery_requirements}</p>
          </div>
        )}
        {rfq.notes && (
          <div className="mt-4">
            <p className="text-xs text-muted uppercase tracking-wider">Customer Notes</p>
            <p className="mt-1 text-sm text-soft">{rfq.notes}</p>
          </div>
        )}

        {/* Attribution */}
        {(rfq.utm_source || rfq.referrer_url) && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs text-muted uppercase tracking-wider">Marketing Source</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
              {rfq.utm_source && <div><span className="text-muted">Source:</span> {rfq.utm_source}</div>}
              {rfq.utm_campaign && <div><span className="text-muted">Campaign:</span> {rfq.utm_campaign}</div>}
              {rfq.utm_medium && <div><span className="text-muted">Medium:</span> {rfq.utm_medium}</div>}
              {rfq.utm_term && <div><span className="text-muted">Term:</span> {rfq.utm_term}</div>}
              {rfq.utm_content && <div><span className="text-muted">Content:</span> {rfq.utm_content}</div>}
              {rfq.gclid && <div><span className="text-muted">GCLID:</span> {rfq.gclid}</div>}
              {rfq.fbclid && <div><span className="text-muted">FBCLID:</span> {rfq.fbclid}</div>}
              {rfq.referrer_url && <div className="sm:col-span-2"><span className="text-muted">Referrer:</span> {rfq.referrer_url}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Quotation Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">Quotations</h2>
          {!showNewForm && (
            <button onClick={startNewQuotation} className="btn btn-primary gap-2">
              <Plus size={16} weight="bold" /> Create Quotation
            </button>
          )}
        </div>

        {/* Draft Quotation Form */}
        {showNewForm && (
          <div className="card mt-4 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">
                {editingQ ? `Edit Quotation (Revision ${editingQ.revision_number})` : "New Draft Quotation"}
              </h3>
              <button onClick={() => { setShowNewForm(false); setEditingQ(null); }} className="btn btn-sm"><X size={14} /> Close</button>
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-ink uppercase tracking-wider">Line Items</p>
                <button type="button" onClick={addItem} className="btn btn-sm gap-1"><Plus size={14} /> Add Item</button>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 bg-zinc-50 rounded-lg p-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="input-label">Description</label>
                      <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)}
                        className="input text-sm" placeholder="Product or service description" />
                    </div>
                    <div className="w-20">
                      <label className="input-label">Qty</label>
                      <input type="number" min="0.01" step="0.01" value={item.quantity}
                        onChange={(e) => updateItem(i, "quantity", e.target.value)} className="input text-sm" />
                    </div>
                    <div className="w-28">
                      <label className="input-label">Unit Price</label>
                      <input type="number" min="0" step="0.01" value={item.unitPrice}
                        onChange={(e) => updateItem(i, "unitPrice", e.target.value)} className="input text-sm" />
                    </div>
                    <div className="w-28">
                      <label className="input-label">Line Total</label>
                      <p className="input-like text-sm">{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}</p>
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="btn btn-sm text-red-500 mb-1"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Fees & Discounts */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="input-label">Discount (GH₵)</label>
                <input type="number" min="0" step="0.01" value={qForm.discountAmount}
                  onChange={(e) => setQForm({ ...qForm, discountAmount: parseFloat(e.target.value) || 0 })}
                  className="input text-sm" />
              </div>
              <div>
                <label className="input-label">Tax (GH₵)</label>
                <input type="number" min="0" step="0.01" value={qForm.taxAmount}
                  onChange={(e) => setQForm({ ...qForm, taxAmount: parseFloat(e.target.value) || 0 })}
                  className="input text-sm" />
              </div>
              <div>
                <label className="input-label">Service Fee (GH₵)</label>
                <input type="number" min="0" step="0.01" value={qForm.serviceFee}
                  onChange={(e) => setQForm({ ...qForm, serviceFee: parseFloat(e.target.value) || 0 })}
                  className="input text-sm" />
              </div>
              <div>
                <label className="input-label">Delivery Fee (GH₵)</label>
                <input type="number" min="0" step="0.01" value={qForm.deliveryFee}
                  onChange={(e) => setQForm({ ...qForm, deliveryFee: parseFloat(e.target.value) || 0 })}
                  className="input text-sm" />
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-lg border border-border bg-white p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{formatCurrency(calcSubtotal())}</span></div>
              <div className="flex justify-between"><span className="text-muted">Discount</span><span className="text-red-500">-{formatCurrency(qForm.discountAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Tax</span><span>+{formatCurrency(qForm.taxAmount)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Service Fee</span><span>+{formatCurrency(qForm.serviceFee)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Delivery Fee</span><span>+{formatCurrency(qForm.deliveryFee)}</span></div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t border-border"><span>Total</span><span>{formatCurrency(calcTotal())}</span></div>
            </div>

            {/* Additional Fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="input-label">Valid Until</label>
                <input type="date" value={qForm.validUntil}
                  onChange={(e) => setQForm({ ...qForm, validUntil: e.target.value })}
                  className="input text-sm" />
              </div>
            </div>
            <div>
              <label className="input-label">Terms & Conditions</label>
              <textarea rows={2} value={qForm.terms} onChange={(e) => setQForm({ ...qForm, terms: e.target.value })}
                className="input text-sm" placeholder="Payment terms, delivery timeline, etc." />
            </div>
            <div>
              <label className="input-label">Notes to Customer</label>
              <textarea rows={2} value={qForm.notesToCustomer} onChange={(e) => setQForm({ ...qForm, notesToCustomer: e.target.value })}
                className="input text-sm" />
            </div>
            <div>
              <label className="input-label">Internal Notes</label>
              <textarea rows={2} value={qForm.internalNotes} onChange={(e) => setQForm({ ...qForm, internalNotes: e.target.value })}
                className="input text-sm" />
            </div>

            <div className="flex gap-3">
              <button onClick={handleCreateAndEdit} disabled={saving} className="btn btn-primary gap-2">
                <FloppyDisk size={16} />
                {saving ? "Saving..." : editingQ ? "Update Draft" : "Create Draft"}
              </button>
            </div>
          </div>
        )}

        {/* Quotation History */}
        {quotations.length === 0 && !showNewForm ? (
          <EmptyState icon="quotations" title="No quotations yet" />
        ) : (
          <div className="mt-4 space-y-4">
            {quotations.map((q: any) => (
              <div key={q.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-ink">{q.quotation_number}</h3>
                      {q.revision_number > 1 && (
                        <span className="text-xs text-muted">Rev {q.revision_number}</span>
                      )}
                      {q.parent_quotation_id && (
                        <span className="text-xs text-muted">(revision)</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">Created: {formatDateTime(q.created_at)}</p>
                  </div>
                  <StatusBadge status={q.status} />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-4 text-sm">
                  <div><span className="text-muted">Subtotal:</span> {formatCurrency(q.subtotal)}</div>
                  {(Number(q.discount_amount) > 0) && <div><span className="text-muted">Discount:</span> -{formatCurrency(q.discount_amount)}</div>}
                  {(Number(q.tax_amount) > 0) && <div><span className="text-muted">Tax:</span> {formatCurrency(q.tax_amount)}</div>}
                  <div className="font-semibold"><span className="text-muted font-normal">Total:</span> {formatCurrency(q.total_amount)}</div>
                </div>

                {q.items && q.items.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted uppercase tracking-wider">
                          <th className="text-left py-1 pr-2">Item</th>
                          <th className="text-right px-2">Qty</th>
                          <th className="text-right px-2">Unit Price</th>
                          <th className="text-right pl-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.items.map((item: any) => (
                          <tr key={item.id} className="border-t border-border/50">
                            <td className="py-1.5 pr-2">{item.description}</td>
                            <td className="text-right px-2">{Number(item.quantity)}</td>
                            <td className="text-right px-2">{formatCurrency(item.unit_price)}</td>
                            <td className="text-right pl-2 font-medium">{formatCurrency(item.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {q.notes_to_customer && (
                  <p className="mt-2 text-xs text-soft italic">Notes: {q.notes_to_customer}</p>
                )}
                {q.terms && (
                  <p className="mt-1 text-xs text-muted">Terms: {q.terms}</p>
                )}

                {/* Events timeline */}
                {q.events && q.events.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Timeline</p>
                    <div className="space-y-1">
                      {q.events.map((ev: any) => (
                        <div key={ev.id} className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full bg-zinc-300 shrink-0" />
                          <span className="text-muted">{formatDateTime(ev.created_at)}</span>
                          <span>{ev.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {q.status === "draft" && (
                    <>
                      <button onClick={() => startEditDraft(q)} className="btn btn-sm gap-1"><FloppyDisk size={14} /> Edit</button>
                      <a href={`/api/admin/quotations/${q.id}/preview`} target="_blank" className="btn btn-sm gap-1"><FileText size={14} /> Preview</a>
                      <button onClick={() => handleSend(q.id)} className="btn btn-sm btn-primary gap-1"><PaperPlaneRight size={14} /> Send</button>
                      <button onClick={() => handleCancel(q.id)} className="btn btn-sm gap-1"><X size={14} /> Cancel Draft</button>
                    </>
                  )}
                  {["sent", "viewed"].includes(q.status) && (
                    <>
                      <button onClick={() => handleCancel(q.id)} className="btn btn-sm gap-1"><X size={14} /> Cancel</button>
                      <button onClick={() => handleRevise(q.id)} className="btn btn-sm gap-1"><Plus size={14} /> Revise</button>
                    </>
                  )}
                  {["accepted", "rejected", "expired", "cancelled"].includes(q.status) && (
                    <button onClick={() => handleRevise(q.id)} className="btn btn-sm gap-1"><Plus size={14} /> New Revision</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
