import { config } from "../config";
import { query } from "../config/db";
import { sendEmail } from "./email";

export type OpportunityNotificationKind = "new" | "reminder";

interface DispatchResult {
  matched: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function dispatchOpportunityNotifications(
  requestId: string,
  kind: OpportunityNotificationKind
): Promise<DispatchResult> {
  const reminderConditions = kind === "reminder" ? `
    AND sr.created_at <= NOW() - INTERVAL '24 hours'
    AND (sr.desired_delivery_date IS NULL OR sr.desired_delivery_date >= CURRENT_DATE)
    AND NOT EXISTS (
      SELECT 1 FROM scout_quotes response
      WHERE response.request_id = sr.id
        AND response.provider_company_id = c.id
    )` : "";

  const recipients = await query(
    `SELECT DISTINCT
       sr.id AS request_id, sr.title, sr.request_type, sr.delivery_location,
       cat.name AS category_name,
       c.id AS company_id, c.name AS company_name,
       u.id AS user_id, u.email, u.first_name, u.last_name
     FROM scout_requests sr
     JOIN categories cat ON cat.id = sr.category_id
     JOIN companies c ON c.is_provider = true
       AND c.status = 'active'
       AND c.verification_status = 'approved'
       AND c.id != sr.company_id
     JOIN LATERAL (
       SELECT candidate.id, candidate.email, candidate.first_name, candidate.last_name
       FROM users candidate
       WHERE candidate.company_id = c.id AND candidate.account_status = 'active'
       ORDER BY CASE WHEN candidate.company_role = 'company_admin' THEN 0 ELSE 1 END,
                candidate.created_at ASC, candidate.id ASC
       LIMIT 1
     ) u ON true
     WHERE sr.id = $1
       AND sr.status = 'open'
       AND (
         EXISTS (
           SELECT 1 FROM products p
           WHERE p.provider_company_id = c.id
             AND p.category_id = sr.category_id
             AND p.is_active = true
         )
         OR EXISTS (
           SELECT 1 FROM services s
           WHERE s.provider_company_id = c.id
             AND s.category_id = sr.category_id
             AND s.is_active = true
         )
       )
       ${reminderConditions}
     ORDER BY c.name, u.email`,
    [requestId]
  );

  const result: DispatchResult = {
    matched: recipients.rows.length,
    notificationsCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  for (const recipient of recipients.rows) {
    const isReminder = kind === "reminder";
    const eventType = isReminder ? "opportunity.response_reminder" : "opportunity.new";
    const title = isReminder
      ? `Reminder: respond to ${recipient.title}`
      : `New sourcing opportunity: ${recipient.title}`;
    const description = isReminder
      ? "This matching sourcing request is still open and has no response from your company."
      : `A verified buyer posted a ${recipient.request_type} request matching your ${recipient.category_name} catalogue.`;
    const link = `/provider/opportunities/${recipient.request_id}`;
    const dedupKey = `${eventType}:${recipient.company_id}:${recipient.request_id}`;

    const inserted = await query(
      `INSERT INTO notifications
         (user_id, company_id, type, title, description, link, metadata, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        recipient.user_id,
        recipient.company_id,
        eventType,
        title,
        description,
        link,
        JSON.stringify({ requestId: recipient.request_id, category: recipient.category_name, kind }),
        dedupKey,
      ]
    );

    if (inserted.rows.length === 0) continue;
    result.notificationsCreated++;

    const recipientName = [recipient.first_name, recipient.last_name].filter(Boolean).join(" ");
    const opportunityUrl = `${config.frontendUrl}${link}`;
    const emailBody = `${description}\n\nView opportunity: ${opportunityUrl}`;
    const emailResult = await sendEmail({
      to: recipient.email,
      subject: title,
      text: emailBody,
      html: `<p>${description}</p><p><a href="${opportunityUrl}">View sourcing opportunity</a></p>`,
    });

    if (emailResult.success) result.emailsSent++;
    else result.emailsFailed++;

    await query(
      `INSERT INTO email_logs
         (recipient_email, recipient_name, subject, body, event_type, entity_type,
          entity_id, status, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, 'scout_request', $6, $7::varchar, $8,
         CASE WHEN $7::varchar = 'sent' THEN NOW() ELSE NULL END)`,
      [
        recipient.email,
        recipientName || null,
        title,
        emailBody,
        eventType,
        recipient.request_id,
        emailResult.success ? "sent" : "failed",
        emailResult.error || null,
      ]
    );
  }

  return result;
}

export async function dispatchDueOpportunityReminders(): Promise<DispatchResult & { requestsScanned: number }> {
  const dueRequests = await query(
    `SELECT id FROM scout_requests
     WHERE status = 'open'
       AND category_id IS NOT NULL
       AND created_at <= NOW() - INTERVAL '24 hours'
       AND (desired_delivery_date IS NULL OR desired_delivery_date >= CURRENT_DATE)
     ORDER BY created_at ASC`
  );

  const total: DispatchResult & { requestsScanned: number } = {
    requestsScanned: dueRequests.rows.length,
    matched: 0,
    notificationsCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };

  for (const row of dueRequests.rows) {
    const dispatched = await dispatchOpportunityNotifications(row.id, "reminder");
    total.matched += dispatched.matched;
    total.notificationsCreated += dispatched.notificationsCreated;
    total.emailsSent += dispatched.emailsSent;
    total.emailsFailed += dispatched.emailsFailed;
  }

  return total;
}
