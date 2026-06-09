import { query } from "../config/db";
import { logNotification, logActivity } from "./notifications";

export async function notifyVerificationSubmitted(companyId: string, userId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  // Log notification for company contact
  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Verification documents submitted",
    body: `Your verification documents have been submitted and are pending admin review.`,
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, action: "verification_submitted" },
  });

  // Log activity
  await logActivity({
    userId,
    action: "verification.submitted",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name },
  });
}

export async function notifyVerificationApproved(companyId: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Verification approved — you can now trade",
    body: "Your provider verification has been approved. You can now access all platform features.",
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, action: "verification_approved" },
  });

  await logActivity({
    userId: adminUserId,
    action: "verification.approved",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name },
  });
}

export async function notifyDocumentRejected(companyId: string, docType: string, reason: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Document requires attention",
    body: `Your ${docType.replace(/_/g, " ")} document needs review: ${reason}`,
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, documentType: docType, reason },
  });

  await logActivity({
    userId: adminUserId,
    action: "document.rejected",
    entityType: "company",
    entityId: companyId,
    metadata: { documentType: docType, reason },
  });
}

export async function notifyDocumentReuploadRequested(companyId: string, docType: string, reason: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Document re-upload requested",
    body: `Please re-upload your ${docType.replace(/_/g, " ")} document: ${reason}`,
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, documentType: docType, reason },
  });

  await logActivity({
    userId: adminUserId,
    action: "document.reupload_requested",
    entityType: "company",
    entityId: companyId,
    metadata: { documentType: docType, reason },
  });
}

export async function notifyCompanyApproved(companyId: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Company approved",
    body: "Your company has been approved on the platform.",
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, action: "company_approved" },
  });

  await logActivity({
    userId: adminUserId,
    action: "company.approved",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name },
  });
}

export async function notifyCompanyRejected(companyId: string, reason: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Company registration not approved",
    body: `Your company registration was not approved: ${reason}`,
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, reason },
  });

  await logActivity({
    userId: adminUserId,
    action: "company.rejected",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name, reason },
  });
}

export async function notifyCompanySuspended(companyId: string, reason: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Account suspended",
    body: `Your company account has been suspended: ${reason}. Please contact support.`,
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, reason },
  });

  await logActivity({
    userId: adminUserId,
    action: "company.suspended",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name, reason },
  });
}

export async function notifyCompanyReactivated(companyId: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Account reactivated",
    body: "Your company account has been reactivated. You can resume trading.",
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, action: "company_reactivated" },
  });

  await logActivity({
    userId: adminUserId,
    action: "company.reactivated",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name },
  });
}

export async function notifyPaymentSuspended(companyId: string, reason: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Payment suspension applied",
    body: `Your account has been suspended due to payment issues: ${reason}. Please contact support.`,
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, reason },
  });

  await logActivity({
    userId: adminUserId,
    action: "company.payment_suspended",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name, reason },
  });
}

export async function notifyPaymentSuspensionCleared(companyId: string, adminUserId: string) {
  const company = await query(`SELECT name, email FROM companies WHERE id = $1`, [companyId]);
  if (!company.rows.length) return;

  await logNotification({
    recipientEmail: company.rows[0].email,
    recipientName: company.rows[0].name,
    subject: "Payment suspension cleared",
    body: "Your payment suspension has been cleared. You can resume trading.",
    eventType: "company.status_changed",
    entityType: "company",
    entityId: companyId,
    metadata: { companyId, action: "payment_suspension_cleared" },
  });

  await logActivity({
    userId: adminUserId,
    action: "company.payment_suspension_cleared",
    entityType: "company",
    entityId: companyId,
    metadata: { companyName: company.rows[0].name },
  });
}
