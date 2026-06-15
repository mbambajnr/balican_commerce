import { validateDocumentFile } from "../services/storage";
import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../app";
import { config } from "../config";

describe("document file validation", () => {
  test("accepts valid PDF, PNG, and JPEG signatures", () => {
    const pdf = Buffer.from("%PDF-1.4\n");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    expect(validateDocumentFile("application/pdf", "file.pdf", pdf)).toBeNull();
    expect(validateDocumentFile("image/png", "file.png", png)).toBeNull();
    expect(validateDocumentFile("image/jpeg", "file.jpg", jpeg)).toBeNull();
  });

  test("rejects active content and spoofed allowed extensions", () => {
    const html = Buffer.from("<script>alert(1)</script>");

    expect(validateDocumentFile("text/html", "file.html", html)).toContain("Unsupported file type");
    expect(validateDocumentFile("application/pdf", "file.pdf", html)).toContain("File content does not match");
  });

  test("rejects MIME and extension mismatches", () => {
    const pdf = Buffer.from("%PDF-1.4\n");

    expect(validateDocumentFile("application/pdf", "file.png", pdf)).toContain("MIME type mismatch");
  });

  test("never serves private local documents through the public static route", async () => {
    const filename = `private-route-${Date.now()}.pdf`;
    const filePath = path.resolve(config.upload.dir, "private", "vetting", filename);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, "%PDF-1.4");

    try {
      const response = await request(app).get(`/uploads/private/vetting/${filename}`);
      expect(response.status).toBe(404);
    } finally {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  });
});
