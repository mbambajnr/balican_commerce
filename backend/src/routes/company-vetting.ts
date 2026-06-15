import { Router, Response, Request, NextFunction } from "express";
import { z } from "zod";
import multer from "multer";
import { query } from "../config/db";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  getActiveQuestions,
  getSubmission,
  getResponses,
  saveDraft,
  submitVetting,
} from "../services/company-vetting";
import {
  getPrivateDocumentAccess,
  storePrivateDocument,
  validateDocumentFile,
} from "../services/storage";

const router = Router();

const VETTING_UPLOAD_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VETTING_UPLOAD_MAX_SIZE },
});

// PUT /company/vetting/draft — Save draft responses
const draftSchema = z.object({
  answers: z.array(
    z.object({
      question_key: z.string().min(1),
      raw_value: z.string().nullable().optional(),
      display_label: z.string().nullable().optional(),
    })
  ).min(1),
});

router.put("/draft", authenticate, validate(draftSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    const companyId = userResult.rows[0]?.company_id;
    if (!companyId) return res.status(400).json({ error: "No company associated" });

    const result = await saveDraft(companyId, req.userId!, req.body.answers);
    res.json(result);
  } catch (err) {
    console.error("Save vetting draft error:", err);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

// POST /company/vetting/submit — Submit vetting profile
const submitSchema = z.object({
  answers: z.array(
    z.object({
      question_key: z.string().min(1),
      raw_value: z.string().nullable().optional(),
      display_label: z.string().nullable().optional(),
    })
  ).min(1),
});

router.post("/submit", authenticate, validate(submitSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    const companyId = userResult.rows[0]?.company_id;
    if (!companyId) return res.status(400).json({ error: "No company associated" });

    const result = await submitVetting(companyId, req.userId!, req.body.answers);
    res.status(201).json(result);
  } catch (err) {
    console.error("Submit vetting error:", err);
    res.status(500).json({ error: "Failed to submit vetting profile" });
  }
});

// GET /company/vetting/questions — Get active questions
router.get("/questions", authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const questions = await getActiveQuestions();
    res.json({ questions });
  } catch (err) {
    console.error("Get vetting questions error:", err);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// GET /company/vetting/status — Get company vetting status (includes documents)
router.get("/status", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    const companyId = userResult.rows[0]?.company_id;
    if (!companyId) return res.json({ vetting: null });

    const submission = await getSubmission(companyId);
    const responses = submission ? await getResponses(submission.id) : [];

    const docs = await query(
      "SELECT id, question_key, original_filename, mime_type, size_bytes, created_at FROM vetting_documents WHERE company_id = $1 ORDER BY created_at ASC",
      [companyId]
    );

    res.json({
      vetting: submission ? { ...submission, responses, documents: docs.rows } : null,
      documents: docs.rows,
    });
  } catch (err) {
    console.error("Get vetting status error:", err);
    res.status(500).json({ error: "Failed to get vetting status" });
  }
});

// POST /company/vetting/upload — Upload vetting document
router.post(
  "/upload",
  authenticate,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "File too large. Maximum size is 10 MB." });
          }
          return res.status(400).json({ error: err.message });
        }
        return res.status(400).json({ error: "File upload error" });
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file provided" });

      const questionKey = req.body.question_key || "registration_document";

      // Validate file type
      const validationError = validateDocumentFile(req.file.mimetype, req.file.originalname, req.file.buffer);
      if (validationError) return res.status(400).json({ error: validationError });

      // Get company
      const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
      const companyId = userResult.rows[0]?.company_id;
      if (!companyId) return res.status(400).json({ error: "No company associated" });

      // Store file privately
      const stored = await storePrivateDocument(req.file.buffer, req.file.originalname, req.file.mimetype);

      // Find latest submission for this company
      const subResult = await query(
        "SELECT id FROM vetting_submissions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
        [companyId]
      );
      const submissionId = subResult.rows[0]?.id || null;

      // Save document record
      const docResult = await query(
        `INSERT INTO vetting_documents (company_id, user_id, submission_id, question_key, original_filename, storage_key, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, question_key, original_filename, mime_type, size_bytes, created_at`,
        [companyId, req.userId, submissionId, questionKey, stored.filename, stored.storageKey, stored.mimeType, stored.sizeBytes]
      );

      res.status(201).json({ document: docResult.rows[0] });
    } catch (err) {
      console.error("Upload vetting document error:", err);
      res.status(500).json({ error: "Failed to upload document" });
    }
  }
);

// GET /company/vetting/documents/:id/download — Download vetting document (auth-gated)
router.get("/documents/:id/download", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const docResult = await query(
      `SELECT d.*, u.company_id as owner_company_id FROM vetting_documents d
       JOIN users u ON d.company_id = u.company_id
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (docResult.rows.length === 0) return res.status(404).json({ error: "Document not found" });

    const doc = docResult.rows[0];
    const isAdmin = req.userRole === "admin";

    // Get requesting user's company
    const userResult = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
    const userCompanyId = userResult.rows[0]?.company_id;

    // Only allow if admin OR same company
    if (!isAdmin && userCompanyId !== doc.company_id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const safeFilename = String(doc.original_filename)
      .split(/[\\/]/)
      .pop()!
      .replace(/[\r\n"]/g, "_")
      .slice(0, 200) || "document";
    const access = await getPrivateDocumentAccess(doc.storage_key, safeFilename, doc.mime_type);
    if (!access) return res.status(404).json({ error: "File not found in storage" });

    if (access.redirectUrl) {
      return res.redirect(302, access.redirectUrl);
    }

    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Type", doc.mime_type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    access.stream!.pipe(res);
  } catch (err) {
    console.error("Download vetting document error:", err);
    res.status(500).json({ error: "Failed to download document" });
  }
});

export default router;
