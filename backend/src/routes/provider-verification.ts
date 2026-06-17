import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { query } from "../config/db";
import { config } from "../config";
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
    `SELECT u.company_id, u.email, c.verification_status, c.company_type, c.is_provider,
            c.verified_until, c.verification_fee_waived_until, c.verification_fee_waiver_reason
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

async function getVerificationFeeState(companyId: string) {
  const [settingsResult, paymentResult] = await Promise.all([
    query(
      `SELECT amount, currency, renewal_period_days, grace_period_days
       FROM verification_fee_settings WHERE id = TRUE`
    ),
    query(
      `SELECT id, amount, currency, paystack_reference, status, authorization_url, paid_at, created_at
       FROM verification_fee_payments
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [companyId]
    ),
  ]);

  return {
    settings: settingsResult.rows[0] || {
      amount: "500.00",
      currency: config.paystack.currency,
      renewal_period_days: 365,
      grace_period_days: 14,
    },
    latestPayment: paymentResult.rows[0] || null,
  };
}

function hasActiveWaiver(company: any): boolean {
  if (!company.verification_fee_waived_until) return false;
  return new Date(company.verification_fee_waived_until).getTime() >= Date.now();
}

function hasSuccessfulPayment(payment: any): boolean {
  return payment?.status === "paid";
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
    const feeState = await getVerificationFeeState(company.company_id);

    res.json({
      companyId: company.company_id,
      verificationStatus: company.verification_status,
      verifiedUntil: company.verified_until,
      feeWaiver: {
        active: hasActiveWaiver(company),
        waivedUntil: company.verification_fee_waived_until,
        reason: company.verification_fee_waiver_reason,
      },
      verificationFee: {
        amount: parseFloat(feeState.settings.amount),
        currency: feeState.settings.currency,
        renewalPeriodDays: feeState.settings.renewal_period_days,
        gracePeriodDays: feeState.settings.grace_period_days,
        latestPayment: feeState.latestPayment,
        canSubmitForReview: hasActiveWaiver(company) || hasSuccessfulPayment(feeState.latestPayment),
      },
      documents: docsResult.rows,
    });
  } catch (err) {
    console.error("Error fetching verification status:", err);
    res.status(500).json({ error: "Failed to fetch verification status" });
  }
});

// POST /api/provider/verification/payment/init
router.post("/verification/payment/init", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const company = await getProviderCompany(req.userId!);
    if (!company) {
      return res.status(403).json({ error: "Only provider companies can pay verification fees" });
    }

    if (company.verification_status === "approved") {
      return res.status(400).json({ error: "Company is already verified" });
    }

    const feeState = await getVerificationFeeState(company.company_id);
    if (hasActiveWaiver(company) || hasSuccessfulPayment(feeState.latestPayment)) {
      return res.json({
        alreadyPaid: true,
        reference: feeState.latestPayment?.paystack_reference || null,
        authorizationUrl: feeState.latestPayment?.authorization_url || "",
      });
    }

    const amount = Number(feeState.settings.amount);
    const reference = `VF-${company.company_id.slice(0, 8)}-${Date.now()}`;
    const paystackPayload = {
      email: company.email || req.body.email,
      amount: Math.round(amount * 100),
      currency: feeState.settings.currency,
      reference,
      callback_url: `${config.frontendUrl}/provider/verification`,
      metadata: { company_id: company.company_id, purpose: "verification_fee" },
    };

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.paystack.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });

    const paystackData = await paystackRes.json() as {
      status: boolean;
      message?: string;
      data?: { authorization_url: string };
    };

    if (!paystackData.status) {
      return res.status(400).json({ error: paystackData.message || "Paystack initialization failed" });
    }

    await query(
      `INSERT INTO verification_fee_payments
        (company_id, user_id, amount, currency, paystack_reference, authorization_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        company.company_id,
        req.userId,
        amount,
        feeState.settings.currency,
        reference,
        paystackData.data?.authorization_url || "",
        JSON.stringify({ initializedBy: req.userId }),
      ]
    );

    await createActivityLog({
      companyId: company.company_id,
      userId: req.userId,
      action: "verification_fee_initialized",
      description: "Initialized Balican Verified payment",
      metadata: { reference, amount, currency: feeState.settings.currency },
    });

    res.json({ authorizationUrl: paystackData.data?.authorization_url || "", reference });
  } catch (err) {
    console.error("Error initializing verification payment:", err);
    res.status(500).json({ error: "Failed to initialize verification payment" });
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

      const validationError = validateDocumentFile(req.file.mimetype, req.file.originalname, req.file.buffer);
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

    const feeState = await getVerificationFeeState(company.company_id);
    if (!hasActiveWaiver(company) && !hasSuccessfulPayment(feeState.latestPayment)) {
      return res.status(402).json({
        error: "Balican Verified fee payment is required before review",
        code: "VERIFICATION_PAYMENT_REQUIRED",
        amount: parseFloat(feeState.settings.amount),
        currency: feeState.settings.currency,
      });
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
