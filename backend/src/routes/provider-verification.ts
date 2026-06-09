import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { query } from "../config/db";
import { storePrivateDocument, validateDocumentFile } from "../services/storage";
import { createActivityLog } from "../services/activity-log";
import { notifyVerificationSubmitted } from "../services/verification-notifications";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const VALID_DOC_TYPES = [
  "business_registration", "certificate_of_incorporation", "tax_identification",
  "company_profile", "director_or_owner_id", "proof_of_address",
  "professional_license", "insurance_certificate", "portfolio_or_past_projects", "other",
];

// GET /api/provider/verification/status
async function getProviderCompany(userId: string) {
  const userResult = await query(
    `SELECT u.company_id, c.verification_status, c.company_type, c.is_provider
     FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.id = $1`,
    [userId]
  );
  if (userResult.rows.length === 0 || !userResult.rows[0].company_id) {
    return null;
  }
  const company = userResult.rows[0];
  if (!company.is_provider && (company.company_type === "buyer" || company.company_type === "platform_admin")) {
    return null;
  }
  return company;
}

router.get("/verification/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const company = await getProviderCompany(req.userId!);
    if (!company) {
      return res.status(403).json({ error: "Verification is only for provider companies" });
    }

    const docsResult = await query(
      `SELECT id, document_type, file_name, mime_type, file_size, status, rejection_reason, admin_review_notes, created_at, reviewed_at
       FROM verification_documents WHERE company_id = $1 ORDER BY created_at DESC`,
      [company.company_id]
    );

    res.json({
      companyId: company.company_id,
      verificationStatus: company.verification_status,
      documents: docsResult.rows,
    });
  } catch (err) {
    console.error("Error fetching verification status:", err);
    res.status(500).json({ error: "Failed to fetch verification status" });
  }
});

// POST /api/provider/verification/documents/upload
router.post(
  "/verification/documents/upload",
  authenticate,
  upload.single("document"),
  async (req: AuthRequest, res: Response) => {
    try {
      const company = await getProviderCompany(req.userId!);
      if (!company) {
        return res.status(403).json({ error: "Only provider companies can upload verification documents" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Document file is required" });
      }

      const documentType = req.body.document_type;
      if (!documentType || !VALID_DOC_TYPES.includes(documentType)) {
        return res.status(400).json({ error: "Invalid document type" });
      }

      const validationError = validateDocumentFile(req.file.mimetype, req.file.originalname);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const stored = await storePrivateDocument(req.file.buffer, req.file.originalname, req.file.mimetype);

      const docResult = await query(
        `INSERT INTO verification_documents (company_id, uploaded_by, document_type, file_name, storage_key, mime_type, file_size, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING id, document_type, file_name, mime_type, file_size, status, created_at`,
        [company.company_id, req.userId, documentType, req.file.originalname, stored.storageKey, req.file.mimetype, req.file.size]
      );

      await createActivityLog({
        companyId: company.company_id,
        userId: req.userId,
        action: "verification_document_uploaded",
        description: `Uploaded ${documentType} document`,
        metadata: { documentId: docResult.rows[0].id, documentType },
      });

      res.status(201).json(docResult.rows[0]);
    } catch (err) {
      console.error("Error uploading verification document:", err);
      res.status(500).json({ error: "Failed to upload document" });
    }
  }
);

// DELETE /api/provider/verification/documents/:id
router.delete(
  "/verification/documents/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userResult = await query(
        `SELECT company_id FROM users WHERE id = $1`,
        [req.userId]
      );
      if (userResult.rows.length === 0 || !userResult.rows[0].company_id) {
        return res.status(403).json({ error: "Only provider companies can manage verification documents" });
      }
      const companyId = userResult.rows[0].company_id;

      const docResult = await query(
        `DELETE FROM verification_documents WHERE id = $1 AND company_id = $2 AND status = 'pending' RETURNING id`,
        [req.params.id, companyId]
      );
      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: "Document not found or cannot be deleted (already reviewed)" });
      }

      res.json({ message: "Document deleted" });
    } catch (err) {
      console.error("Error deleting verification document:", err);
      res.status(500).json({ error: "Failed to delete document" });
    }
  }
);

// POST /api/provider/verification/submit
router.post("/verification/submit", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const company = await getProviderCompany(req.userId!);
    if (!company) {
      return res.status(403).json({ error: "Only provider companies can submit for verification" });
    }

    if (["approved", "submitted", "under_review"].includes(company.verification_status)) {
      return res.status(400).json({ error: "Verification already submitted or approved" });
    }

    const docsResult = await query(
      `SELECT COUNT(*)::int FROM verification_documents WHERE company_id = $1`,
      [company.company_id]
    );
    if (docsResult.rows[0].count === 0) {
      return res.status(400).json({ error: "Upload at least one document before submitting" });
    }

    await query(
      `UPDATE companies SET verification_status = 'submitted' WHERE id = $1`,
      [company.company_id]
    );

    await createActivityLog({
      companyId: company.company_id,
      userId: req.userId,
      action: "verification_submitted",
      description: "Submitted verification documents for review",
    });
    await notifyVerificationSubmitted(company.company_id, req.userId!);

    res.json({ message: "Verification documents submitted for review" });
  } catch (err) {
    console.error("Error submitting verification:", err);
    res.status(500).json({ error: "Failed to submit verification" });
  }
});

export default router;
