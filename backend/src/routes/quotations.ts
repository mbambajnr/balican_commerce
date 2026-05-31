import { Router, Response } from "express";
import { z } from "zod";
import { query, transaction } from "../config/db";
import { authenticate, requireAdmin, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { config } from "../config";
import { notifyAndLog } from "../services/notifications";
import { sendEmail } from "../services/email";
import { generateQuotationPdf, QuotationPdfData, QuotationPdfItem } from "../services/pdf";

const FRONTEND_URL = config.frontendUrl;

const router = Router();

function genQuotationNumber() {
  return `QTN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

async function logQuotationEvent(
  quotationId: string,
  userId: string | undefined | null,
  eventType: string,
  description: string,
  metadata: Record<string, any> = {}
) {
  await query(
    `INSERT INTO quotation_events (quotation_id, user_id, event_type, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [quotationId, userId || null, eventType, description, JSON.stringify(metadata)]
  );
}

/* ── Admin/Sales quotation endpoints ── */

const QUOTATION_EDITABLE_STATUSES = ["draft"];

// Create quotation from RFQ
router.post("/admin/rfqs/:id/quotations", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const rfqResult = await query(
      `SELECT r.*, u.id as uid FROM rfqs r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = $1`,
      [req.params.id]
    );
    if (rfqResult.rows.length === 0) return res.status(404).json({ error: "RFQ not found" });
    const rfq = rfqResult.rows[0];

    // Auto-update RFQ to under_review if still pending
    if (rfq.status === "pending") {
      await query("UPDATE rfqs SET status = 'under_review', updated_at = NOW() WHERE id = $1", [rfq.id]);
    }

    const prodResult = await query("SELECT id, name, price FROM products WHERE id = $1", [rfq.product_id]);
    const product = prodResult.rows[0] || null;
    const unitPrice = product ? Number(product.price) : 0;
    const lineTotal = unitPrice * rfq.quantity;

    const quotationNumber = genQuotationNumber();

    const result = await query(
      `INSERT INTO quotations (rfq_id, customer_id, quotation_number, subtotal, total_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [rfq.id, rfq.user_id, quotationNumber, lineTotal, lineTotal, req.userId]
    );
    const quotation = result.rows[0];

    // Create default item
    await query(
      `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, line_total, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [
        quotation.id,
        product?.id || rfq.product_id,
        product?.name || `Product from RFQ #${rfq.id.substring(0, 8)}`,
        rfq.quantity,
        unitPrice,
        lineTotal,
      ]
    );

    // Fetch the item back
    const itemsResult = await query(
      "SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order",
      [quotation.id]
    );
    quotation.items = itemsResult.rows;

    await logQuotationEvent(quotation.id, req.userId, "quotation.created", "Draft quotation created");

    const custRes = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [rfq.user_id]);
    if (custRes.rows.length > 0) {
      const c = custRes.rows[0];
      notifyAndLog({
        recipientEmail: c.email,
        recipientName: `${c.first_name} ${c.last_name}`,
        subject: "Quotation Created",
        body: `Your quotation #${quotation.quotation_number} has been created.`,
        eventType: "quotation.created",
        entityType: "quotation",
        entityId: quotation.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.status(201).json({ quotation });
  } catch (err) {
    console.error("Create quotation error:", err);
    res.status(500).json({ error: "Failed to create quotation" });
  }
});

// List quotations for an RFQ
router.get("/admin/rfqs/:id/quotations", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT q.*, u.first_name || ' ' || u.last_name as created_by_name
       FROM quotations q
       LEFT JOIN users u ON q.created_by = u.id
       WHERE q.rfq_id = $1
       ORDER BY q.created_at DESC`,
      [req.params.id]
    );

    // Fetch items for each quotation
    for (const q of result.rows) {
      const items = await query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [q.id]);
      q.items = items.rows;
      const events = await query("SELECT * FROM quotation_events WHERE quotation_id = $1 ORDER BY created_at", [q.id]);
      q.events = events.rows;
    }

    res.json({ quotations: result.rows });
  } catch (err) {
    console.error("Get RFQ quotations error:", err);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
});

// List all quotations (admin) with filters
router.get("/admin/quotations", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push(`q.status = $${params.length + 1}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(q.quotation_number ILIKE $${params.length + 1} OR u.first_name ILIKE $${params.length + 1} OR u.last_name ILIKE $${params.length + 1})`);
      params.push(`%${search}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countResult = await query(
      `SELECT COUNT(*) FROM quotations q LEFT JOIN users u ON q.customer_id = u.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT q.*, u.first_name, u.last_name, u.email,
              (SELECT COUNT(*) FROM quotation_items WHERE quotation_id = q.id) as item_count
       FROM quotations q
       LEFT JOIN users u ON q.customer_id = u.id
       ${where}
       ORDER BY q.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      quotations: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Get quotations error:", err);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
});

// Get single quotation (admin)
router.get("/admin/quotations/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT q.*, u.first_name, u.last_name, u.email, u.phone, u.company
       FROM quotations q
       LEFT JOIN users u ON q.customer_id = u.id
       WHERE q.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Quotation not found" });

    const quotation = result.rows[0];
    quotation.items = (await query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [quotation.id])).rows;
    quotation.events = (await query("SELECT * FROM quotation_events WHERE quotation_id = $1 ORDER BY created_at", [quotation.id])).rows;

    res.json({ quotation });
  } catch (err) {
    console.error("Get quotation error:", err);
    res.status(500).json({ error: "Failed to fetch quotation" });
  }
});

// Update quotation draft
const updateQuotationSchema = z.object({
  items: z.array(z.object({
    id: z.string().optional(),
    productId: z.string().optional(),
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
  })).optional(),
  discountAmount: z.number().min(0).optional(),
  taxAmount: z.number().min(0).optional(),
  serviceFee: z.number().min(0).optional(),
  deliveryFee: z.number().min(0).optional(),
  validUntil: z.string().optional(),
  terms: z.string().optional(),
  notesToCustomer: z.string().optional(),
  internalNotes: z.string().optional(),
  currency: z.string().optional(),
});

router.patch("/admin/quotations/:id", authenticate, requireAdmin, validate(updateQuotationSchema), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await query("SELECT * FROM quotations WHERE id = $1", [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "Quotation not found" });
    const quotation = existing.rows[0];

    if (!QUOTATION_EDITABLE_STATUSES.includes(quotation.status)) {
      return res.status(400).json({
        error: `Cannot edit quotation with status "${quotation.status}". Create a revision instead.`,
      });
    }

    const { items, discountAmount, taxAmount, serviceFee, deliveryFee, validUntil, terms, notesToCustomer, internalNotes, currency } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (discountAmount !== undefined) { fields.push(`discount_amount = $${idx++}`); values.push(discountAmount); }
    if (taxAmount !== undefined) { fields.push(`tax_amount = $${idx++}`); values.push(taxAmount); }
    if (serviceFee !== undefined) { fields.push(`service_fee = $${idx++}`); values.push(serviceFee); }
    if (deliveryFee !== undefined) { fields.push(`delivery_fee = $${idx++}`); values.push(deliveryFee); }
    if (validUntil !== undefined) { fields.push(`valid_until = $${idx++}`); values.push(validUntil); }
    if (terms !== undefined) { fields.push(`terms = $${idx++}`); values.push(terms); }
    if (notesToCustomer !== undefined) { fields.push(`notes_to_customer = $${idx++}`); values.push(notesToCustomer); }
    if (internalNotes !== undefined) { fields.push(`internal_notes = $${idx++}`); values.push(internalNotes); }
    if (currency !== undefined) { fields.push(`currency = $${idx++}`); values.push(currency); }

    // Recalculate totals if items changed
    if (items && items.length > 0) {
      // Delete old items
      await query("DELETE FROM quotation_items WHERE quotation_id = $1", [quotation.id]);

      // Insert new items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const lineTotal = item.quantity * item.unitPrice;
        await query(
          `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, line_total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [quotation.id, item.productId || null, item.description, item.quantity, item.unitPrice, lineTotal, i]
        );
      }

      // Recalculate subtotal
      const subtotalResult = await query(
        "SELECT COALESCE(SUM(line_total), 0) as subtotal FROM quotation_items WHERE quotation_id = $1",
        [quotation.id]
      );
      const subtotal = parseFloat(subtotalResult.rows[0].subtotal);
      const discount = discountAmount !== undefined ? discountAmount : parseFloat(quotation.discount_amount || "0");
      const tax = taxAmount !== undefined ? taxAmount : parseFloat(quotation.tax_amount || "0");
      const service = serviceFee !== undefined ? serviceFee : parseFloat(quotation.service_fee || "0");
      const delivery = deliveryFee !== undefined ? deliveryFee : parseFloat(quotation.delivery_fee || "0");
      const total = subtotal - discount + tax + service + delivery;

      fields.push(`subtotal = $${idx++}`); values.push(subtotal);
      fields.push(`total_amount = $${idx++}`); values.push(Math.max(0, total));
    }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    await query(
      `UPDATE quotations SET ${fields.join(", ")} WHERE id = $${idx}`,
      values
    );

    const updatedResult = await query("SELECT * FROM quotations WHERE id = $1", [req.params.id]);
    const updated = updatedResult.rows[0];
    updated.items = (await query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [updated.id])).rows;

    res.json({ quotation: updated });
  } catch (err) {
    console.error("Update quotation error:", err);
    res.status(500).json({ error: "Failed to update quotation" });
  }
});

// Send quotation
router.post("/admin/quotations/:id/send", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { quotation, rfq, items, customerUser } = await transaction(async (client) => {
      const lock = await client.query("SELECT * FROM quotations WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (lock.rows.length === 0) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });

      const quotation = lock.rows[0];
      if (quotation.status !== "draft") {
        throw Object.assign(new Error(`Cannot send quotation with status "${quotation.status}"`), { statusCode: 400 });
      }

      const items = (await client.query(
        `SELECT qi.*, p.slug as product_slug
         FROM quotation_items qi
         LEFT JOIN products p ON qi.product_id = p.id
         WHERE qi.quotation_id = $1 ORDER BY qi.sort_order`,
        [quotation.id]
      )).rows;
      if (items.length === 0) throw Object.assign(new Error("Cannot send quotation with no items"), { statusCode: 400 });

      // Snapshot product slugs and URLs on each item
      for (const item of items) {
        const slug = item.product_slug || "";
        const url = slug ? `${FRONTEND_URL}/products/${slug}` : "";
        await client.query(
          `UPDATE quotation_items SET product_slug = $1, product_url = $2 WHERE id = $3`,
          [slug || null, url || null, item.id]
        );
        item.product_url = url || undefined;
      }

      // Fetch RFQ + customer info
      const rfqResult = await client.query("SELECT * FROM rfqs WHERE id = $1", [quotation.rfq_id]);
      const rfq = rfqResult.rows[0] || null;

      // For guest RFQs, use the RFQ contact info; for registered, look up user
      let recipientEmail: string;
      let recipientName: string;
      let clientPhone = "";
      let clientAddress = "";

      if (rfq && rfq.source === "guest") {
        recipientEmail = rfq.email;
        recipientName = rfq.contact_name || rfq.company_name || "Guest";
        clientPhone = rfq.phone || "";
        clientAddress = rfq.address || "";
      } else {
        const uResult = await client.query("SELECT email, first_name, last_name, phone FROM users WHERE id = $1", [quotation.customer_id]);
        const u = uResult.rows[0] || { email: "", first_name: "", last_name: "", phone: "" };
        recipientEmail = u.email;
        recipientName = `${u.first_name} ${u.last_name}`.trim() || "Customer";
        clientPhone = u.phone || "";
        clientAddress = rfq?.address || "";
      }

      const pdfData: QuotationPdfData = {
        quotationNumber: quotation.quotation_number,
        createdAt: quotation.created_at,
        rfqReference: quotation.rfq_id ? quotation.rfq_id.substring(0, 8) : "—",
        clientName: recipientName,
        clientEmail: recipientEmail,
        clientPhone,
        clientAddress,
        items: items.map((i: any): QuotationPdfItem => ({
          description: i.description,
          sku: "",
          quantity: parseFloat(i.quantity),
          unitPrice: parseFloat(i.unit_price),
          lineTotal: parseFloat(i.line_total),
          productUrl: i.product_url,
        })),
        discountAmount: parseFloat(quotation.discount_amount || "0"),
        taxAmount: parseFloat(quotation.tax_amount || "0"),
        serviceFee: parseFloat(quotation.service_fee || "0"),
        deliveryFee: parseFloat(quotation.delivery_fee || "0"),
        subtotal: parseFloat(quotation.subtotal || "0"),
        totalAmount: parseFloat(quotation.total_amount || "0"),
        validUntil: quotation.valid_until || "",
        terms: quotation.terms || "",
        notesToCustomer: quotation.notes_to_customer || "",
        currency: quotation.currency || "GH₵",
      };

      const pdfBuffer = await generateQuotationPdf(pdfData);

      // Send email with PDF attachment
      const emailResult = await sendEmail({
        to: recipientEmail,
        subject: `Quotation #${quotation.quotation_number} from Bali-Can Limited`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #1848CC;">Quotation #${quotation.quotation_number}</h2>
            <p>Dear ${recipientName},</p>
            <p>Please find attached quotation #${quotation.quotation_number} from <strong>Bali-Can Limited</strong>.</p>
            <p>You can view and respond to this quotation by logging into your account.</p>
            <hr style="border: none; border-top: 1px solid #D8E2FF;" />
            <p style="font-size: 12px; color: #64748B;">Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana</p>
          </div>
        `,
        attachments: [{ filename: `quotation-${quotation.quotation_number}.pdf`, content: pdfBuffer }],
      });

      if (!emailResult.success) {
        throw Object.assign(
          new Error(`Failed to send quotation email: ${emailResult.error || "Unknown error"}`),
          { statusCode: 502 }
        );
      }

      const emailData = emailResult.data;
      const emailId = emailData?.id || null;

      // Now mark as sent (only after email succeeds)
      const updateResult = await client.query(
        `UPDATE quotations SET status = 'sent', sent_at = NOW(), pdf_url = $1, updated_at = NOW() WHERE id = $2 AND status = 'draft'`,
        [emailId ? `resend:${emailId}` : null, quotation.id]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Quotation status changed unexpectedly"), { statusCode: 409 });
      }

      await client.query("UPDATE rfqs SET status = 'quote_sent', updated_at = NOW() WHERE id = $1", [quotation.rfq_id]);

      // Log email in email_logs with status sent
      await client.query(
        `INSERT INTO email_logs (recipient_email, recipient_name, subject, event_type, entity_type, entity_id,
          quotation_id, rfq_id, status, sent_by, provider_response, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [recipientEmail, recipientName, `Quotation #${quotation.quotation_number} Sent`,
         "quotation.sent", "quotation", quotation.id, quotation.id, quotation.rfq_id,
         "sent", req.userId!, emailId ? JSON.stringify({ resendId: emailId }) : null]
      );

      const updated = (await client.query("SELECT * FROM quotations WHERE id = $1", [quotation.id])).rows[0];
      updated.items = items;
      return { quotation: updated, rfq, items, customerUser: { email: recipientEmail, name: recipientName } };
    });

    await logQuotationEvent(quotation.id, req.userId, "quotation.sent", "Quotation sent to customer");

    res.json({ quotation });
  } catch (err: any) {
    console.error("Send quotation error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to send quotation" });
  }
});

// Preview quotation PDF
router.get("/admin/quotations/:id/preview", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT q.*, u.first_name, u.last_name, u.email, u.phone
       FROM quotations q
       LEFT JOIN users u ON q.customer_id = u.id
       WHERE q.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Quotation not found" });
    const quotation = result.rows[0];

    const itemsResult = await query(
      `SELECT qi.*, p.slug as product_slug
       FROM quotation_items qi
       LEFT JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1 ORDER BY qi.sort_order`,
      [quotation.id]
    );
    const items = itemsResult.rows;

    // Fetch RFQ for customer info
    const rfqResult = await query("SELECT * FROM rfqs WHERE id = $1", [quotation.rfq_id]);
    const rfq = rfqResult.rows[0] || null;

    let clientName: string;
    let clientEmail: string;
    let clientPhone = "";
    let clientAddress = "";

    if (rfq && rfq.source === "guest") {
      clientName = rfq.contact_name || rfq.company_name || "Guest";
      clientEmail = rfq.email;
      clientPhone = rfq.phone || "";
      clientAddress = rfq.address || "";
    } else {
      clientName = `${quotation.first_name || ""} ${quotation.last_name || ""}`.trim() || "Customer";
      clientEmail = quotation.email || "";
      clientPhone = quotation.phone || "";
      clientAddress = rfq?.address || "";
    }

    const pdfData: QuotationPdfData = {
      quotationNumber: quotation.quotation_number,
      createdAt: quotation.created_at,
      rfqReference: quotation.rfq_id ? quotation.rfq_id.substring(0, 8) : "—",
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      items: items.map((i: any): QuotationPdfItem => ({
        description: i.description,
        sku: i.product_slug || "",
        quantity: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        lineTotal: parseFloat(i.line_total),
        productUrl: i.product_url || (i.product_slug ? `${FRONTEND_URL}/products/${i.product_slug}` : undefined),
      })),
      discountAmount: parseFloat(quotation.discount_amount || "0"),
      taxAmount: parseFloat(quotation.tax_amount || "0"),
      serviceFee: parseFloat(quotation.service_fee || "0"),
      deliveryFee: parseFloat(quotation.delivery_fee || "0"),
      subtotal: parseFloat(quotation.subtotal || "0"),
      totalAmount: parseFloat(quotation.total_amount || "0"),
      validUntil: quotation.valid_until || "",
      terms: quotation.terms || "",
      notesToCustomer: quotation.notes_to_customer || "",
      currency: quotation.currency || "GH₵",
    };

    const pdfBuffer = await generateQuotationPdf(pdfData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="quotation-${quotation.quotation_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Preview quotation error:", err);
    res.status(500).json({ error: "Failed to generate PDF preview" });
  }
});

// Cancel quotation
router.post("/admin/quotations/:id/cancel", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await transaction(async (client) => {
      const lock = await client.query("SELECT * FROM quotations WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (lock.rows.length === 0) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });

      const quotation = lock.rows[0];
      if (!["draft", "sent", "viewed"].includes(quotation.status)) {
        throw Object.assign(new Error(`Cannot cancel quotation with status "${quotation.status}"`), { statusCode: 400 });
      }

      const updateResult = await client.query(
        `UPDATE quotations SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status IN ('draft', 'sent', 'viewed')`,
        [quotation.id]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Quotation status changed unexpectedly"), { statusCode: 409 });
      }

      const updated = (await client.query("SELECT * FROM quotations WHERE id = $1", [quotation.id])).rows[0];
      return { updated, quotation };
    });

    await logQuotationEvent(result.quotation.id, req.userId, "quotation.cancelled", "Quotation cancelled");

    const custCancel = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [result.quotation.customer_id]);
    if (custCancel.rows.length > 0) {
      const c = custCancel.rows[0];
      notifyAndLog({
        recipientEmail: c.email,
        recipientName: `${c.first_name} ${c.last_name}`,
        subject: "Quotation Cancelled",
        body: `Your quotation #${result.quotation.quotation_number} has been cancelled.`,
        eventType: "quotation.cancelled",
        entityType: "quotation",
        entityId: result.quotation.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.json({ quotation: result.updated });
  } catch (err: any) {
    console.error("Cancel quotation error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to cancel quotation" });
  }
});

// Revise quotation (create new revision)
router.post("/admin/quotations/:id/revise", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await transaction(async (client) => {
      const lock = await client.query("SELECT * FROM quotations WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (lock.rows.length === 0) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });

      const source = lock.rows[0];
      if (["draft", "cancelled"].includes(source.status)) {
        throw Object.assign(new Error("Only sent/viewed/accepted/rejected/expired quotations can be revised"), { statusCode: 400 });
      }

      const quotationNumber = genQuotationNumber();
      const revisionNumber = (source.revision_number || 1) + 1;

      const insertResult = await client.query(
        `INSERT INTO quotations (rfq_id, customer_id, quotation_number, status, revision_number, parent_quotation_id,
          subtotal, discount_amount, tax_amount, service_fee, delivery_fee, total_amount, currency, valid_until, terms,
          notes_to_customer, internal_notes, created_by)
         VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING *`,
        [
          source.rfq_id, source.customer_id, quotationNumber, revisionNumber, source.id,
          source.subtotal, source.discount_amount, source.tax_amount, source.service_fee,
          source.delivery_fee, source.total_amount, source.currency, source.valid_until,
          source.terms, source.notes_to_customer, source.internal_notes, req.userId,
        ]
      );
      const revised = insertResult.rows[0];

      // Copy items
      const sourceItems = await client.query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [source.id]);
      for (const item of sourceItems.rows) {
        await client.query(
          `INSERT INTO quotation_items (quotation_id, product_id, description, quantity, unit_price, line_total, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [revised.id, item.product_id, item.description, item.quantity, item.unit_price, item.line_total, item.sort_order]
        );
      }

      revised.items = (await client.query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [revised.id])).rows;
      return { revised, source, revisionNumber };
    });

    await logQuotationEvent(result.revised.id, req.userId, "quotation.revised", `Revision ${result.revisionNumber} created from ${result.source.quotation_number}`);

    const custRev = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [result.source.customer_id]);
    if (custRev.rows.length > 0) {
      const c = custRev.rows[0];
      notifyAndLog({
        recipientEmail: c.email,
        recipientName: `${c.first_name} ${c.last_name}`,
        subject: "Quotation Revised",
        body: `Your quotation #${result.revised.quotation_number} has been revised.`,
        eventType: "quotation.revised",
        entityType: "quotation",
        entityId: result.revised.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    res.status(201).json({ quotation: result.revised });
  } catch (err: any) {
    console.error("Revise quotation error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to revise quotation" });
  }
});

/* ── Customer quotation endpoints ── */

// List my quotations
router.get("/customer/quotations", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT q.*, r.quantity, r.delivery_requirements,
              p.name as product_name, p.slug as product_slug
       FROM quotations q
       LEFT JOIN rfqs r ON q.rfq_id = r.id
       LEFT JOIN products p ON r.product_id = p.id
       WHERE q.customer_id = $1
       ORDER BY q.created_at DESC`,
      [req.userId]
    );

    for (const q of result.rows) {
      q.items = (await query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [q.id])).rows;
    }

    res.json({ quotations: result.rows });
  } catch (err) {
    console.error("Get customer quotations error:", err);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
});

// Get single quotation (customer)
router.get("/customer/quotations/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT q.*, r.quantity, r.delivery_requirements, r.notes as rfq_notes,
              p.name as product_name, p.slug as product_slug
       FROM quotations q
       LEFT JOIN rfqs r ON q.rfq_id = r.id
       LEFT JOIN products p ON r.product_id = p.id
       WHERE q.id = $1 AND q.customer_id = $2`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Quotation not found" });

    const quotation = result.rows[0];
    quotation.items = (await query("SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order", [quotation.id])).rows;
    quotation.events = (await query("SELECT * FROM quotation_events WHERE quotation_id = $1 ORDER BY created_at", [quotation.id])).rows;

    res.json({ quotation });
  } catch (err) {
    console.error("Get customer quotation error:", err);
    res.status(500).json({ error: "Failed to fetch quotation" });
  }
});

// Mark quotation as viewed
router.post("/customer/quotations/:id/viewed", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await transaction(async (client) => {
      const lock = await client.query(
        "SELECT * FROM quotations WHERE id = $1 AND customer_id = $2 FOR UPDATE",
        [req.params.id, req.userId]
      );
      if (lock.rows.length === 0) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });

      const quotation = lock.rows[0];
      if (quotation.status !== "sent") {
        throw Object.assign(new Error(`Cannot view quotation with status "${quotation.status}"`), { statusCode: 400 });
      }

      const updateResult = await client.query(
        `UPDATE quotations SET status = 'viewed', viewed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'sent'`,
        [quotation.id]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Quotation status changed unexpectedly"), { statusCode: 409 });
      }

      const updated = (await client.query("SELECT * FROM quotations WHERE id = $1", [quotation.id])).rows[0];
      return { updated, quotation };
    });

    await logQuotationEvent(result.quotation.id, req.userId, "quotation.viewed", "Customer viewed quotation");
    res.json({ quotation: result.updated });
  } catch (err: any) {
    console.error("View quotation error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to mark as viewed" });
  }
});

// Accept quotation
router.post("/customer/quotations/:id/accept", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await transaction(async (client) => {
      const lock = await client.query(
        "SELECT * FROM quotations WHERE id = $1 AND customer_id = $2 FOR UPDATE",
        [req.params.id, req.userId]
      );
      if (lock.rows.length === 0) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });

      const quotation = lock.rows[0];
      if (!["sent", "viewed"].includes(quotation.status)) {
        throw Object.assign(new Error(`Cannot accept quotation with status "${quotation.status}"`), { statusCode: 400 });
      }

      // Check if expired
      if (quotation.valid_until) {
        const validDate = new Date(quotation.valid_until);
        if (validDate < new Date()) {
          throw Object.assign(new Error("Quotation has expired"), { statusCode: 400 });
        }
      }

      const updateResult = await client.query(
        `UPDATE quotations SET status = 'accepted', accepted_at = NOW(), updated_at = NOW() WHERE id = $1 AND status IN ('sent', 'viewed')`,
        [quotation.id]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Quotation status changed unexpectedly"), { statusCode: 409 });
      }

      await client.query("UPDATE rfqs SET status = 'accepted', updated_at = NOW() WHERE id = $1", [quotation.rfq_id]);

      const updated = (await client.query("SELECT * FROM quotations WHERE id = $1", [quotation.id])).rows[0];
      return { updated, quotation };
    });

    await logQuotationEvent(result.quotation.id, req.userId, "quotation.accepted", "Customer accepted quotation");

    const custAccept = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [req.userId]);
    const custData = custAccept.rows.length > 0 ? custAccept.rows[0] : null;

    if (custData) {
      notifyAndLog({
        recipientEmail: custData.email,
        recipientName: `${custData.first_name} ${custData.last_name}`,
        subject: "Quotation Accepted",
        body: `Your quotation #${result.quotation.quotation_number} has been accepted.`,
        eventType: "quotation.accepted",
        entityType: "quotation",
        entityId: result.quotation.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    // Notify the quotation creator (admin/sales) that the customer accepted
    const creatorResult = await query(
      "SELECT email, first_name, last_name FROM users WHERE id = $1",
      [result.quotation.created_by]
    );
    if (creatorResult.rows.length > 0 && creatorResult.rows[0].email !== custData?.email) {
      const creator = creatorResult.rows[0];
      sendEmail({
        to: creator.email,
        subject: `Quotation #${result.quotation.quotation_number} Accepted by Customer`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #061633 0%, #1848CC 100%); padding: 24px; text-align: center;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 20px;">Quotation Accepted</h1>
            </div>
            <div style="padding: 32px; background: #FFFFFF;">
              <p style="color: #111827; font-size: 16px;">Hi ${creator.first_name} ${creator.last_name},</p>
              <p style="color: #374151; font-size: 14px; line-height: 1.6;">
                Quotation <strong>#${result.quotation.quotation_number}</strong> has been accepted by the customer.
              </p>
              <div style="background: #F0FFF4; border-left: 4px solid #16A34A; padding: 16px; margin: 24px 0;">
                <p style="color: #374151; font-size: 13px; line-height: 1.5; margin: 0;">
                  <strong>Customer:</strong> ${custData?.first_name || "Customer"} ${custData?.last_name || ""}<br/>
                  <strong>Email:</strong> ${custData?.email || ""}<br/>
                  <strong>Quotation:</strong> #${result.quotation.quotation_number}
                </p>
              </div>
              <p style="color: #374151; font-size: 14px;">
                Please proceed with order processing for this quotation.
              </p>
            </div>
            <div style="background: #F8FAFC; padding: 16px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="color: #64748B; font-size: 12px; margin: 0;">
                Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana
              </p>
            </div>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ quotation: result.updated });
  } catch (err: any) {
    console.error("Accept quotation error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to accept quotation" });
  }
});

// Reject quotation
router.post("/customer/quotations/:id/reject", authenticate, validate(z.object({
  reason: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const result = await transaction(async (client) => {
      const lock = await client.query(
        "SELECT * FROM quotations WHERE id = $1 AND customer_id = $2 FOR UPDATE",
        [req.params.id, req.userId]
      );
      if (lock.rows.length === 0) throw Object.assign(new Error("Quotation not found"), { statusCode: 404 });

      const quotation = lock.rows[0];
      if (!["sent", "viewed"].includes(quotation.status)) {
        throw Object.assign(new Error(`Cannot reject quotation with status "${quotation.status}"`), { statusCode: 400 });
      }

      const { reason } = req.body;

      const updateResult = await client.query(
        `UPDATE quotations SET status = 'rejected', rejected_at = NOW(), rejection_reason = $1, updated_at = NOW() WHERE id = $2 AND status IN ('sent', 'viewed')`,
        [reason || null, quotation.id]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Quotation status changed unexpectedly"), { statusCode: 409 });
      }

      await client.query("UPDATE rfqs SET status = 'rejected', updated_at = NOW() WHERE id = $1", [quotation.rfq_id]);

      const updated = (await client.query("SELECT * FROM quotations WHERE id = $1", [quotation.id])).rows[0];
      return { updated, quotation };
    });

    await logQuotationEvent(result.quotation.id, req.userId, "quotation.rejected", result.quotation.rejection_reason
      ? `Rejected: ${result.quotation.rejection_reason}`
      : "Customer rejected quotation");

    const custReject = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [req.userId]);
    const rejectCustData = custReject.rows.length > 0 ? custReject.rows[0] : null;

    if (rejectCustData) {
      notifyAndLog({
        recipientEmail: rejectCustData.email,
        recipientName: `${rejectCustData.first_name} ${rejectCustData.last_name}`,
        subject: "Quotation Rejected",
        body: `Your quotation #${result.quotation.quotation_number} has been rejected.`,
        eventType: "quotation.rejected",
        entityType: "quotation",
        entityId: result.quotation.id,
        performedBy: req.userId!,
      }).catch(() => {});
    }

    // Notify the quotation creator (admin/sales) that the customer rejected
    const creatorRejectResult = await query(
      "SELECT email, first_name, last_name FROM users WHERE id = $1",
      [result.quotation.created_by]
    );
    if (creatorRejectResult.rows.length > 0 && creatorRejectResult.rows[0].email !== rejectCustData?.email) {
      const creator = creatorRejectResult.rows[0];
      sendEmail({
        to: creator.email,
        subject: `Quotation #${result.quotation.quotation_number} Rejected by Customer`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #061633 0%, #1848CC 100%); padding: 24px; text-align: center;">
              <h1 style="color: #FFFFFF; margin: 0; font-size: 20px;">Quotation Rejected</h1>
            </div>
            <div style="padding: 32px; background: #FFFFFF;">
              <p style="color: #111827; font-size: 16px;">Hi ${creator.first_name} ${creator.last_name},</p>
              <p style="color: #374151; font-size: 14px; line-height: 1.6;">
                Quotation <strong>#${result.quotation.quotation_number}</strong> was rejected by the customer.
              </p>
              <div style="background: #FFF5F5; border-left: 4px solid #DC2626; padding: 16px; margin: 24px 0;">
                <p style="color: #374151; font-size: 13px; line-height: 1.5; margin: 0;">
                  <strong>Customer:</strong> ${rejectCustData?.first_name || "Customer"} ${rejectCustData?.last_name || ""}<br/>
                  <strong>Email:</strong> ${rejectCustData?.email || ""}<br/>
                  ${result.quotation.rejection_reason ? `<strong>Reason:</strong> ${result.quotation.rejection_reason}` : ""}
                </p>
              </div>
              <p style="color: #374151; font-size: 14px;">
                You may want to follow up with the customer or create a revised quotation.
              </p>
            </div>
            <div style="background: #F8FAFC; padding: 16px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="color: #64748B; font-size: 12px; margin: 0;">
                Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana
              </p>
            </div>
          </div>
        `,
      }).catch(() => {});
    }

    res.json({ quotation: result.updated });
  } catch (err: any) {
    console.error("Reject quotation error:", err);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: "Failed to reject quotation" });
  }
});

// Check and expire overdue quotations (utility, can be called by cron or admin)
router.post("/admin/quotations/expire-overdue", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE quotations SET status = 'expired', expired_at = NOW(), updated_at = NOW()
       WHERE status IN ('sent', 'viewed') AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
       RETURNING *`
    );

    for (const q of result.rows) {
      await logQuotationEvent(q.id, undefined, "quotation.expired", "Quotation expired");
      const custExp = await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [q.customer_id]);
      if (custExp.rows.length > 0) {
        const c = custExp.rows[0];
        notifyAndLog({
          recipientEmail: c.email,
          recipientName: `${c.first_name} ${c.last_name}`,
          subject: "Quotation Expired",
          body: `Your quotation #${q.quotation_number} has expired.`,
          eventType: "quotation.expired",
          entityType: "quotation",
          entityId: q.id,
          performedBy: "system",
        }).catch(() => {});
      }
    }

    res.json({ expired: result.rows.length });
  } catch (err) {
    console.error("Expire overdue error:", err);
    res.status(500).json({ error: "Failed to expire quotations" });
  }
});

export default router;
