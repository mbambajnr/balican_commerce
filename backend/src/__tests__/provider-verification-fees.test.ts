import crypto from "crypto";
import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import {
  cleanupTestData,
  createTestCompany,
  createTestUser,
  generateToken,
  makeEmail,
  makeUnique,
} from "./helpers";

const pdfBuffer = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
);

function signedPayload(payload: any, key: string) {
  const raw = JSON.stringify(payload);
  return {
    raw,
    signature: crypto.createHmac("sha512", key).update(raw).digest("hex"),
  };
}

describe("Balican Verified paid verification", () => {
  let companyId: string;
  let userId: string;
  let adminUserId: string;
  let providerToken: string;
  let superAdminToken: string;
  const webhookKey = "verification-fee-webhook-test-key";

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = webhookKey;
    await query(
      `UPDATE verification_fee_settings
       SET amount = 500, currency = 'GHS', renewal_period_days = 365, grace_period_days = 14
       WHERE id = TRUE`
    );

    const company = await createTestCompany(makeUnique("verified-fee-company"));
    companyId = company.id;
    await query(
      `UPDATE companies
       SET is_provider = true, company_type = 'supplier',
           verification_status = 'required', status = 'active'
       WHERE id = $1`,
      [companyId]
    );

    const user = await createTestUser({
      email: makeEmail(`verified-fee-provider-${Date.now()}`),
      companyId,
      companyRole: "company_admin",
    });
    userId = user.id;
    providerToken = generateToken(user.id, "customer");

    const admin = await createTestUser({
      email: makeEmail(`verified-fee-super-${Date.now()}`),
      role: "super_admin",
    });
    adminUserId = admin.id;
    superAdminToken = generateToken(admin.id, "super_admin");
  });

  afterAll(async () => {
    await query("DELETE FROM verification_fee_payments WHERE company_id = $1", [companyId]).catch(() => {});
    await query("DELETE FROM verification_documents WHERE company_id = $1", [companyId]).catch(() => {});
    await query("DELETE FROM users WHERE id = ANY($1)", [[userId, adminUserId]]).catch(() => {});
    await query("DELETE FROM companies WHERE id = $1", [companyId]).catch(() => {});
    process.env.PAYSTACK_SECRET_KEY = "";
    await cleanupTestData();
  });

  async function uploadDocument() {
    return request(app)
      .post("/api/provider/verification/documents/upload")
      .set("Authorization", `Bearer ${providerToken}`)
      .field("document_type", "business_registration")
      .attach("document", pdfBuffer, {
        filename: "registration.pdf",
        contentType: "application/pdf",
      });
  }

  test("unpaid provider cannot submit documents into review", async () => {
    const upload = await uploadDocument();
    expect(upload.status).toBe(201);

    const submit = await request(app)
      .post("/api/provider/verification/submit")
      .set("Authorization", `Bearer ${providerToken}`);

    expect(submit.status).toBe(402);
    expect(submit.body.code).toBe("VERIFICATION_PAYMENT_REQUIRED");

    const docs = await request(app)
      .get("/api/super-admin/documents")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(docs.status).toBe(200);
    expect(docs.body.documents.some((doc: any) => doc.company_id === companyId)).toBe(false);
  });

  test("Paystack webhook marks verification payment paid once and permits submit", async () => {
    const reference = `VF-TEST-${Date.now()}`;
    await query(
      `INSERT INTO verification_fee_payments
        (company_id, user_id, amount, currency, paystack_reference, status)
       VALUES ($1, $2, 500, 'GHS', $3, 'pending')`,
      [companyId, userId, reference]
    );

    const payload = {
      event: "charge.success",
      data: { reference, amount: 50000, currency: "GHS" },
    };
    const signed = signedPayload(payload, webhookKey);

    const first = await request(app)
      .post("/api/orders/paystack-webhook")
      .set("x-paystack-signature", signed.signature)
      .send(signed.raw);
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post("/api/orders/paystack-webhook")
      .set("x-paystack-signature", signed.signature)
      .send(signed.raw);
    expect(replay.status).toBe(200);

    const payment = await query(
      "SELECT status, paid_at FROM verification_fee_payments WHERE paystack_reference = $1",
      [reference]
    );
    expect(payment.rows[0].status).toBe("paid");
    expect(payment.rows[0].paid_at).toBeTruthy();

    const submit = await request(app)
      .post("/api/provider/verification/submit")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(submit.status).toBe(200);

    const company = await query("SELECT verification_status FROM companies WHERE id = $1", [companyId]);
    expect(company.rows[0].verification_status).toBe("submitted");
  });

  test("amount mismatch does not grant paid status", async () => {
    await query("UPDATE companies SET verification_status = 'required' WHERE id = $1", [companyId]);
    const reference = `VF-MISMATCH-${Date.now()}`;
    await query(
      `INSERT INTO verification_fee_payments
        (company_id, user_id, amount, currency, paystack_reference, status)
       VALUES ($1, $2, 500, 'GHS', $3, 'pending')`,
      [companyId, userId, reference]
    );

    const payload = {
      event: "charge.success",
      data: { reference, amount: 100, currency: "GHS" },
    };
    const signed = signedPayload(payload, webhookKey);
    const res = await request(app)
      .post("/api/orders/paystack-webhook")
      .set("x-paystack-signature", signed.signature)
      .send(signed.raw);
    expect(res.status).toBe(200);

    const payment = await query("SELECT status FROM verification_fee_payments WHERE paystack_reference = $1", [reference]);
    expect(payment.rows[0].status).toBe("pending");
  });

  test("super-admin waiver permits submission and is audited", async () => {
    await query("UPDATE companies SET verification_status = 'required' WHERE id = $1", [companyId]);

    const waiver = await request(app)
      .post(`/api/super-admin/companies/${companyId}/verification-fee/waive`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ days: 30, reason: "First cohort" });
    expect(waiver.status).toBe(200);

    const submit = await request(app)
      .post("/api/provider/verification/submit")
      .set("Authorization", `Bearer ${providerToken}`);
    expect(submit.status).toBe(200);

    const audit = await query(
      "SELECT id FROM audit_logs WHERE target_id = $1 AND action = 'verification_fee_waived'",
      [companyId]
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  test("document approval sets verified_until and expiry job lapses old verifications", async () => {
    await query(
      `UPDATE companies
       SET verification_status = 'submitted', verified_until = NULL
       WHERE id = $1`,
      [companyId]
    );
    await query("UPDATE verification_documents SET status = 'pending' WHERE company_id = $1", [companyId]);
    const doc = await query("SELECT id FROM verification_documents WHERE company_id = $1 LIMIT 1", [companyId]);

    const approval = await request(app)
      .post(`/api/super-admin/documents/${doc.rows[0].id}/approve`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ notes: "Looks good" });
    expect(approval.status).toBe(200);

    const approved = await query("SELECT verification_status, verified_until FROM companies WHERE id = $1", [companyId]);
    expect(approved.rows[0].verification_status).toBe("approved");
    expect(approved.rows[0].verified_until).toBeTruthy();

    await query(
      "UPDATE companies SET verified_until = CURRENT_DATE - INTERVAL '20 days' WHERE id = $1",
      [companyId]
    );
    const expired = await request(app)
      .post("/api/super-admin/verification/expire-lapsed")
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(expired.status).toBe(200);
    expect(expired.body.lapsed).toBeGreaterThanOrEqual(1);

    const lapsed = await query("SELECT verification_status FROM companies WHERE id = $1", [companyId]);
    expect(lapsed.rows[0].verification_status).toBe("lapsed");
  });
});
