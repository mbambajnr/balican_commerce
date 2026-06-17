import { Router, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { emitCriticalAlert } from "../services/alerts";
import { query, transaction } from "../config/db";
import { authenticate, requireAdmin, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { config } from "../config";
import { notifyAndLog } from "../services/notifications";
import { sendEmail } from "../services/email";
import { generateInvoicePdf, InvoicePdfData, InvoicePdfItem } from "../services/pdf";
import { accrueCommissionForCompletedOrder, alertCommissionAccrualFailure } from "../services/commissions";

const FRONTEND_URL = config.frontendUrl;

const router = Router();

function genOrderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

function genInvoiceNumber() {
  return `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

async function logActivity(entityType: string, entityId: string, type: string, description: string, metadata: Record<string, any> = {}, userId?: string) {
  await query(
    `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, type, description, JSON.stringify(metadata), userId || null]
  );
}

async function createInvoice(order: any, client?: any) {
  const q = client ? client.query.bind(client) : query;
  const invoiceNumber = genInvoiceNumber();
  const total = parseFloat(order.total);
  const subtotal = parseFloat(order.subtotal || "0");
  const tax = parseFloat(order.tax || "0");
  const amountPaid = parseFloat(order.amount_paid || "0");
  const outstanding = Math.max(0, total - amountPaid);

  const status = outstanding <= 0 ? "paid" : amountPaid > 0 ? "partially_paid" : "issued";

  const result = await q(
    `INSERT INTO invoices (order_id, invoice_number, status, subtotal, tax, total, amount_paid, outstanding_amount,
      due_date, payment_terms, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [order.id, invoiceNumber, status, subtotal, tax, total, amountPaid, outstanding,
     order.payment_due_date || null, order.payment_terms || null, order.notes || null]
  );

  await q(
    `INSERT INTO activities (entity_type, entity_id, type, description, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    ["order", order.id, "invoice.issued", `Invoice ${invoiceNumber} issued`,
     JSON.stringify({ invoiceNumber, total, status, amountPaid })]
  );

  return result.rows[0];
}

async function updateInvoiceFromOrder(orderId: string, client?: any) {
  const q = client ? client.query.bind(client) : query;
  const order = (await q("SELECT * FROM orders WHERE id = $1", [orderId])).rows[0];
  if (!order) return;

  const total = parseFloat(order.total);
  const amountPaid = parseFloat(order.amount_paid || "0");
  const outstanding = Math.max(0, total - amountPaid);

  const invoiceStatus = outstanding <= 0 ? "paid" : amountPaid > 0 ? "partially_paid"
    : order.payment_status === "overdue" ? "overdue" : "pending_payment";

  const inv = await q(
    `UPDATE invoices SET amount_paid = $1, outstanding_amount = $2, status = $3, updated_at = NOW()
     WHERE order_id = $4 RETURNING *`,
    [amountPaid, outstanding, invoiceStatus, orderId]
  );

  if (inv.rows.length > 0) {
    if (invoiceStatus === "paid") {
      await q(`UPDATE invoices SET paid_at = NOW() WHERE id = $1`, [inv.rows[0].id]);
      if (!client) {
        await logActivity("order", orderId, "invoice.paid", `Invoice ${inv.rows[0].invoice_number} paid in full`);
      }
    } else if (invoiceStatus === "partially_paid") {
      if (!client) {
        await logActivity("order", orderId, "invoice.partially_paid",
          `Invoice ${inv.rows[0].invoice_number} partially paid (GH₵${amountPaid.toLocaleString()} of GH₵${total.toLocaleString()})`);
      }
    } else if (invoiceStatus === "overdue") {
      if (!client) {
        await logActivity("order", orderId, "invoice.overdue", `Invoice ${inv.rows[0].invoice_number} overdue`);
      }
    }
  }
}

/* ── Create direct order (checkout) ── */

const createOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    price: z.number(),
    quantity: z.number().int().positive(),
  })).min(1),
  subtotal: z.number().min(0),
  tax: z.number().min(0),
  total: z.number().positive(),
  paymentMethod: z.enum(["paystack", "bank_transfer", "credit"]),
  poNumber: z.string().optional().nullable(),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional().nullable(),
  orderType: z.enum(["sales", "service", "mixed"]).optional(),
  utm_source: z.string().max(100).optional().nullable(),
  utm_campaign: z.string().max(200).optional().nullable(),
  utm_medium: z.string().max(100).optional().nullable(),
  order_source: z.string().max(50).optional().nullable(),
});

router.post("/", authenticate, requireCompanyActive, validate(createOrderSchema),   async (req: AuthRequest, res: Response) => {
  try {
    const { items, subtotal, tax, total, paymentMethod, poNumber, idempotencyKey, notes, orderType, utm_source, utm_campaign, utm_medium, order_source } = req.body;
    const orderNumber = genOrderNumber();
    const idemHash = idempotencyKey
      ? crypto.createHash("sha256").update(idempotencyKey).digest("hex").substring(0, 16)
      : null;

    // Validate products are active (outside transaction - read only)
    for (const item of items) {
      const prod = await query("SELECT id, is_active FROM products WHERE id = $1", [item.productId]);
      if (prod.rows.length === 0) return res.status(400).json({ error: `Product "${item.name}" not found` });
      if (!prod.rows[0].is_active) return res.status(400).json({ error: `Product "${item.name}" is not active` });
    }

    if (paymentMethod === "credit") {
      const user = await query(
        `SELECT is_credit_approved, credit_limit, outstanding_balance,
                payment_terms_days FROM users WHERE id = $1`,
        [req.userId]
      );
      if (user.rows.length === 0) return res.status(404).json({ error: "User not found" });
      const u = user.rows[0];
      if (!u.is_credit_approved) {
        return res.status(400).json({ error: "Credit not approved for this account. Contact admin to enable credit terms." });
      }
      const limit = parseFloat(u.credit_limit || "0");
      const outstanding = parseFloat(u.outstanding_balance || "0");
      if (limit > 0 && outstanding + total > limit) {
        return res.status(400).json({
          error: "Order exceeds available credit",
          availableCredit: Math.max(0, limit - outstanding),
          creditLimit: limit,
          outstandingBalance: outstanding,
          orderTotal: total,
        });
      }
    }

    const paymentStatus = "unpaid";
    const termDays = paymentMethod === "credit" ? 30 : 0;
    const dueDate = termDays > 0
      ? new Date(Date.now() + termDays * 86400000).toISOString().split("T")[0]
      : null;

    // Create order, update balance, create invoice in a transaction
    const result = await transaction(async (client) => {
      // Idempotency: check if this key was already used
      if (idemHash) {
        const existing = await client.query(
          `SELECT id FROM orders WHERE user_id = $1 AND notes LIKE $2 FOR UPDATE`,
          [req.userId, `[idem:${idemHash}]%`]
        );
        if (existing.rows.length > 0) {
          const ord = await client.query("SELECT * FROM orders WHERE id = $1", [existing.rows[0].id]);
          const inv = await client.query(
            "SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1",
            [existing.rows[0].id]
          );
          return { order: ord.rows[0], invoice: inv.rows[0] || null, duplicate: true };
        }
      }

      const orderNotes = idemHash
        ? (notes ? `[idem:${idemHash}] ${notes}` : `[idem:${idemHash}]`)
        : (notes || null);

      const effectiveOrderType = orderType || "sales";
      const ordResult = await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total,
          payment_method, payment_status, amount_paid, outstanding_amount,
          payment_terms, payment_due_date, po_number, notes, status, order_type,
          utm_source, utm_campaign, utm_medium, order_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, 'pending', $14,
           $15, $16, $17, $18)
         RETURNING *`,
        [req.userId, orderNumber, JSON.stringify(items), subtotal, tax, total,
         paymentMethod, paymentStatus, total,
         paymentMethod === "credit" ? `${termDays} days` : null, dueDate,
         poNumber || null, orderNotes, effectiveOrderType,
         utm_source || null, utm_campaign || null, utm_medium || null, order_source || null]
      );
      const order = ordResult.rows[0];

      // Credit: increase customer outstanding
      if (paymentMethod === "credit") {
        await client.query(
          `UPDATE users SET outstanding_balance = outstanding_balance + $1, updated_at = NOW() WHERE id = $2`,
          [total, req.userId]
        );
      }

      // Create invoice
      const invNum = genInvoiceNumber();
      const invStatus = paymentMethod === "paystack" ? "pending_payment"
        : paymentMethod === "bank_transfer" ? "pending_payment"
        : "issued";

      const invResult = await client.query(
        `INSERT INTO invoices (order_id, invoice_number, status, subtotal, tax, total,
          amount_paid, outstanding_amount, due_date, payment_terms, notes)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10) RETURNING *`,
         [order.id, invNum, invStatus, subtotal, tax, total, total,
          dueDate, paymentMethod === "credit" ? `${termDays} days` : null, orderNotes]
      );

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", order.id, "order.created",
         `Order ${orderNumber} created (GH₵${total.toLocaleString()}, ${paymentMethod})`,
         JSON.stringify({ orderNumber, total, paymentMethod }), req.userId]
      );

      return { order, invoice: invResult.rows[0], duplicate: false };
    });

    if (!result.duplicate) {
      const userRows = await query("SELECT first_name, last_name, email FROM users WHERE id = $1", [req.userId]);
      if (userRows.rows.length > 0) {
        const customerEmail = userRows.rows[0].email;
        const customerName = `${userRows.rows[0].first_name} ${userRows.rows[0].last_name}`;
        await notifyAndLog({
          recipientEmail: customerEmail,
          recipientName: customerName,
          subject: "Order Created",
          body: `Your order #${result.order.order_number} has been created successfully.`,
          eventType: "order.created",
          entityType: "order",
          entityId: result.order.id,
          performedBy: req.userId!,
        }).catch(() => {});

        // Send invoice email with PDF
        try {
          const orderItems: any[] = typeof result.order.items === "string"
            ? JSON.parse(result.order.items)
            : result.order.items || [];
          const pdfItems: InvoicePdfItem[] = orderItems.map((i: any) => ({
            description: i.name || i.description,
            sku: "",
            quantity: i.quantity || 1,
            unitPrice: parseFloat(i.price || "0"),
            lineTotal: parseFloat(i.price || "0") * (i.quantity || 1),
            productUrl: i.productId ? `${FRONTEND_URL}/products/${i.productId}` : undefined,
          }));

          const invPdfData: InvoicePdfData = {
            invoiceNumber: result.invoice.invoice_number,
            createdAt: result.invoice.created_at,
            orderNumber: result.order.order_number,
            quotationNumber: "—",
            clientName: customerName,
            clientEmail: customerEmail,
            clientPhone: "",
            clientAddress: "",
            items: pdfItems,
            subtotal: parseFloat(result.order.subtotal || "0"),
            tax: parseFloat(result.order.tax || "0"),
            total: parseFloat(result.order.total || "0"),
            amountPaid: parseFloat(result.invoice.amount_paid || "0"),
            outstandingAmount: parseFloat(result.invoice.outstanding_amount || "0"),
            dueDate: result.invoice.due_date || "",
            paymentTerms: result.invoice.payment_terms || "",
            notes: result.invoice.notes || "",
            currency: "GH₵",
          };

          const invPdfBuffer = await generateInvoicePdf(invPdfData);

          const invEmailResult = await sendEmail({
            to: customerEmail,
            subject: `Invoice #${result.invoice.invoice_number} from Bali-Can Limited`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #1848CC;">Invoice #${result.invoice.invoice_number}</h2>
                <p>Dear ${userRows.rows[0].first_name || "Customer"},</p>
                <p>Please find attached invoice #${result.invoice.invoice_number} for order <strong>#${result.order.order_number}</strong>.</p>
                <p>Total: GH₵ ${parseFloat(result.order.total).toLocaleString()}</p>
                <p>Payment is due per the terms outlined in the invoice.</p>
                <hr style="border: none; border-top: 1px solid #D8E2FF;" />
                <p style="font-size: 12px; color: #64748B;">Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana</p>
              </div>
            `,
            attachments: [{ filename: `invoice-${result.invoice.invoice_number}.pdf`, content: invPdfBuffer }],
          });

          const invEmailId = invEmailResult.data?.id || null;

          // Log the invoice email
          await query(
            `INSERT INTO email_logs (recipient_email, recipient_name, subject, body, event_type, entity_type, entity_id,
              invoice_id, status, sent_by, provider_response, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [customerEmail, customerName,
             `Invoice #${result.invoice.invoice_number} Issued`,
             `Invoice for order #${result.order.order_number}`,
             "invoice.created", "invoice", result.invoice.id, result.invoice.id,
             invEmailResult.success ? "sent" : "failed", req.userId!,
             invEmailId ? JSON.stringify({ resendId: invEmailId }) : JSON.stringify({ error: invEmailResult.error })]
          );

          // Save pdf_url on invoice if sent successfully
          if (invEmailId) {
            await query(
              `UPDATE invoices SET pdf_url = $1 WHERE id = $2`,
              [`resend:${invEmailId}`, result.invoice.id]
            );
          }
        } catch (emailErr) {
          console.error("Failed to send invoice email for order:", result.order.order_number, emailErr);
        }
      }
    }

    res.status(201).json({ order: { ...result.order, invoice: result.invoice } });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order. Please try again." });
  }
});

/* ── Quotation → order conversion ── */

router.post("/from-quotation/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const items = (await query(
      "SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY sort_order",
      [req.params.id]
    )).rows;

    if (items.length === 0) return res.status(400).json({ error: "Quotation has no items" });

    const orderItems = items.map((i: any) => ({
      productId: i.product_id,
      name: i.description,
      price: parseFloat(i.unit_price),
      quantity: i.quantity,
    }));

    const orderNumber = genOrderNumber();

    const result = await transaction(async (client) => {
      const qResult = await client.query(
        `SELECT * FROM quotations WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      );
      if (qResult.rows.length === 0) throw new Error("NOT_FOUND");
      const quotation = qResult.rows[0];

      const userResult = await client.query(
        `SELECT id, email, first_name, last_name, phone FROM users WHERE id = $1`,
        [quotation.customer_id]
      );
      const customerUser = userResult.rows[0] || { id: quotation.customer_id, email: "", first_name: "", last_name: "", phone: "" };

      if (quotation.status !== "accepted") {
        throw new Error(`Cannot convert quotation with status "${quotation.status}". Only accepted quotations can be converted to orders.`);
      }

      const existingOrder = await client.query(
        `SELECT id FROM orders WHERE quotation_id = $1 LIMIT 1`,
        [quotation.id]
      );
      if (existingOrder.rows.length > 0) {
        throw new Error("Quotation has already been converted to an order. Each quotation can only be converted once.");
      }

      const subtotal = parseFloat(quotation.subtotal || "0");
      const tax = parseFloat(quotation.tax_amount || "0");
      const total = parseFloat(quotation.total_amount || "0");

      const ordResult = await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total,
          payment_method, payment_status, amount_paid, outstanding_amount,
          payment_terms, payment_due_date, quotation_id, rfq_id, status, order_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, 'pending', 'sales')
         RETURNING *`,
        [customerUser.id, orderNumber, JSON.stringify(orderItems), subtotal, tax, total,
         "credit", "unpaid", total,
         quotation.terms || null, quotation.valid_until || null,
         quotation.id, quotation.rfq_id]
      );
      const order = ordResult.rows[0];

      await client.query(
        `UPDATE quotations SET status = 'converted_to_order', updated_at = NOW() WHERE id = $1`,
        [quotation.id]
      );

      await client.query(
        `UPDATE rfqs SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
        [quotation.rfq_id]
      );

      await client.query(
        `UPDATE users SET outstanding_balance = outstanding_balance + $1, updated_at = NOW() WHERE id = $2`,
        [total, customerUser.id]
      );

      const invNum = genInvoiceNumber();
      const invResult = await client.query(
        `INSERT INTO invoices (order_id, invoice_number, status, subtotal, tax, total,
          amount_paid, outstanding_amount, due_date, payment_terms, notes)
         VALUES ($1, $2, 'issued', $3, $4, $5, 0, $6, $7, $8, $9) RETURNING *`,
        [order.id, invNum, subtotal, tax, total, total,
         quotation.valid_until || null, quotation.terms || null, quotation.notes_to_customer || null]
      );
      const invoice = invResult.rows[0];

      // Fetch quotation items with product slugs for invoice PDF
      const invoiceItems = await client.query(
        `SELECT qi.*, p.slug as product_slug
         FROM quotation_items qi
         LEFT JOIN products p ON qi.product_id = p.id
         WHERE qi.quotation_id = $1 ORDER BY qi.sort_order`,
        [quotation.id]
      );

      // Build invoice PDF
      const pdfItems: InvoicePdfItem[] = invoiceItems.rows.map((i: any) => ({
        description: i.description,
        sku: i.product_slug || "",
        quantity: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        lineTotal: parseFloat(i.line_total),
        productUrl: i.product_slug ? `${FRONTEND_URL}/products/${i.product_slug}` : undefined,
      }));

      const pdfData: InvoicePdfData = {
        invoiceNumber: invoice.invoice_number,
        createdAt: invoice.created_at,
        orderNumber: order.order_number,
        quotationNumber: quotation.quotation_number,
        clientName: `${customerUser.first_name} ${customerUser.last_name}`.trim() || "Customer",
        clientEmail: customerUser.email,
        clientPhone: customerUser.phone || "",
        clientAddress: "",
        items: pdfItems,
        subtotal,
        tax,
        total,
        amountPaid: 0,
        outstandingAmount: total,
        dueDate: quotation.valid_until || "",
        paymentTerms: quotation.terms || "",
        notes: quotation.notes_to_customer || "",
        currency: quotation.currency || "GH₵",
      };

      const pdfBuffer = await generateInvoicePdf(pdfData);

      // Send invoice email with PDF
      const emailResult = await sendEmail({
        to: customerUser.email,
        subject: `Invoice #${invoice.invoice_number} from Bali-Can Limited`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #1848CC;">Invoice #${invoice.invoice_number}</h2>
            <p>Dear ${customerUser.first_name || "Customer"},</p>
            <p>Please find attached invoice #${invoice.invoice_number} for order <strong>#${orderNumber}</strong>.</p>
            <p>Total: GH₵ ${total.toLocaleString()}</p>
            <p>Payment is due per the terms outlined in the invoice.</p>
            <hr style="border: none; border-top: 1px solid #D8E2FF;" />
            <p style="font-size: 12px; color: #64748B;">Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana</p>
          </div>
        `,
        attachments: [{ filename: `invoice-${invoice.invoice_number}.pdf`, content: pdfBuffer }],
      });

      const emailSent = emailResult.success;
      const emailId = emailResult.data?.id || null;

      // Save pdf_url on invoice
      if (emailId) {
        await client.query(
          `UPDATE invoices SET pdf_url = $1 WHERE id = $2`,
          [`resend:${emailId}`, invoice.id]
        );
      }

      // Log email
      await client.query(
        `INSERT INTO email_logs (recipient_email, recipient_name, subject, body, event_type, entity_type, entity_id,
          invoice_id, quotation_id, rfq_id, status, sent_by, provider_response, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [customerUser.email, `${customerUser.first_name} ${customerUser.last_name}`.trim(),
         `Invoice #${invoice.invoice_number} Issued`,
         `Invoice for order #${orderNumber} from quotation #${quotation.quotation_number}`,
         "invoice.created", "invoice", invoice.id, invoice.id, quotation.id, quotation.rfq_id,
         emailSent ? "sent" : "failed", req.userId!,
         emailId ? JSON.stringify({ resendId: emailId }) : JSON.stringify({ error: "Email sending failed" })]
      );

      await client.query(
        `INSERT INTO quotation_events (quotation_id, user_id, event_type, description, metadata)
         VALUES ($1, $2, 'quotation.converted_to_order', $3, $4)`,
        [quotation.id, req.userId, `Quotation converted to order ${orderNumber}`,
         JSON.stringify({ orderId: order.id, orderNumber, invoiceNumber: invoice.invoice_number })]
      );

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", order.id, "order.created",
         `Order ${orderNumber} created from quotation ${quotation.quotation_number}`,
         JSON.stringify({ quotationId: quotation.id, quotationNumber: quotation.quotation_number, orderNumber, total, invoiceNumber: invoice.invoice_number }),
         req.userId]
      );

      return { order, invoice, customerEmail: customerUser.email, customerName: `${customerUser.first_name} ${customerUser.last_name}`.trim() };
    });

    await notifyAndLog({
      recipientEmail: result.customerEmail,
      recipientName: result.customerName,
      subject: "Order Created from Quotation",
      body: `Your order #${result.order.order_number} has been created from quotation.`,
      eventType: "order.converted_from_quotation",
      entityType: "order",
      entityId: result.order.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.status(201).json({ order: { ...result.order, invoice: result.invoice } });
  } catch (err) {
    console.error("Convert quotation error:", err);
    const message = err instanceof Error ? err.message : "";
    if (message === "NOT_FOUND") {
      return res.status(404).json({ error: "Quotation not found" });
    }
    if (message.startsWith("Cannot convert quotation") || message.startsWith("Quotation has already been converted")) {
      return res.status(400).json({ error: message });
    }
    res.status(500).json({ error: "Failed to convert quotation to order" });
  }
});

/* ── Resend invoice PDF ── */

router.post("/admin/invoices/:id/send", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invResult = await query(
      `SELECT i.*, o.order_number, o.user_id,
              u.email, u.first_name, u.last_name
       FROM invoices i
       JOIN orders o ON i.order_id = o.id
       JOIN users u ON o.user_id = u.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (invResult.rows.length === 0) return res.status(404).json({ error: "Invoice not found" });

    const invoice = invResult.rows[0];

    if (invoice.status === "draft") {
      return res.status(400).json({ error: "Cannot send a draft invoice" });
    }

    // Fetch order items for the PDF
    const orderResult = await query("SELECT * FROM orders WHERE id = $1", [invoice.order_id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderResult.rows[0];

    const orderItems: any[] = typeof order.items === "string" ? JSON.parse(order.items) : order.items || [];
    const pdfItems: InvoicePdfItem[] = orderItems.map((i: any) => ({
      description: i.name || i.description,
      sku: "",
      quantity: i.quantity || 1,
      unitPrice: parseFloat(i.price || "0"),
      lineTotal: parseFloat(i.price || "0") * (i.quantity || 1),
      productUrl: i.productId ? `${FRONTEND_URL}/products/${i.productId}` : undefined,
    }));

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoice_number,
      createdAt: invoice.created_at,
      orderNumber: order.order_number,
      quotationNumber: order.quotation_id ? order.quotation_id.substring(0, 8) : "—",
      clientName: `${invoice.first_name} ${invoice.last_name}`.trim() || "Customer",
      clientEmail: invoice.email,
      clientPhone: "",
      clientAddress: "",
      items: pdfItems,
      subtotal: parseFloat(invoice.subtotal || "0"),
      tax: parseFloat(invoice.tax || "0"),
      total: parseFloat(invoice.total || "0"),
      amountPaid: parseFloat(invoice.amount_paid || "0"),
      outstandingAmount: parseFloat(invoice.outstanding_amount || "0"),
      dueDate: invoice.due_date || "",
      paymentTerms: invoice.payment_terms || "",
      notes: invoice.notes || "",
      currency: "GH₵",
    };

    const pdfBuffer = await generateInvoicePdf(pdfData);

    const emailResult = await sendEmail({
      to: invoice.email,
      subject: `Invoice #${invoice.invoice_number} from Bali-Can Limited`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1848CC;">Invoice #${invoice.invoice_number}</h2>
          <p>Dear ${invoice.first_name || "Customer"},</p>
          <p>Please find attached invoice #${invoice.invoice_number} for order <strong>#${order.order_number}</strong>.</p>
          <hr style="border: none; border-top: 1px solid #D8E2FF;" />
          <p style="font-size: 12px; color: #64748B;">Bali-Can Limited — Industrial Supply &amp; Services, Accra, Ghana</p>
        </div>
      `,
      attachments: [{ filename: `invoice-${invoice.invoice_number}.pdf`, content: pdfBuffer }],
    });

    const emailId = emailResult.data?.id || null;

    // Log the resend
    await query(
      `INSERT INTO email_logs (recipient_email, recipient_name, subject, body, event_type, entity_type, entity_id,
        invoice_id, quotation_id, status, sent_by, provider_response, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
      [invoice.email, `${invoice.first_name} ${invoice.last_name}`.trim(),
       `Invoice #${invoice.invoice_number} Resent`,
       `Invoice resent for order #${order.order_number}`,
       "invoice.sent", "invoice", invoice.id, invoice.id, order.quotation_id,
       emailResult.success ? "sent" : "failed", req.userId!,
       emailId ? JSON.stringify({ resendId: emailId }) : JSON.stringify({ error: emailResult.error })]
    );

    if (!emailResult.success) {
      return res.status(502).json({ error: `Failed to send invoice email: ${emailResult.error}` });
    }

    res.json({ message: "Invoice sent successfully", invoice: { id: invoice.id, invoice_number: invoice.invoice_number } });
  } catch (err) {
    console.error("Send invoice error:", err);
    res.status(500).json({ error: "Failed to send invoice" });
  }
});

// Preview invoice PDF
router.get("/admin/invoices/:id/preview", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const invResult = await query(
      `SELECT i.*, o.order_number, o.user_id,
              u.email, u.first_name, u.last_name
       FROM invoices i
       JOIN orders o ON i.order_id = o.id
       JOIN users u ON o.user_id = u.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (invResult.rows.length === 0) return res.status(404).json({ error: "Invoice not found" });
    const invoice = invResult.rows[0];

    const orderResult = await query("SELECT * FROM orders WHERE id = $1", [invoice.order_id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderResult.rows[0];

    const orderItems: any[] = typeof order.items === "string" ? JSON.parse(order.items) : order.items || [];
    const pdfItems: InvoicePdfItem[] = orderItems.map((i: any) => ({
      description: i.name || i.description,
      sku: "",
      quantity: i.quantity || 1,
      unitPrice: parseFloat(i.price || "0"),
      lineTotal: parseFloat(i.price || "0") * (i.quantity || 1),
      productUrl: i.productId ? `${FRONTEND_URL}/products/${i.productId}` : undefined,
    }));

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoice_number,
      createdAt: invoice.created_at,
      orderNumber: order.order_number,
      quotationNumber: order.quotation_id ? order.quotation_id.substring(0, 8) : "—",
      clientName: `${invoice.first_name} ${invoice.last_name}`.trim() || "Customer",
      clientEmail: invoice.email,
      clientPhone: "",
      clientAddress: "",
      items: pdfItems,
      subtotal: parseFloat(invoice.subtotal || "0"),
      tax: parseFloat(invoice.tax || "0"),
      total: parseFloat(invoice.total || "0"),
      amountPaid: parseFloat(invoice.amount_paid || "0"),
      outstandingAmount: parseFloat(invoice.outstanding_amount || "0"),
      dueDate: invoice.due_date || "",
      paymentTerms: invoice.payment_terms || "",
      notes: invoice.notes || "",
      currency: "GH₵",
    };

    const pdfBuffer = await generateInvoicePdf(pdfData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Preview invoice error:", err);
    res.status(500).json({ error: "Failed to generate PDF preview" });
  }
});

/* ── List orders (customer + admin) ── */

router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    const { status, paymentStatus, paymentMethod, orderType, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [];

    if (!isAdmin) {
      conds.push(`o.user_id = $${params.length + 1}`);
      params.push(req.userId);
    }
    if (status) { conds.push(`o.status = $${params.length + 1}`); params.push(status); }
    if (paymentStatus) { conds.push(`o.payment_status = $${params.length + 1}`); params.push(paymentStatus); }
    if (paymentMethod) { conds.push(`o.payment_method = $${params.length + 1}`); params.push(paymentMethod); }
    if (orderType) { conds.push(`o.order_type = $${params.length + 1}`); params.push(orderType); }

    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*) FROM orders o ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT o.*, u.first_name, u.last_name, u.email, u.company_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    res.json({
      orders: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

/* ── Single order ── */

router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";
    const result = await query(
      `SELECT o.*, u.first_name, u.last_name, u.email, u.phone, u.company_name,
              u.credit_limit, u.outstanding_balance
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.id = $1 AND (o.user_id = $2 OR $3)`,
      [req.params.id, req.userId, isAdmin]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const order = result.rows[0];

    order.invoices = (await query(
      "SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC", [order.id]
    )).rows;

    order.payments = (await query(
      "SELECT * FROM order_payments WHERE order_id = $1 ORDER BY paid_at DESC", [order.id]
    )).rows;

    order.bankTransfers = (await query(
      "SELECT * FROM bank_transfers WHERE order_id = $1 ORDER BY created_at DESC", [order.id]
    )).rows;

    if (order.linked_sales_order_id) {
      const linked = await query(
        "SELECT id, order_number, total, payment_status, status FROM orders WHERE id = $1",
        [order.linked_sales_order_id]
      );
      order.linkedSalesOrder = linked.rows[0] || null;
    }

    if (order.booking_id) {
      const booking = await query(
        "SELECT id, status, preferred_date, location, service_type, contact_name, contact_phone FROM service_bookings WHERE id = $1",
        [order.booking_id]
      );
      order.serviceBooking = booking.rows[0] || null;
    }

    res.json({ order });
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

/* ── Paystack initialization ── */

router.post("/:id/paystack-init", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const orderResult = await query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderResult.rows[0];

    if (order.payment_method === "credit") {
      return res.status(400).json({ error: "Credit orders use invoice payments, not Paystack" });
    }

    const paystackPayload = {
      email: req.body.email,
      amount: Math.round(Number(order.total) * 100),
      currency: config.paystack.currency,
      reference: `SS-${order.order_number}-${Date.now()}`,
      callback_url: `${config.frontendUrl}/orders/${order.id}/confirm`,
      metadata: { order_id: order.id, order_number: order.order_number },
    };

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await paystackRes.json() as { status: boolean; message?: string; data?: { authorization_url: string } };

    if (!paystackData.status) {
      return res.status(400).json({ error: paystackData.message || "Paystack initialization failed" });
    }

    await query("UPDATE orders SET paystack_reference = $1 WHERE id = $2", [
      paystackPayload.reference, order.id,
    ]);

    res.json({ authorizationUrl: paystackData.data?.authorization_url || "", reference: paystackPayload.reference });
  } catch (err) {
    console.error("Paystack init error:", err);
    res.status(500).json({ error: "Failed to initialize payment" });
  }
});

/* ── Paystack webhook ── */

router.post("/paystack-webhook", async (req, res: Response) => {
  try {
    // Resolve the signing key (allow env override so tests can inject per-test keys)
    const signingKey = process.env.PAYSTACK_WEBHOOK_SECRET
      || process.env.PAYSTACK_SECRET_KEY
      || config.paystack.webhookSecret
      || config.paystack.secretKey;

    // Fail closed in production — never skip verification
    // Use process.env directly (not config.nodeEnv) so tests can toggle it
    if (!signingKey && process.env.NODE_ENV === "production") {
      console.error("Webhook rejected: PAYSTACK_SECRET_KEY is not configured in production");
      return res.status(500).json({ error: "Webhook not configured" });
    }

    if (signingKey) {
      const signature = req.headers["x-paystack-signature"] as string;
      if (!signature) {
        return res.status(401).json({ error: "Missing Paystack signature" });
      }

      // Verify signature against the raw request body (byte-exact)
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const hash = crypto
        .createHmac("sha512", signingKey)
        .update(rawBody)
        .digest("hex");

      if (hash !== signature) {
        return res.status(401).json({ error: "Invalid Paystack signature" });
      }
    }

    const event = req.body;
    if (event && event.event === "charge.success") {
      const reference = event.data?.reference;
      const paystackAmount = event.data?.amount;
      const paystackCurrency = event.data?.currency;

      if (typeof reference !== "string" || reference.length === 0) {
        console.error("Paystack webhook rejected: missing transaction reference");
        return res.sendStatus(200);
      }

      await transaction(async (client) => {
        const existingPayment = await client.query(
          `SELECT id FROM order_payments WHERE reference = $1 AND method = 'paystack' FOR UPDATE`,
          [reference]
        );
        if (existingPayment.rows.length > 0) {
          return;
        }

        const verificationPayment = await client.query(
          `SELECT vfp.*, c.name as company_name, u.email, u.first_name, u.last_name
           FROM verification_fee_payments vfp
           JOIN companies c ON c.id = vfp.company_id
           JOIN users u ON u.id = vfp.user_id
           WHERE vfp.paystack_reference = $1
           FOR UPDATE OF vfp`,
          [reference]
        );
        if (verificationPayment.rows.length > 0) {
          const payment = verificationPayment.rows[0];
          if (payment.status === "paid") return;

          const expectedPesewas = Math.round(Number(payment.amount) * 100);
          const amountMatches = Number.isInteger(paystackAmount) && paystackAmount === expectedPesewas;
          const currencyMatches = paystackCurrency === payment.currency && paystackCurrency === config.paystack.currency;

          if (!amountMatches || !currencyMatches) {
            emitCriticalAlert("payment.verification_fee_mismatch", {
              reference,
              companyId: payment.company_id,
              expectedAmount: expectedPesewas,
              receivedAmount: paystackAmount,
              expectedCurrency: payment.currency,
              receivedCurrency: paystackCurrency ?? null,
            }, 0);
            await client.query(
              `INSERT INTO activity_logs (company_id, user_id, action, description, metadata)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                payment.company_id,
                payment.user_id,
                "verification_fee_mismatch",
                "Balican Verified payment did not match expected amount or currency",
                JSON.stringify({
                  reference,
                  expectedAmount: expectedPesewas,
                  receivedAmount: paystackAmount ?? null,
                  expectedCurrency: payment.currency,
                  receivedCurrency: paystackCurrency ?? null,
                }),
              ]
            );
            return;
          }

          await client.query(
            `UPDATE verification_fee_payments
             SET status = 'paid', paid_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [payment.id]
          );
          await client.query(
            `INSERT INTO activity_logs (company_id, user_id, action, description, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              payment.company_id,
              payment.user_id,
              "verification_fee_paid",
              "Balican Verified fee paid",
              JSON.stringify({ reference, amount: Number(payment.amount), currency: payment.currency }),
            ]
          );

          await notifyAndLog({
            recipientEmail: payment.email,
            recipientName: [payment.first_name, payment.last_name].filter(Boolean).join(" "),
            subject: "Balican Verified Payment Received",
            body: `Your Balican Verified payment for ${payment.company_name} has been received. You can now submit your documents for review.`,
            eventType: "payment.verified",
            entityType: "payment",
            entityId: payment.id,
            performedBy: "system",
          }).catch(() => {});
          return;
        }

        const order = await client.query(
          "SELECT * FROM orders WHERE paystack_reference = $1 FOR UPDATE",
          [reference]
        );
        if (order.rows.length === 0) {
          return;
        }

        const ord = order.rows[0];
        const total = parseFloat(ord.total);

        const expectedKobo = Math.round(total * 100);
        const amountMatches = Number.isInteger(paystackAmount) && paystackAmount === expectedKobo;
        const currencyMatches = paystackCurrency === config.paystack.currency;
        if (!amountMatches || !currencyMatches) {
          emitCriticalAlert("payment.paystack_mismatch", {
            reference,
            orderId: ord.id,
            expectedAmount: expectedKobo,
            receivedAmount: paystackAmount,
            expectedCurrency: config.paystack.currency,
            receivedCurrency: paystackCurrency ?? null,
          }, 0);
          await client.query(
            `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              "order",
              ord.id,
              "payment.mismatch",
              "Paystack payment did not match the order amount or currency",
              JSON.stringify({
                reference,
                expectedAmount: expectedKobo,
                receivedAmount: paystackAmount ?? null,
                expectedCurrency: config.paystack.currency,
                receivedCurrency: paystackCurrency ?? null,
              }),
              ord.user_id,
            ]
          );
          return;
        }

        const newPaid = total;

        await client.query(
          `UPDATE orders SET payment_status = 'paid', amount_paid = $1, outstanding_amount = 0,
            status = 'paid', updated_at = NOW()
           WHERE id = $2`,
          [newPaid, ord.id]
        );


        // Record payment (recorded_by = order user since webhook has no admin context)
        const paymentResult = await client.query(
          `INSERT INTO order_payments (order_id, user_id, amount, method, reference, recorded_by)
           VALUES ($1, $2, $3, 'paystack', $4, $5) RETURNING id`,
          [ord.id, ord.user_id, total, reference, ord.user_id]
        );
        const paymentRecordId = paymentResult.rows[0].id;

        // Update invoice
        const invoiceResult = await client.query(
          `UPDATE invoices SET amount_paid = $1, outstanding_amount = 0, status = 'paid', paid_at = NOW(), updated_at = NOW()
           WHERE order_id = $2 RETURNING *`,
          [newPaid, ord.id]
        );

        await client.query(
          `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          ["order", ord.id, "payment.recorded",
           `Paystack payment of GH₵${total.toLocaleString()} received`,
           JSON.stringify({ method: "paystack", reference, amount: total }), ord.user_id]
        );

        if (invoiceResult.rows.length > 0) {
          await client.query(
            `INSERT INTO activities (entity_type, entity_id, type, description, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            ["order", ord.id, "invoice.paid",
             `Invoice ${invoiceResult.rows[0].invoice_number} paid via Paystack`,
             JSON.stringify({ invoiceNumber: invoiceResult.rows[0].invoice_number, reference })]
          );
        }

        // Notify customer of successful payment
        const userInfo = await client.query(
          "SELECT first_name, last_name, email FROM users WHERE id = $1",
          [ord.user_id]
        );
        if (userInfo.rows.length > 0) {
          const customerName = `${userInfo.rows[0].first_name} ${userInfo.rows[0].last_name}`;
          const customerEmail = userInfo.rows[0].email;
          await notifyAndLog({
            recipientEmail: customerEmail,
            recipientName: customerName,
            subject: "Payment Received",
            body: `Your payment for order ${ord.order_number} has been received and verified.`,
            eventType: "payment.verified",
            entityType: "payment",
            entityId: paymentRecordId,
            performedBy: "system",
          }).catch(() => {});
        }
      });
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

/* ═══════════════════════════════════════════
   ORDER LIFECYCLE — Buyer/Supplier transitions
═══════════════════════════════════════════ */

/**
 * Valid lifecycle transitions:
 *   pending → confirmed (supplier)
 *   confirmed → processing (supplier)
 *   processing → ready_or_shipped (supplier)
 *   ready_or_shipped → delivered (supplier)
 *   delivered → completed (buyer)
 *
 * Cancellation:
 *   pending → cancelled (buyer or supplier, reason required)
 *   confirmed → cancelled (supplier only, reason required)
 *   processing → cancelled (supplier only, reason required)
 */

const SUPPLIER_FORWARD_TRANSITIONS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "processing",
  processing: "ready_or_shipped",
  ready_or_shipped: "delivered",
};

const SUPPLIER_CANCEL_FROM = ["pending", "confirmed", "processing"];
const BUYER_CANCEL_FROM = ["pending"];

const lifecycleSchema = z.object({
  action: z.enum(["advance", "complete", "cancel"]),
  note: z.string().max(1000).optional(),
});

router.patch("/:id/lifecycle", authenticate, requireCompanyActive, validate(lifecycleSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { action, note } = req.body;

    // Get user info with company
    const userRow = await query(
      `SELECT u.id, u.company_id, u.account_status, c.is_provider, c.verification_status, c.status as company_status
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (!userRow.rows[0]?.company_id) {
      return res.status(403).json({ error: "No company associated with this account" });
    }
    const user = userRow.rows[0];

    // Load order
    const orderResult = await query(
      `SELECT o.*, sq.provider_company_id as supplier_company_id
       FROM orders o
       LEFT JOIN scout_quotes sq ON sq.order_id = o.id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = orderResult.rows[0];

    // Determine role
    const isBuyer = order.user_id === req.userId;
    const isSupplier = user.is_provider && order.supplier_company_id === user.company_id;
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

    if (!isBuyer && !isSupplier && !isAdmin) {
      return res.status(403).json({ error: "You are not authorized to update this order" });
    }

    const currentStatus = order.status;
    let newStatus: string | null = null;

    // Prevent changing final-state orders
    if (currentStatus === "completed") {
      return res.status(400).json({ error: "Completed orders cannot be changed" });
    }
    if (currentStatus === "cancelled") {
      return res.status(400).json({ error: "Cancelled orders cannot be changed" });
    }

    if (action === "advance") {
      // Only supplier (or admin) can advance
      if (!isSupplier && !isAdmin) {
        return res.status(403).json({ error: "Only the supplier can advance order status" });
      }
      newStatus = SUPPLIER_FORWARD_TRANSITIONS[currentStatus];
      if (!newStatus) {
        return res.status(400).json({
          error: `Cannot advance from status "${currentStatus}"`,
          currentStatus,
        });
      }
    } else if (action === "complete") {
      // Only buyer (or admin) can mark as completed
      if (!isBuyer && !isAdmin) {
        return res.status(403).json({ error: "Only the buyer can mark an order as completed" });
      }
      if (currentStatus !== "delivered") {
        return res.status(400).json({
          error: "Order must be in 'delivered' status to mark as completed",
          currentStatus,
        });
      }
      newStatus = "completed";
    } else if (action === "cancel") {
      if (!note?.trim()) {
        return res.status(400).json({ error: "Reason is required for cancellation" });
      }
      if (isSupplier || isAdmin) {
        if (!SUPPLIER_CANCEL_FROM.includes(currentStatus)) {
          return res.status(400).json({
            error: `Supplier cannot cancel an order in "${currentStatus}" status`,
            currentStatus,
          });
        }
      } else if (isBuyer) {
        if (!BUYER_CANCEL_FROM.includes(currentStatus)) {
          return res.status(400).json({
            error: `Buyer can only cancel orders that are still pending`,
            currentStatus,
          });
        }
      }
      newStatus = "cancelled";
    }

    if (!newStatus) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const role = isAdmin ? "admin" : isSupplier ? "supplier" : "buyer";

    await transaction(async (client) => {
      // Apply transition
      await client.query(
        "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2",
        [newStatus, order.id]
      );

      // Record in history
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, changed_by_company_id, role, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, currentStatus, newStatus, req.userId, user.company_id, role, note || null]
      );

      // Log activity
      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "order",
          order.id,
          `order.status.${newStatus}`,
          `Order ${order.order_number} moved from ${currentStatus} to ${newStatus}`,
          JSON.stringify({ from: currentStatus, to: newStatus, role, note: note || null }),
          req.userId,
        ]
      );

      if (newStatus === "completed") {
        try {
          await accrueCommissionForCompletedOrder(client, order.id);
        } catch (commissionErr) {
          alertCommissionAccrualFailure(order.id, commissionErr);
        }
      }
    });

    // Fetch updated order
    const updated = await query("SELECT * FROM orders WHERE id = $1", [order.id]);

    res.json({ order: updated.rows[0], transition: { from: currentStatus, to: newStatus } });
  } catch (err) {
    console.error("Order lifecycle error:", err);
    res.status(500).json({ error: "Failed to update order status" });
  }
});

/* GET /orders/:id/history — status timeline */
router.get("/:id/history", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "admin" || req.userRole === "super_admin";

    // Verify access
    const orderResult = await query(
      `SELECT o.id, o.user_id, sq.provider_company_id as supplier_company_id
       FROM orders o
       LEFT JOIN scout_quotes sq ON sq.order_id = o.id
       WHERE o.id = $1`,
      [req.params.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = orderResult.rows[0];

    // Check if user is buyer, supplier, or admin
    const userRow = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    const userCompanyId = userRow.rows[0]?.company_id;
    const isBuyer = order.user_id === req.userId;
    const isSupplier = userCompanyId && order.supplier_company_id === userCompanyId;

    if (!isBuyer && !isSupplier && !isAdmin) {
      return res.status(403).json({ error: "Not authorized to view this order's history" });
    }

    const history = await query(
      `SELECT h.*, u.first_name, u.last_name, c.name as company_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.changed_by_user_id
       LEFT JOIN companies c ON c.id = h.changed_by_company_id
       WHERE h.order_id = $1
       ORDER BY h.created_at ASC`,
      [req.params.id]
    );

    res.json({ history: history.rows });
  } catch (err) {
    console.error("Order history error:", err);
    res.status(500).json({ error: "Failed to fetch order history" });
  }
});

/* ── Admin: update order status ── */

const validServiceStatuses = ["requested", "scheduled", "assigned", "in_progress", "completed", "cancelled"] as const;

router.patch("/:id/status", authenticate, requireAdmin, validate(z.object({
  status: z.enum(["pending", "paid", "processing", "completed", "cancelled"]).optional(),
  serviceStatus: z.enum(validServiceStatuses).optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const order = await query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    if (order.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const ord = order.rows[0];

    if (req.body.serviceStatus && ord.order_type !== "sales") {
      const result = await query(
        "UPDATE orders SET service_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        [req.body.serviceStatus, req.params.id]
      );
      return res.json({ order: result.rows[0] });
    }

    if (req.body.status) {
      const result = await query(
        "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        [req.body.status, req.params.id]
      );
      return res.json({ order: result.rows[0] });
    }

    res.json({ order: ord });
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ error: "Failed to update order" });
  }
});

/* ── Admin: record payment against order ── */

router.post("/:id/payments", authenticate, requireAdmin, validate(z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
})), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, method, reference, notes } = req.body;
    const orderCheck = await query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    if (orderCheck.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const ord = orderCheck.rows[0];

    const prevPaid = parseFloat(ord.amount_paid || "0");
    const total = parseFloat(ord.total);
    const newPaid = prevPaid + amount;

    if (newPaid > total) {
      return res.status(400).json({
        error: "Payment exceeds order total",
        orderTotal: total,
        amountPaid: prevPaid,
        remainingDue: total - prevPaid,
      });
    }

    await transaction(async (client) => {
      const newOutstanding = Math.max(0, total - newPaid);
      const newPaymentStatus = newOutstanding <= 0 ? "paid" : "partially_paid";

      await client.query(
        `UPDATE orders SET payment_status = $1, amount_paid = $2, outstanding_amount = $3, updated_at = NOW() WHERE id = $4`,
        [newPaymentStatus, newPaid, newOutstanding, req.params.id]
      );

      await client.query(
        `INSERT INTO order_payments (order_id, user_id, amount, method, reference, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, ord.user_id, amount, method, reference || null, notes || null, req.userId]
      );

      await client.query(
        `UPDATE users SET outstanding_balance = GREATEST(0, outstanding_balance - $1), updated_at = NOW() WHERE id = $2`,
        [amount, ord.user_id]
      );

      // Update invoice
      const invoiceResult = await client.query(
        `UPDATE invoices SET amount_paid = $1, outstanding_amount = $2, status = $3, updated_at = NOW()
         WHERE order_id = $4 RETURNING *`,
        [newPaid, newOutstanding, newPaymentStatus === "paid" ? "paid" : "partially_paid", req.params.id]
      );

      if (invoiceResult.rows.length > 0 && newPaymentStatus === "paid") {
        await client.query(`UPDATE invoices SET paid_at = NOW() WHERE id = $1`, [invoiceResult.rows[0].id]);
      }

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", req.params.id, "payment.recorded",
         `Payment of GH₵${amount.toLocaleString()} recorded via ${method}`,
         JSON.stringify({ amount, method, reference }), req.userId]
      );
    });

    const updated = await query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    const ord2 = updated.rows[0];
    res.status(201).json({
      success: true,
      paymentStatus: ord2.payment_status,
      amountPaid: parseFloat(ord2.amount_paid),
      outstandingAmount: parseFloat(ord2.outstanding_amount),
    });
  } catch (err) {
    console.error("Record payment error:", err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

export default router;
