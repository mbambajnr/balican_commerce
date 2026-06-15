import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../app";
import { config } from "../config";
import { query } from "../config/db";
import {
  cleanupTestData,
  createTestCategory,
  createTestCompany,
  createTestProduct,
  createTestUser,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

let ownerCompanyId: string;
let otherCompanyId: string;
let ownerUserId: string;
let otherUserId: string;
let adminUserId: string;
let productId: string;
let ownerToken: string;
let otherToken: string;
let adminToken: string;
const documentIds: string[] = [];

const pdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
);

beforeAll(async () => {
  const ownerCompany = await createTestCompany(makeUnique("offering-doc-owner"));
  ownerCompanyId = ownerCompany.id;
  await query(
    `UPDATE companies
     SET is_provider = true, company_type = 'supplier',
         verification_status = 'approved', status = 'active'
     WHERE id = $1`,
    [ownerCompanyId]
  );

  const otherCompany = await createTestCompany(makeUnique("offering-doc-other"));
  otherCompanyId = otherCompany.id;

  const owner = await createTestUser({
    email: makeEmail(`offering-owner-${Date.now()}`),
    companyId: ownerCompanyId,
    companyRole: "company_admin",
  });
  ownerUserId = owner.id;
  ownerToken = generateToken(owner.id, "customer");

  const other = await createTestUser({
    email: makeEmail(`offering-other-${Date.now()}`),
    companyId: otherCompanyId,
    companyRole: "company_admin",
  });
  otherUserId = other.id;
  otherToken = generateToken(other.id, "customer");

  const admin = await createTestUser({
    email: makeEmail(`offering-admin-${Date.now()}`),
    role: "admin",
  });
  adminUserId = admin.id;
  adminToken = generateToken(admin.id, "admin");

  const category = await createTestCategory(makeUnique("offering-doc-category"));
  const product = await createTestProduct({
    name: makeUnique("offering-doc-product"),
    categoryId: category.id,
  });
  productId = product.id;
  await query("UPDATE products SET provider_company_id = $1 WHERE id = $2", [ownerCompanyId, productId]);
});

afterAll(async () => {
  const stored = documentIds.length > 0
    ? await query("SELECT storage_key FROM offering_documents WHERE id = ANY($1)", [documentIds]).catch(() => ({ rows: [] }))
    : { rows: [] };
  for (const row of stored.rows) {
    const filePath = path.resolve(config.upload.dir, "private", row.storage_key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  if (documentIds.length > 0) {
    await query("DELETE FROM offering_documents WHERE id = ANY($1)", [documentIds]).catch(() => {});
  }
  await query("DELETE FROM products WHERE id = $1", [productId]).catch(() => {});
  await query("DELETE FROM users WHERE id = ANY($1)", [[ownerUserId, otherUserId, adminUserId]]).catch(() => {});
  await query("DELETE FROM companies WHERE id = ANY($1)", [[ownerCompanyId, otherCompanyId]]).catch(() => {});
  await cleanupTestData();
});

async function uploadDocument(isPublic: boolean, filename = "datasheet.pdf") {
  const res = await request(app)
    .post(`/api/offerings/product/${productId}/documents`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .field("document_type", "DATASHEET")
    .field("is_public", String(isPublic))
    .attach("document", pdfBuffer, {
      filename,
      contentType: "application/pdf",
    });
  if (res.body.document?.id) documentIds.push(res.body.document.id);
  return res;
}

describe("Provider offering document security", () => {
  test("rejects active content uploads", async () => {
    const res = await request(app)
      .post(`/api/offerings/product/${productId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .field("document_type", "DATASHEET")
      .attach("document", Buffer.from("<script>alert(1)</script>"), {
        filename: "payload.html",
        contentType: "text/html",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported file type");
  });

  test("rejects a spoofed PDF", async () => {
    const res = await request(app)
      .post(`/api/offerings/product/${productId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .field("document_type", "DATASHEET")
      .attach("document", Buffer.from("<html>not a pdf</html>"), {
        filename: "spoofed.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("File content does not match");
  });

  test("private documents are visible to the owner but hidden from other companies", async () => {
    const upload = await uploadDocument(false, "private-datasheet.pdf");
    expect(upload.status).toBe(201);

    const ownerList = await request(app)
      .get(`/api/offerings/product/${productId}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.documents.some((doc: any) => doc.id === upload.body.document.id)).toBe(true);

    const otherList = await request(app)
      .get(`/api/offerings/product/${productId}/documents`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherList.status).toBe(200);
    expect(otherList.body.documents.some((doc: any) => doc.id === upload.body.document.id)).toBe(false);

    const otherDownload = await request(app)
      .get(`/api/offerings/documents/${upload.body.document.id}/download`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherDownload.status).toBe(403);

    const adminDownload = await request(app)
      .get(`/api/offerings/documents/${upload.body.document.id}/download`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminDownload.status).toBe(200);
  });

  test("public documents use safe download headers for authenticated users", async () => {
    const upload = await uploadDocument(true, "public-datasheet.pdf");
    expect(upload.status).toBe(201);

    const download = await request(app)
      .get(`/api/offerings/documents/${upload.body.document.id}/download`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect(download.headers["x-content-type-options"]).toBe("nosniff");
    expect(download.headers["content-type"]).toBe("application/pdf");
  });
});
