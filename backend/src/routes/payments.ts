import { Router, Response } from "express";
import { z } from "zod";
import { query, transaction } from "../config/db";
import { authenticate, requireAdmin, requireCompanyActive, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { notifyAndLog } from "../services/notifications";
import { trackFunnelEvent } from "../services/funnel-events";

const router = Router();

async function activityLog(entityType: string, entityId: string, type: string, description: string, metadata: Record<string, any> = {}, userId?: string) {
  return query(
    `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, type, description, JSON.stringify(metadata), userId || null]
  );
}

/* ── Credit / customer billing info ── */

const creditSettingsSchema = z.object({
  isCreditApproved: z.boolean().optional(),
  creditLimit: z.number().min(0).optional(),
  paymentTermsDays: z.number().min(1).max(365).optional(),
  taxId: z.string().optional().nullable(),
  businessRegistrationNumber: z.string().optional().nullable(),
  companyName: z.string().optional().nullable(),
  billingContactName: z.string().optional().nullable(),
  billingContactEmail: z.string().optional().nullable(),
  billingContactPhone: z.string().optional().nullable(),
});

// GET /admin/customers/:id/credit-summary
router.get("/admin/customers/:id/credit-summary", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT id, email, first_name, last_name, company_name, tax_id,
              business_registration_number, is_credit_approved, credit_limit,
              outstanding_balance, payment_terms_days,
              billing_contact_name, billing_contact_email, billing_contact_phone,
              credit_approved_by, credit_approved_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: "Customer not found" });

    const customer = user.rows[0];
    const limit = parseFloat(customer.credit_limit || "0");
    const outstanding = parseFloat(customer.outstanding_balance || "0");
    const availableCredit = Math.max(0, limit - outstanding);

    const orders = await query(
      `SELECT id, order_number, total, amount_paid, outstanding_amount,
              payment_status, payment_due_date, created_at
       FROM orders
       WHERE user_id = $1 AND payment_method = 'credit'
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );

    res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name,
        lastName: customer.last_name,
        companyName: customer.company_name,
        taxId: customer.tax_id,
        businessRegistrationNumber: customer.business_registration_number,
        isCreditApproved: customer.is_credit_approved,
        creditLimit: limit,
        outstandingBalance: outstanding,
        availableCredit,
        paymentTermsDays: customer.payment_terms_days,
        billingContactName: customer.billing_contact_name,
        billingContactEmail: customer.billing_contact_email,
        billingContactPhone: customer.billing_contact_phone,
        creditApprovedBy: customer.credit_approved_by,
        creditApprovedAt: customer.credit_approved_at,
      },
      creditOrders: orders.rows.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        total: parseFloat(o.total),
        amountPaid: parseFloat(o.amount_paid || "0"),
        outstandingAmount: parseFloat(o.outstanding_amount || o.total),
        paymentStatus: o.payment_status,
        paymentDueDate: o.payment_due_date,
        createdAt: o.created_at,
      })),
    });
  } catch (err) {
    console.error("Credit summary error:", err);
    res.status(500).json({ error: "Failed to fetch credit summary" });
  }
});

// PATCH /admin/customers/:id/credit-settings
router.patch("/admin/customers/:id/credit-settings", authenticate, requireAdmin, validate(creditSettingsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const { isCreditApproved, creditLimit, paymentTermsDays, taxId, businessRegistrationNumber,
            companyName, billingContactName, billingContactEmail, billingContactPhone } = req.body;

    if (isCreditApproved !== undefined) {
      fields.push(`is_credit_approved = $${idx++}`);
      values.push(isCreditApproved);
      if (isCreditApproved && req.userId) {
        fields.push(`credit_approved_by = $${idx++}`);
        values.push(req.userId);
        fields.push(`credit_approved_at = NOW()`);
      }
    }
    if (creditLimit !== undefined) { fields.push(`credit_limit = $${idx++}`); values.push(creditLimit); }
    if (paymentTermsDays !== undefined) { fields.push(`payment_terms_days = $${idx++}`); values.push(paymentTermsDays); }
    if (taxId !== undefined) { fields.push(`tax_id = $${idx++}`); values.push(taxId || null); }
    if (businessRegistrationNumber !== undefined) { fields.push(`business_registration_number = $${idx++}`); values.push(businessRegistrationNumber || null); }
    if (companyName !== undefined) { fields.push(`company_name = $${idx++}`); values.push(companyName || null); }
    if (billingContactName !== undefined) { fields.push(`billing_contact_name = $${idx++}`); values.push(billingContactName || null); }
    if (billingContactEmail !== undefined) { fields.push(`billing_contact_email = $${idx++}`); values.push(billingContactEmail || null); }
    if (billingContactPhone !== undefined) { fields.push(`billing_contact_phone = $${idx++}`); values.push(billingContactPhone || null); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Customer not found" });

    await activityLog("user", req.params.id, "credit_limit.updated", "Credit settings updated", { ...req.body }, req.userId);

    const u5 = (await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [req.params.id])).rows[0];
    const customerEmail5 = u5?.email || "";
    const customerName5 = [u5?.first_name, u5?.last_name].filter(Boolean).join(" ") || "";
    const newLimit = req.body.creditLimit ?? (await query("SELECT credit_limit FROM users WHERE id = $1", [req.params.id])).rows[0]?.credit_limit;
    await notifyAndLog({
      recipientEmail: customerEmail5,
      recipientName: customerName5,
      subject: "Credit Settings Updated",
      body: `Your credit limit has been updated to ${newLimit}.`,
      eventType: "customer.credit_updated",
      entityType: "user",
      entityId: req.params.id,
      performedBy: req.userId!,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error("Credit settings error:", err);
    res.status(500).json({ error: "Failed to update credit settings" });
  }
});

/* ── Bank transfers ── */

const bankTransferSchema = z.object({
  amount: z.number().positive(),
  bankName: z.string().optional().nullable(),
  accountName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  transferReference: z.string().min(1),
  proofUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// POST /orders/:id/bank-transfer - Customer submits bank transfer
router.post("/orders/:id/bank-transfer", authenticate, requireCompanyActive, async (req: AuthRequest, res: Response) => {
  try {
    const order = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (order.rows.length === 0) return res.status(404).json({ error: "Order not found" });

    const { amount, bankName, accountName, accountNumber, transferReference, proofUrl, notes } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid payment amount" });

    const result = await query(
      `INSERT INTO bank_transfers (order_id, user_id, amount, bank_name, account_name,
        account_number, transfer_reference, proof_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.id, req.userId, amount, bankName || null, accountName || null,
       accountNumber || null, transferReference, proofUrl || null, notes || null]
    );

    await activityLog("order", req.params.id, "bank_transfer.submitted",
      `Bank transfer of GH₵${amount.toLocaleString()} submitted`, { transferId: result.rows[0].id, transferReference }, req.userId);

    const u = (await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [req.userId])).rows[0];
    const userEmail = u?.email || "";
    const userName = [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "";
    const transferId = result.rows[0].id;
    const orderNumber = order.rows[0]?.order_number;
    await notifyAndLog({
      recipientEmail: userEmail,
      recipientName: userName,
      subject: "Bank Transfer Submitted",
      body: `Your bank transfer of ${amount} for order ${orderNumber || req.params.id} has been submitted for approval.`,
      eventType: "payment.bank_transfer_submitted",
      entityType: "payment",
      entityId: transferId,
      performedBy: req.userId!,
    }).catch(() => {});

    res.status(201).json({ bankTransfer: result.rows[0] });
  } catch (err) {
    console.error("Bank transfer submit error:", err);
    res.status(500).json({ error: "Failed to submit bank transfer" });
  }
});

// POST /admin/bank-transfers/:id/approve
router.post("/admin/bank-transfers/:id/approve", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // Read bank transfer (outside transaction - single read)
    const bt = await query("SELECT * FROM bank_transfers WHERE id = $1", [req.params.id]);
    if (bt.rows.length === 0) return res.status(404).json({ error: "Bank transfer not found" });
    const transfer = bt.rows[0];

    if (transfer.status !== "pending_verification") {
      return res.status(400).json({
        error: `Cannot approve bank transfer with status "${transfer.status}". Only pending transfers can be approved.`,
        currentStatus: transfer.status,
      });
    }

    const result = await transaction(async (client) => {
      // Re-check status within transaction with row lock
      const btCheck = await client.query(
        "SELECT * FROM bank_transfers WHERE id = $1 FOR UPDATE",
        [req.params.id]
      );
      if (btCheck.rows.length === 0) throw new Error("Bank transfer not found");
      if (btCheck.rows[0].status !== "pending_verification") {
        throw new Error(`Already ${btCheck.rows[0].status}`);
      }

      // Update bank transfer status
      await client.query(
        `UPDATE bank_transfers SET status = 'successful', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [req.userId, req.params.id]
      );

      // Update order payment tracking
      const order = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [transfer.order_id]);
      const ord = order.rows[0];
      const prevPaid = parseFloat(ord.amount_paid || "0");
      const newPaid = prevPaid + parseFloat(transfer.amount);
      const total = parseFloat(ord.total);
      const newOutstanding = Math.max(0, total - newPaid);
      const newPaymentStatus = newOutstanding <= 0 ? "paid" : "partially_paid";

      await client.query(
        `UPDATE orders SET payment_status = $1, amount_paid = $2, outstanding_amount = $3, updated_at = NOW() WHERE id = $4`,
        [newPaymentStatus, newPaid, newOutstanding, transfer.order_id]
      );

      // Record in order_payments
      await client.query(
        `INSERT INTO order_payments (order_id, user_id, amount, method, reference, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [transfer.order_id, transfer.user_id, transfer.amount, "bank_transfer", transfer.transfer_reference,
         "Bank transfer approved", req.userId]
      );

      // Reduce customer outstanding balance
      await client.query(
        `UPDATE users SET outstanding_balance = GREATEST(0, outstanding_balance - $1), updated_at = NOW() WHERE id = $2`,
        [transfer.amount, transfer.user_id]
      );

      // Update invoice
      const invoiceResult = await client.query(
        `UPDATE invoices SET amount_paid = $1, outstanding_amount = $2, status = $3, updated_at = NOW()
         WHERE order_id = $4 RETURNING *`,
        [newPaid, newOutstanding, newPaymentStatus === "paid" ? "paid" : "partially_paid", transfer.order_id]
      );

      if (invoiceResult.rows.length > 0 && newPaymentStatus === "paid") {
        await client.query(`UPDATE invoices SET paid_at = NOW() WHERE id = $1`, [invoiceResult.rows[0].id]);
      }

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", transfer.order_id, "bank_transfer.approved",
         `Bank transfer of GH₵${parseFloat(transfer.amount).toLocaleString()} approved`,
         JSON.stringify({ transferId: req.params.id, transferReference: transfer.transfer_reference }), req.userId]
      );

      return { paymentStatus: newPaymentStatus, amountPaid: newPaid, outstandingAmount: newOutstanding };
    });

    const cust1 = (await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [transfer.user_id])).rows[0];
    const customerEmail = cust1?.email || "";
    const customerName = [cust1?.first_name, cust1?.last_name].filter(Boolean).join(" ") || "";
    const o1 = (await query("SELECT order_number FROM orders WHERE id = $1", [transfer.order_id])).rows[0];
    const orderNumber1 = o1?.order_number || transfer.order_id;
    const amt1 = parseFloat(transfer.amount);
    await notifyAndLog({
      recipientEmail: customerEmail,
      recipientName: customerName,
      subject: "Bank Transfer Approved",
      body: `Your bank transfer of ${amt1} for order ${orderNumber1} has been approved.`,
      eventType: "payment.bank_transfer_approved",
      entityType: "payment",
      entityId: req.params.id,
      performedBy: req.userId!,
    }).catch(() => {});
    const approvedOrder = (await query("SELECT payment_method FROM orders WHERE id = $1", [transfer.order_id])).rows[0];
    if (approvedOrder?.payment_method === "credit") {
      void trackFunnelEvent({
        eventName: "repayment_received",
        eventKey: `repayment_received:bank_transfer:${req.params.id}`,
        userId: transfer.user_id,
        entityType: "order",
        entityId: transfer.order_id,
        metadata: { amount: Number(transfer.amount), method: "bank_transfer" },
      });
    }

    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message?.startsWith("Already ")) {
      return res.status(400).json({ error: `Bank transfer has already been ${err.message.replace("Already ", "").toLowerCase()}. Cannot approve twice.` });
    }
    console.error("Bank transfer approve error:", err);
    res.status(500).json({ error: "Failed to approve bank transfer" });
  }
});

// POST /admin/bank-transfers/:id/reject
router.post("/admin/bank-transfers/:id/reject", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;

    const transfer = await transaction(async (client) => {
      const btCheck = await client.query(
        "SELECT * FROM bank_transfers WHERE id = $1 FOR UPDATE",
        [req.params.id]
      );
      if (btCheck.rows.length === 0) throw new Error("Bank transfer not found");
      if (btCheck.rows[0].status !== "pending_verification") {
        throw new Error(`Already ${btCheck.rows[0].status}`);
      }

      const updateResult = await client.query(
        `UPDATE bank_transfers SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2, updated_at = NOW() WHERE id = $3 AND status = 'pending_verification'`,
        [req.userId, reason || null, req.params.id]
      );

      if (updateResult.rowCount === 0) throw new Error("Status changed");

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", btCheck.rows[0].order_id, "bank_transfer.rejected",
         reason ? `Bank transfer rejected: ${reason}` : "Bank transfer rejected",
         JSON.stringify({ transferId: req.params.id, transferReference: btCheck.rows[0].transfer_reference, reason }), req.userId]
      );

      return btCheck.rows[0];
    });

    const cust2 = (await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [transfer.user_id])).rows[0];
    const customerEmail2 = cust2?.email || "";
    const customerName2 = [cust2?.first_name, cust2?.last_name].filter(Boolean).join(" ") || "";
    const o2 = (await query("SELECT order_number FROM orders WHERE id = $1", [transfer.order_id])).rows[0];
    const orderNumber2 = o2?.order_number || transfer.order_id;
    const amt2 = parseFloat(transfer.amount);
    await notifyAndLog({
      recipientEmail: customerEmail2,
      recipientName: customerName2,
      subject: "Bank Transfer Rejected",
      body: `Your bank transfer of ${amt2} for order ${orderNumber2} has been rejected.`,
      eventType: "payment.bank_transfer_rejected",
      entityType: "payment",
      entityId: req.params.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.startsWith("Already ")) {
      return res.status(400).json({ error: `Bank transfer has already been ${err.message.replace("Already ", "").toLowerCase()}. Cannot reject twice.` });
    }
    console.error("Bank transfer reject error:", err);
    res.status(500).json({ error: "Failed to reject bank transfer" });
  }
});

/* ── Credit order creation ── */

const creditOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
  })),
  subtotal: z.number().min(0),
  tax: z.number().min(0).optional(),
  total: z.number().positive(),
  poNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  deliveryAddress: z.string().optional().nullable(),
});

// POST /orders/credit - Create credit order
router.post("/orders/credit", authenticate, requireCompanyActive, validate(creditOrderSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { items, subtotal, tax = 0, total, poNumber, notes, deliveryAddress } = req.body;

    const result = await transaction(async (client) => {
      const userResult = await client.query(
        `SELECT id, is_credit_approved, credit_limit, outstanding_balance, payment_terms_days FROM users WHERE id = $1 FOR UPDATE`,
        [req.userId]
      );
      if (userResult.rows.length === 0) throw new Error("User not found");

      const user = userResult.rows[0];

      if (!user.is_credit_approved) {
        throw new Error("Credit not approved");
      }

      const limit = parseFloat(user.credit_limit || "0");
      const outstanding = parseFloat(user.outstanding_balance || "0");

      if (limit > 0 && outstanding + total > limit) {
        throw Object.assign(new Error("LIMIT_EXCEEDED"), {
          availableCredit: Math.max(0, limit - outstanding),
          creditLimit: limit,
          outstandingBalance: outstanding,
          orderTotal: total,
        });
      }

      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const paymentTermsDays = user.payment_terms_days || 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);

      const ordResult = await client.query(
        `INSERT INTO orders (user_id, order_number, items, subtotal, tax, total, status,
          payment_method, payment_status, amount_paid, outstanding_amount,
          payment_terms, payment_due_date, po_number, notes, order_type)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'credit', 'unpaid', 0, $7, $8, $9, $10, $11, 'sales')
         RETURNING *`,
        [req.userId, orderNumber, JSON.stringify(items), subtotal, tax, total,
         total, `${paymentTermsDays} days`, dueDate.toISOString().split("T")[0],
         poNumber || null, notes || null]
      );
      const order = ordResult.rows[0];

      await client.query(
        `UPDATE users SET outstanding_balance = outstanding_balance + $1, updated_at = NOW() WHERE id = $2`,
        [total, req.userId]
      );

      const invNum = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await client.query(
        `INSERT INTO invoices (order_id, invoice_number, status, subtotal, tax, total,
          amount_paid, outstanding_amount, due_date, payment_terms, notes)
         VALUES ($1, $2, 'issued', $3, $4, $5, 0, $6, $7, $8, $9)`,
        [order.id, invNum, subtotal, tax, total, total,
         dueDate.toISOString().split("T")[0], `${paymentTermsDays} days`, notes || null]
      );

      await client.query(
        `INSERT INTO activities (entity_type, entity_id, type, description, metadata, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ["order", order.id, "credit_order.created",
         `Credit order ${orderNumber} for GH₵${total.toLocaleString()} created`,
         JSON.stringify({ orderNumber, total, paymentTermsDays, dueDate: dueDate.toISOString().split("T")[0] }), req.userId]
      );

      return order;
    });

    const u3 = (await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [req.userId])).rows[0];
    const userEmail3 = u3?.email || "";
    const userName3 = [u3?.first_name, u3?.last_name].filter(Boolean).join(" ") || "";
    await notifyAndLog({
      recipientEmail: userEmail3,
      recipientName: userName3,
      subject: "Credit Order Created",
      body: `Your credit order #${result.order_number || result.id} has been created successfully.`,
      eventType: "payment.credit_order_created",
      entityType: "payment",
      entityId: result.id,
      performedBy: req.userId!,
    }).catch(() => {});

    res.status(201).json({ order: result });
  } catch (err: any) {
    if (err.message === "User not found") return res.status(404).json({ error: "User not found" });
    if (err.message === "Credit not approved") return res.status(400).json({ error: "Credit not approved for this account. Please contact our sales team to apply for credit terms." });
    if (err.message === "LIMIT_EXCEEDED") {
      return res.status(400).json({
        error: "Order exceeds available credit",
        availableCredit: err.availableCredit,
        creditLimit: err.creditLimit,
        outstandingBalance: err.outstandingBalance,
        orderTotal: err.orderTotal,
      });
    }
    console.error("Credit order error:", err);
    res.status(500).json({ error: "Failed to create credit order" });
  }
});

/* ── Record payment against order (admin) ── */

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["bank_transfer", "cash", "cheque", "paystack", "credit_note", "other"]),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// POST /admin/orders/:id/record-payment
router.post("/admin/orders/:id/record-payment", authenticate, requireAdmin, validate(recordPaymentSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, method, reference, notes } = req.body;

    const result = await transaction(async (client) => {
      const orderResult = await client.query(
        "SELECT id, user_id, amount_paid, outstanding_amount, total, order_number, payment_method FROM orders WHERE id = $1 FOR UPDATE",
        [req.params.id]
      );
      if (orderResult.rows.length === 0) throw new Error("Order not found");
      const ord = orderResult.rows[0];

      const prevPaid = parseFloat(ord.amount_paid || "0");
      const total = parseFloat(ord.total);
      const outstandingAmount = parseFloat(ord.outstanding_amount || total);

      if (amount > outstandingAmount) {
        throw Object.assign(new Error("OVERPAYMENT"), {
          orderTotal: total,
          amountPaid: prevPaid,
          remainingDue: outstandingAmount,
        });
      }

      const newPaid = prevPaid + amount;
      const newOutstanding = Math.max(0, total - newPaid);
      const newPaymentStatus = newOutstanding <= 0 ? "paid" : "partially_paid";

      await client.query(
        `UPDATE orders SET payment_status = $1, amount_paid = $2, outstanding_amount = $3, updated_at = NOW() WHERE id = $4`,
        [newPaymentStatus, newPaid, newOutstanding, req.params.id]
      );

      const paymentRecord = await client.query(
        `INSERT INTO order_payments (order_id, user_id, amount, method, reference, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.params.id, ord.user_id, amount, method, reference || null, notes || null, req.userId]
      );

      await client.query(
        `UPDATE users SET outstanding_balance = GREATEST(0, outstanding_balance - $1), updated_at = NOW() WHERE id = $2`,
        [amount, ord.user_id]
      );

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
        ["order", req.params.id, "credit_payment.recorded",
         `Payment of GH₵${amount.toLocaleString()} recorded via ${method}`,
         JSON.stringify({ amount, method, reference }), req.userId]
      );

      return { paymentStatus: newPaymentStatus, amountPaid: newPaid, outstandingAmount: newOutstanding, user_id: ord.user_id, order_number: ord.order_number, paymentId: paymentRecord.rows[0].id, isCredit: ord.payment_method === "credit" };
    });

    const u4 = (await query("SELECT email, first_name, last_name FROM users WHERE id = $1", [result.user_id])).rows[0];
    const customerEmail4 = u4?.email || "";
    const customerName4 = [u4?.first_name, u4?.last_name].filter(Boolean).join(" ") || "";
    await notifyAndLog({
      recipientEmail: customerEmail4,
      recipientName: customerName4,
      subject: "Payment Recorded",
      body: `A payment of ${amount} has been recorded for order #${result.order_number}.`,
      eventType: "payment.recorded",
      entityType: "payment",
      entityId: req.params.id,
      performedBy: req.userId!,
    }).catch(() => {});
    if (result.isCredit) {
      void trackFunnelEvent({
        eventName: "repayment_received",
        eventKey: `repayment_received:${result.paymentId}`,
        userId: result.user_id,
        entityType: "order_payment",
        entityId: result.paymentId,
        metadata: { orderId: req.params.id, amount, method },
      });
    }

    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message === "Order not found") return res.status(404).json({ error: "Order not found" });
    if (err.message === "OVERPAYMENT") {
      return res.status(400).json({
        error: "Payment exceeds order outstanding amount",
        orderTotal: err.orderTotal,
        amountPaid: err.amountPaid,
        remainingDue: err.remainingDue,
      });
    }
    console.error("Record payment error:", err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

/* ── Admin payment listing ── */

// GET /admin/payments
router.get("/admin/payments", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, method, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;
    const params: any[] = [];
    const conds: string[] = [];

    if (status) { conds.push(`p.status = $${params.length + 1}`); params.push(status); }
    if (method) { conds.push(`p.method = $${params.length + 1}`); params.push(method); }

    const paymentWhere = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const paymentQuery = `
      SELECT p.id, p.order_id, o.order_number, p.user_id,
        CONCAT(u.first_name, ' ', u.last_name) as customer_name,
        p.amount, p.method, p.reference, p.notes, p.recorded_by, p.paid_at as paid_at, p.created_at
      FROM order_payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN users u ON p.user_id = u.id
      ${paymentWhere}
    `;

    const bankQuery = `
      SELECT bt.id, bt.order_id, o.order_number, bt.user_id,
        CONCAT(u.first_name, ' ', u.last_name) as customer_name,
        bt.amount, 'bank_transfer' as method, bt.transfer_reference as reference,
        bt.notes, bt.reviewed_by as recorded_by, bt.created_at as paid_at, bt.created_at,
        bt.status, bt.bank_name, bt.account_name, bt.account_number,
        bt.proof_url, bt.rejection_reason, bt.reviewed_by, bt.reviewed_at
      FROM bank_transfers bt
      LEFT JOIN orders o ON bt.order_id = o.id
      LEFT JOIN users u ON bt.user_id = u.id
    `;

    const countResult = await query(
      `SELECT COUNT(*) as count FROM (${paymentQuery}) sub`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const paymentRows = await query(
      `${paymentQuery} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );

    const bankRows = await query(
      `${bankQuery} ORDER BY created_at DESC`,
      []
    );

    const allPayments = [...paymentRows.rows.map((p: any) => ({ ...p, type: "order_payment" })),
      ...bankRows.rows.map((b: any) => ({ ...b, type: "bank_transfer" }))]
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      payments: allPayments,
      bankTransfers: bankRows.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error("Get payments error:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// GET /admin/payments/:id
router.get("/admin/payments/:id", authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    let result = await query(
      `SELECT p.*, o.order_number,
        CONCAT(u.first_name, ' ', u.last_name) as customer_name,
        u.email as customer_email
       FROM order_payments p
       LEFT JOIN orders o ON p.order_id = o.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length > 0) {
      return res.json({ payment: { ...result.rows[0], type: "order_payment" } });
    }

    result = await query(
      `SELECT bt.*, o.order_number,
        CONCAT(u.first_name, ' ', u.last_name) as customer_name,
        u.email as customer_email
       FROM bank_transfers bt
       LEFT JOIN orders o ON bt.order_id = o.id
       LEFT JOIN users u ON bt.user_id = u.id
       WHERE bt.id = $1`,
      [req.params.id]
    );

    if (result.rows.length > 0) {
      return res.json({ payment: { ...result.rows[0], type: "bank_transfer" } });
    }

    res.status(404).json({ error: "Payment not found" });
  } catch (err) {
    console.error("Get payment error:", err);
    res.status(500).json({ error: "Failed to fetch payment" });
  }
});

/* ── Customer billing ── */

// GET /customer/billing
router.get("/customer/billing", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT company_name, tax_id, business_registration_number,
              billing_contact_name, billing_contact_email, billing_contact_phone,
              is_credit_approved, credit_limit, outstanding_balance, payment_terms_days
       FROM users WHERE id = $1`,
      [req.userId]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const u = user.rows[0];
    const limit = parseFloat(u.credit_limit || "0");
    const outstanding = parseFloat(u.outstanding_balance || "0");

    const orders = await query(
      `SELECT id, order_number, total, amount_paid, outstanding_amount,
              payment_method, payment_status, payment_due_date, status, created_at
       FROM orders WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.userId]
    );

    const bankTransfers = await query(
      `SELECT id, amount, transfer_reference, status, rejection_reason, created_at
       FROM bank_transfers WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );

    res.json({
      billing: {
        companyName: u.company_name,
        taxId: u.tax_id,
        businessRegistrationNumber: u.business_registration_number,
        billingContactName: u.billing_contact_name,
        billingContactEmail: u.billing_contact_email,
        billingContactPhone: u.billing_contact_phone,
      },
      credit: {
        isApproved: u.is_credit_approved,
        creditLimit: limit,
        outstandingBalance: outstanding,
        availableCredit: Math.max(0, limit - outstanding),
        paymentTermsDays: u.payment_terms_days,
      },
      orders: orders.rows.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        total: parseFloat(o.total),
        amountPaid: parseFloat(o.amount_paid || "0"),
        outstandingAmount: parseFloat(o.outstanding_amount || o.total),
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status,
        paymentDueDate: o.payment_due_date,
        status: o.status,
        createdAt: o.created_at,
      })),
      bankTransfers: bankTransfers.rows.map((bt: any) => ({
        id: bt.id,
        amount: parseFloat(bt.amount),
        transferReference: bt.transfer_reference,
        status: bt.status,
        rejectionReason: bt.rejection_reason,
        createdAt: bt.created_at,
      })),
    });
  } catch (err) {
    console.error("Customer billing error:", err);
    res.status(500).json({ error: "Failed to fetch billing info" });
  }
});

// GET /customer/credit-summary
router.get("/customer/credit-summary", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await query(
      `SELECT is_credit_approved, credit_limit, outstanding_balance, payment_terms_days
       FROM users WHERE id = $1`,
      [req.userId]
    );
    if (user.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const u = user.rows[0];
    const limit = parseFloat(u.credit_limit || "0");
    const outstanding = parseFloat(u.outstanding_balance || "0");

    const activeOrders = await query(
      `SELECT id, order_number, total, amount_paid, outstanding_amount,
              payment_status, payment_due_date, created_at
       FROM orders
       WHERE user_id = $1 AND payment_method = 'credit'
       ORDER BY created_at DESC`,
      [req.userId]
    );

    const upcoming = await query(
      `SELECT id, order_number, outstanding_amount, payment_due_date
       FROM orders
       WHERE user_id = $1 AND payment_method = 'credit'
         AND payment_status IN ('unpaid', 'partially_paid')
         AND payment_due_date IS NOT NULL
         AND payment_due_date <= CURRENT_DATE + INTERVAL '30 days'
       ORDER BY payment_due_date ASC`,
      [req.userId]
    );

    const overdue = await query(
      `SELECT id, order_number, outstanding_amount, payment_due_date
       FROM orders
       WHERE user_id = $1 AND payment_method = 'credit'
         AND payment_status IN ('unpaid', 'partially_paid')
         AND payment_due_date IS NOT NULL
         AND payment_due_date < CURRENT_DATE`,
      [req.userId]
    );

    const recentPayments = await query(
      `SELECT op.id, op.amount, op.method, op.reference, op.paid_at, o.order_number
       FROM order_payments op
       LEFT JOIN orders o ON op.order_id = o.id
       WHERE op.user_id = $1
       ORDER BY op.created_at DESC LIMIT 10`,
      [req.userId]
    );

    res.json({
      isCreditApproved: u.is_credit_approved,
      creditLimit: limit,
      outstandingBalance: outstanding,
      availableCredit: Math.max(0, limit - outstanding),
      paymentTermsDays: u.payment_terms_days,
      activeOrders: activeOrders.rows.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        total: parseFloat(o.total),
        amountPaid: parseFloat(o.amount_paid || "0"),
        outstandingAmount: parseFloat(o.outstanding_amount || o.total),
        paymentStatus: o.payment_status,
        paymentDueDate: o.payment_due_date,
        createdAt: o.created_at,
      })),
      upcomingPayments: upcoming.rows.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        outstandingAmount: parseFloat(o.outstanding_amount),
        paymentDueDate: o.payment_due_date,
      })),
      overdueOrders: overdue.rows.map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        outstandingAmount: parseFloat(o.outstanding_amount),
        paymentDueDate: o.payment_due_date,
      })),
      recentPayments: recentPayments.rows.map((p: any) => ({
        id: p.id,
        amount: parseFloat(p.amount),
        method: p.method,
        reference: p.reference,
        paidAt: p.paid_at,
        orderNumber: p.order_number,
      })),
    });
  } catch (err) {
    console.error("Customer credit summary error:", err);
    res.status(500).json({ error: "Failed to fetch credit summary" });
  }
});

/* ── Admin overdue detection ── */

// POST /admin/orders/check-overdue
router.post("/admin/orders/check-overdue", authenticate, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `UPDATE orders SET payment_status = 'overdue', updated_at = NOW()
       WHERE payment_method = 'credit'
         AND payment_status IN ('unpaid', 'partially_paid')
         AND payment_due_date IS NOT NULL
         AND payment_due_date < CURRENT_DATE
       RETURNING id, order_number, user_id, outstanding_amount, payment_due_date`
    );

    for (const o of result.rows) {
      await activityLog("order", o.id, "order.overdue",
        `Order ${o.order_number} marked overdue (GH₵${parseFloat(o.outstanding_amount).toLocaleString()} remaining)`,
        { outstandingAmount: parseFloat(o.outstanding_amount), dueDate: o.payment_due_date });
    }

    res.json({ updated: result.rows.length, orders: result.rows });
  } catch (err) {
    console.error("Check overdue error:", err);
    res.status(500).json({ error: "Failed to check overdue orders" });
  }
});

export default router;
