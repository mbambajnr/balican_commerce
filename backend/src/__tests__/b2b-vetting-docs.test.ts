import request from "supertest";
import path from "path";
import fs from "fs";
import app from "../app";
import { pool, query } from "../config/db";
import { config } from "../config";
import {
  createTestUser, createTestCompany,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let adminToken: string;
let userToken: string;
let company: any;
let user: any;
let otherUserToken: string;
let otherCompany: any;

const TEST_FILE_DIR = path.resolve(config.upload.dir, "private", "vetting");

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("doc-admin"), role: "admin" });
  adminToken = generateToken(admin.id, "admin");

  company = await createTestCompany(makeUnique("doc-company"));
  user = await createTestUser({
    email: makeEmail("doc-user"),
    companyId: company.id,
    firstName: "Doc",
    accountStatus: "active",
  });
  userToken = generateToken(user.id, "customer");

  otherCompany = await createTestCompany(makeUnique("doc-other"));
  const other = await createTestUser({
    email: makeEmail("doc-other-user"),
    companyId: otherCompany.id,
    firstName: "Other",
  });
  otherUserToken = generateToken(other.id, "customer");
});

afterAll(async () => {
  // Clean up test files
  if (fs.existsSync(TEST_FILE_DIR)) {
    const files = fs.readdirSync(TEST_FILE_DIR);
    for (const f of files) {
      const fullPath = path.join(TEST_FILE_DIR, f);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
      }
    }
  }
  await query("DELETE FROM vetting_documents WHERE company_id IN ($1, $2)", [company.id, otherCompany.id]).catch(() => {});
  await cleanupTestData();
  await pool.end();
});

function makeTestBuffer(contentType: string): Buffer {
  if (contentType === "application/pdf") {
    // Minimal valid PDF
    return Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF");
  }
  // Minimal valid PNG (1x1 pixel)
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
}

function makeOversizedBuffer(): Buffer {
  return Buffer.alloc(11 * 1024 * 1024); // 11 MB
}

describe("POST /company/vetting/upload", () => {
  it("uploads a PDF successfully", async () => {
    const buf = makeTestBuffer("application/pdf");
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", buf, "registration-cert.pdf")
      .field("question_key", "registration_document");
    expect(res.status).toBe(201);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.original_filename).toBe("registration-cert.pdf");
    expect(res.body.document.mime_type).toBe("application/pdf");
    expect(res.body.document.size_bytes).toBe(buf.length);
    expect(res.body.document.question_key).toBe("registration_document");
    expect(res.body.document.id).toBeDefined();

    // Verify the file exists on disk
    const stored = await query("SELECT storage_key FROM vetting_documents WHERE id = $1", [res.body.document.id]);
    const filePath = path.resolve(config.upload.dir, "private", stored.rows[0].storage_key);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("uploads a PNG image successfully", async () => {
    const buf = makeTestBuffer("image/png");
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", buf, "logo.png")
      .field("question_key", "registration_document");
    expect(res.status).toBe(201);
    expect(res.body.document.mime_type).toBe("image/png");
  });

  it("uploads a JPG image successfully", async () => {
    const buf = makeTestBuffer("image/jpeg");
    // Create a minimal JPEG
    const jpegBuf = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRFJiMkVic4EzQjR0RSlFNkVUcCZS/9oADAMBAAIRAxEAPwC1//Z", "base64");
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", jpegBuf, "photo.jpg")
      .field("question_key", "registration_document");
    expect(res.status).toBe(201);
    expect(res.body.document.mime_type).toBe("image/jpeg");
  });

  it("rejects invalid file type (GIF)", async () => {
    const buf = Buffer.from("GIF89a");
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", buf, "image.gif")
      .field("question_key", "registration_document");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported file type");
  });

  it("rejects file > 10 MB", async () => {
    const buf = makeOversizedBuffer();
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", buf, "huge.pdf")
      .field("question_key", "registration_document");
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const buf = makeTestBuffer("application/pdf");
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .attach("file", buf, "test.pdf")
      .field("question_key", "registration_document");
    expect(res.status).toBe(401);
  });

  it("provides no file returns 400", async () => {
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .field("question_key", "registration_document");
    expect(res.status).toBe(400);
  });
});

describe("GET /company/vetting/documents/:id/download", () => {
  let docId: string;

  beforeAll(async () => {
    // Upload a doc to download
    const buf = makeTestBuffer("application/pdf");
    const res = await request(app)
      .post("/api/company/vetting/upload")
      .set("Authorization", `Bearer ${userToken}`)
      .attach("file", buf, "download-test.pdf")
      .field("question_key", "registration_document");
    docId = res.body.document.id;
  });

  it("owner can download their document", async () => {
    const res = await request(app)
      .get(`/api/company/vetting/documents/${docId}/download`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("download-test.pdf");
  });

  it("other company user cannot download", async () => {
    const res = await request(app)
      .get(`/api/company/vetting/documents/${docId}/download`)
      .set("Authorization", `Bearer ${otherUserToken}`);
    expect(res.status).toBe(403);
  });

  it("admin can download any company document", async () => {
    const res = await request(app)
      .get(`/api/company/vetting/documents/${docId}/download`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
  });

  it("unauthenticated request is rejected", async () => {
    const res = await request(app)
      .get(`/api/company/vetting/documents/${docId}/download`);
    expect(res.status).toBe(401);
  });

  it("non-existent doc returns 404", async () => {
    const res = await request(app)
      .get("/api/company/vetting/documents/00000000-0000-0000-0000-000000000000/download")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Admin GET /admin/companies/:id/vetting/documents", () => {
  it("admin can list vetting documents for a company", async () => {
    const res = await request(app)
      .get(`/api/admin/companies/${company.id}/vetting/documents`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toBeInstanceOf(Array);
    expect(res.body.documents.length).toBeGreaterThan(0);
    expect(res.body.documents[0]).toHaveProperty("original_filename");
    expect(res.body.documents[0]).toHaveProperty("mime_type");
    // Should not expose storage_key
    expect(res.body.documents[0].storage_key).toBeUndefined();
  });

  it("non-admin gets 403", async () => {
    const res = await request(app)
      .get(`/api/admin/companies/${company.id}/vetting/documents`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Vetting status includes documents", () => {
  it("GET /company/vetting/status includes uploaded documents", async () => {
    const res = await request(app)
      .get("/api/company/vetting/status")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toBeInstanceOf(Array);
    expect(res.body.documents.length).toBeGreaterThan(0);
  });
});
