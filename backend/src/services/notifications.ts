import { query, transaction } from "../config/db";

type EntityType = "user" | "order" | "quotation" | "payment" | "invoice" | "booking" | "rfq" | "lead" | "task" | "company" | "customer_group" | "company_price";
type EventType =
  | "user.registered"
  | "order.created" | "order.updated"
  | "order.converted_from_quotation"
  | "quotation.created" | "quotation.sent" | "quotation.accepted" | "quotation.rejected"
  | "quotation.cancelled" | "quotation.revised" | "quotation.expired"
  | "payment.verified" | "payment.bank_transfer_submitted"
  | "payment.bank_transfer_approved" | "payment.bank_transfer_rejected"
  | "payment.credit_order_created" | "payment.recorded"
  | "invoice.created" | "invoice.paid" | "invoice.overdue" | "invoice.partially_paid"
  | "booking.requested" | "booking.confirmed" | "booking.rescheduled"
  | "booking.in_progress" | "booking.completed" | "booking.cancelled"
  | "booking.note_added"
  | "lead.created" | "lead.updated" | "lead.stage_changed"
  | "task.created" | "task.updated"
  | "rfq.submitted"
  | "customer.credit_updated"
  | "company.registered" | "company.status_changed" | "company.credit_approved";

interface NotificationParams {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body?: string;
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  metadata?: Record<string, any>;
}

interface ActivityParams {
  userId: string;
  action: string;
  entityType: EntityType;
  entityId: string;
  metadata?: Record<string, any>;
}

export async function logNotification(params: NotificationParams) {
  const { recipientEmail, recipientName, subject, body, eventType, entityType, entityId } = params;
  try {
    await query(
      `INSERT INTO email_logs (recipient_email, recipient_name, subject, body, event_type, entity_type, entity_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [recipientEmail, recipientName || null, subject, body || null, eventType, entityType, entityId]
    );
  } catch (err) {
    console.error(`Failed to log notification (${eventType}):`, err);
  }
}

export async function logActivity(params: ActivityParams) {
  const { userId, action, entityType, entityId, metadata } = params;
  try {
    const description = `${entityType} ${action}`;
    const safeUserId = userId === "system" ? null : userId;
    await query(
      `INSERT INTO activities (user_id, type, entity_type, entity_id, description, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [safeUserId, action, entityType, entityId, description, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error(`Failed to log activity (${action}):`, err);
  }
}

export async function notifyAndLog(params: NotificationParams & { performedBy: string }) {
  const { performedBy, ...notif } = params;

  const shortSubject = params.subject.length > 200 ? params.subject.substring(0, 197) + "..." : params.subject;
  const shortBody = params.body && params.body.length > 500 ? params.body.substring(0, 497) + "..." : params.body;

  await logNotification({ ...notif, subject: shortSubject, body: shortBody });
  await logActivity({
    userId: performedBy,
    action: notif.eventType,
    entityType: notif.entityType,
    entityId: notif.entityId,
    metadata: { subject: shortSubject, recipientEmail: notif.recipientEmail },
  });
}
