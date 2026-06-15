import { Router, Response } from "express";
import multer from "multer";
import { authenticate, AuthRequest } from "../middleware/auth";
import { resolveProviderCompany } from "./provider-dashboard";
import { query } from "../config/db";
import {
  storePrivateDocument,
  getPrivateDocumentAccess,
  validateDocumentFile,
} from "../services/storage";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const VALID_PRODUCT_DOC_TYPES = [
  "DATASHEET", "SAFETY_DATASHEET", "INSTALLATION_MANUAL", "WARRANTY_CERTIFICATE",
  "COMPLIANCE_CERTIFICATE", "ENERGY_RATING", "PRODUCT_BROCHURE", "TEST_REPORT", "OTHER_PRODUCT",
];

const VALID_SERVICE_DOC_TYPES = [
  "COMPANY_PROFILE", "INSURANCE_CERTIFICATE", "SAFETY_POLICY", "STAFF_TRAINING_CERTIFICATE",
  "FOOD_HANDLING_CERTIFICATE", "SECURITY_LICENSE", "METHOD_STATEMENT", "SLA_DOCUMENT",
  "PORTFOLIO", "OTHER_SERVICE",
];

async function getDocumentAccessContext(req: AuthRequest): Promise<{ companyId: string | null; isAdmin: boolean }> {
  const user = await query("SELECT company_id FROM users WHERE id = $1", [req.userId]);
  return {
    companyId: user.rows[0]?.company_id || null,
    isAdmin: req.userRole === "admin" || req.userRole === "super_admin",
  };
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === true || value === "true" || value === "1";
}

function safeDownloadFilename(filename: string): string {
  return filename
    .split(/[\\/]/)
    .pop()!
    .replace(/[\r\n"]/g, "_")
    .slice(0, 200) || "document";
}

// Upload document for a product or service
router.post(
  "/offerings/:type/:id/documents",
  authenticate,
  upload.single("document"),
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = await resolveProviderCompany(req, res);
      if (!ctx) return;

      const offeringType = req.params.type?.toUpperCase();
      if (offeringType !== "PRODUCT" && offeringType !== "SERVICE") {
        return res.status(400).json({ error: "Offering type must be PRODUCT or SERVICE" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Document file is required" });
      }

      const validationError = validateDocumentFile(
        req.file.mimetype,
        req.file.originalname,
        req.file.buffer
      );
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const documentType = req.body.document_type;
      if (!documentType) {
        return res.status(400).json({ error: "document_type is required" });
      }

      const validTypes = offeringType === "PRODUCT" ? VALID_PRODUCT_DOC_TYPES : VALID_SERVICE_DOC_TYPES;
      if (!validTypes.includes(documentType)) {
        return res.status(400).json({ error: `Invalid document type for ${offeringType}. Valid: ${validTypes.join(", ")}` });
      }

      // Verify ownership of the offering
      const table = offeringType === "PRODUCT" ? "products" : "services";
      const owner = await query(
        `SELECT id FROM ${table} WHERE id = $1 AND provider_company_id = $2`,
        [req.params.id, ctx.companyId]
      );
      if (owner.rows.length === 0) {
        return res.status(404).json({ error: `${offeringType} not found or not owned by your company` });
      }

      const isPublic = parseBoolean(req.body.is_public, true);
      const stored = await storePrivateDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
      const docResult = await query(
        `INSERT INTO offering_documents (company_id, offering_type, offering_id, document_type,
          file_name, storage_key, mime_type, file_size, is_public, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, document_type, file_name, mime_type, file_size, is_public, created_at`,
        [ctx.companyId, offeringType, req.params.id, documentType,
         req.file.originalname, stored.storageKey, req.file.mimetype, req.file.size, isPublic, req.userId]
      );

      res.status(201).json({ document: docResult.rows[0] });
    } catch (err) {
      console.error("Error uploading offering document:", err);
      res.status(500).json({ error: "Failed to upload document" });
    }
  }
);

// List documents for a product or service
router.get(
  "/offerings/:type/:id/documents",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const offeringType = req.params.type?.toUpperCase();
      if (offeringType !== "PRODUCT" && offeringType !== "SERVICE") {
        return res.status(400).json({ error: "Offering type must be PRODUCT or SERVICE" });
      }

      const table = offeringType === "PRODUCT" ? "products" : "services";
      const offering = await query(
        `SELECT provider_company_id FROM ${table} WHERE id = $1`,
        [req.params.id]
      );
      if (offering.rows.length === 0) {
        return res.status(404).json({ error: `${offeringType} not found` });
      }

      const access = await getDocumentAccessContext(req);
      const canViewPrivate = access.isAdmin
        || access.companyId === offering.rows[0].provider_company_id;

      const result = await query(
        `SELECT od.id, od.document_type, od.file_name, od.mime_type, od.file_size,
                od.description, od.is_public, od.created_at,
                CONCAT(u.first_name, ' ', u.last_name) as uploaded_by_name
         FROM offering_documents od
         LEFT JOIN users u ON u.id = od.uploaded_by
         WHERE od.offering_type = $1 AND od.offering_id = $2 AND od.is_active = true
           AND ($3::boolean = true OR od.is_public = true)
         ORDER BY od.created_at DESC`,
        [offeringType, req.params.id, canViewPrivate]
      );

      res.json({ documents: result.rows });
    } catch (err) {
      console.error("Error listing offering documents:", err);
      res.status(500).json({ error: "Failed to list documents" });
    }
  }
);

// Get document download URL
router.get(
  "/offerings/documents/:id/download",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = (await query(
        `SELECT * FROM offering_documents WHERE id = $1 AND is_active = true`,
        [req.params.id]
      )).rows[0];

      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const access = await getDocumentAccessContext(req);
      if (!doc.is_public && !access.isAdmin && access.companyId !== doc.company_id) {
        return res.status(403).json({ error: "Not authorized to download this document" });
      }

      const storageAccess = await getPrivateDocumentAccess(
        doc.storage_key,
        safeDownloadFilename(doc.file_name),
        doc.mime_type
      );
      if (!storageAccess) {
        return res.status(404).json({ error: "File not found in storage" });
      }

      if (storageAccess.redirectUrl) {
        return res.redirect(302, storageAccess.redirectUrl);
      }

      res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${safeDownloadFilename(doc.file_name)}"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      storageAccess.stream!.pipe(res);
    } catch (err) {
      console.error("Error downloading offering document:", err);
      res.status(500).json({ error: "Failed to download document" });
    }
  }
);

// Delete document
router.delete(
  "/offerings/documents/:id",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const doc = (await query(
        `SELECT * FROM offering_documents WHERE id = $1`,
        [req.params.id]
      )).rows[0];

      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Verify ownership
      const ctx = await resolveProviderCompany(req, res);
      if (!ctx) return;
      if (doc.company_id !== ctx.companyId) {
        return res.status(403).json({ error: "Not authorized to delete this document" });
      }

      await query(
        `UPDATE offering_documents SET is_active = false WHERE id = $1`,
        [req.params.id]
      );

      res.json({ message: "Document deleted" });
    } catch (err) {
      console.error("Error deleting offering document:", err);
      res.status(500).json({ error: "Failed to delete document" });
    }
  }
);

// Get document badges for a product or service
router.get(
  "/offerings/:type/:id/document-badges",
  async (_req: AuthRequest, res: Response) => {
    try {
      const offeringType = _req.params.type?.toUpperCase();
      const offeringId = _req.params.id;

      const docs = (await query(
        `SELECT DISTINCT document_type FROM offering_documents
         WHERE offering_type = $1 AND offering_id = $2 AND is_active = true AND is_public = true`,
        [offeringType, offeringId]
      )).rows;

      const badges = docs.map((d: any) => ({
        type: d.document_type,
        label: d.document_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      }));

      res.json({ badges });
    } catch (err) {
      console.error("Error fetching document badges:", err);
      res.status(500).json({ error: "Failed to fetch badges" });
    }
  }
);

// Track a recommendation event
router.post(
  "/recommendation-events",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { buyerCompanyId, providerCompanyId, eventType, offeringId, requestId, metadata } = req.body;

      if (!buyerCompanyId || !providerCompanyId || !eventType) {
        return res.status(400).json({ error: "buyerCompanyId, providerCompanyId, and eventType are required" });
      }

      const validTypes = [
        "RECOMMENDATION_VIEWED", "PROVIDER_INVITED", "PROPOSAL_VIEWED",
        "PROPOSAL_SUBMITTED", "QUOTE_ACCEPTED", "AGREEMENT_CREATED",
        "ORDER_COMPLETED", "ORDER_CANCELLED", "PROVIDER_RATING_SUBMITTED",
      ];

      if (!validTypes.includes(eventType)) {
        return res.status(400).json({ error: `Invalid event type. Valid: ${validTypes.join(", ")}` });
      }

      const { trackRecommendationEvent } = await import("../services/recommendation-events");
      await trackRecommendationEvent({
        buyerCompanyId,
        providerCompanyId,
        eventType,
        offeringId: offeringId || undefined,
        requestId: requestId || undefined,
        metadata: metadata || undefined,
      });

      res.status(201).json({ message: "Event tracked" });
    } catch (err) {
      console.error("Error tracking recommendation event:", err);
      res.status(500).json({ error: "Failed to track event" });
    }
  }
);

// Get recommendations for a scout request
router.get(
  "/requests/:id/recommendations",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const scoutReq = (await query(
        `SELECT sr.*, c.name as buyer_company, c2.name as category_name
         FROM scout_requests sr
         LEFT JOIN companies c ON c.id = sr.company_id
         LEFT JOIN categories c2 ON c2.id = sr.category_id
         WHERE sr.id = $1`,
        [req.params.id]
      )).rows[0];

      if (!scoutReq) {
        return res.status(404).json({ error: "Request not found" });
      }

      const { getRecommendationsForRequest } = await import("../services/recommendation-engine");
      const recommendations = await getRecommendationsForRequest(req.params.id, {
        categoryId: scoutReq.category_id,
        categoryName: scoutReq.category_name,
        requestType: scoutReq.request_type,
        deliveryLocation: scoutReq.delivery_location,
        buyerCompanyId: scoutReq.company_id,
      });

      res.json({ recommendations, request: scoutReq });
    } catch (err) {
      console.error("Error getting recommendations:", err);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  }
);

// Get recommended opportunities for a provider
router.get(
  "/recommended-opportunities",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = await resolveProviderCompany(req, res, false);
      if (!ctx) return;

      const { getRecommendedOpportunitiesForProvider } = await import("../services/recommendation-engine");
      const opportunities = await getRecommendedOpportunitiesForProvider(ctx.companyId);

      res.json({ opportunities });
    } catch (err) {
      console.error("Error getting recommended opportunities:", err);
      res.status(500).json({ error: "Failed to get recommended opportunities" });
    }
  }
);

export { router as providerOfferingsRoutes, query };
