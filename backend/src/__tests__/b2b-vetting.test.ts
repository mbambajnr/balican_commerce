import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import {
  createTestUser, createTestCompany, createTestProduct,
  cleanupTestData, generateToken, makeEmail, makeUnique,
} from "./helpers";

let adminToken: string;
let userToken: string;
let company: any;
let user: any;
let otherUserToken: string;
let otherCompany: any;

const answer = (key: string, value: string, label?: string) => ({
  question_key: key,
  raw_value: value,
  display_label: label || value,
});

beforeAll(async () => {
  const admin = await createTestUser({ email: makeEmail("vet-admin"), role: "admin", firstName: "Vet", lastName: "Admin" });
  adminToken = generateToken(admin.id, "admin");

  company = await createTestCompany(makeUnique("vet-company"));
  user = await createTestUser({
    email: makeEmail("vet-user"),
    companyId: company.id,
    firstName: "Vet",
    lastName: "User",
    accountStatus: "active",
  });
  userToken = generateToken(user.id, "customer");

  otherCompany = await createTestCompany(makeUnique("vet-other"));
  const otherUser = await createTestUser({
    email: makeEmail("vet-other-user"),
    companyId: otherCompany.id,
    firstName: "Other",
    lastName: "User",
  });
  otherUserToken = generateToken(otherUser.id, "customer");
});

afterAll(async () => {
  await query("DELETE FROM vetting_responses WHERE submission_id IN (SELECT id FROM vetting_submissions WHERE company_id IN ($1, $2))", [company.id, otherCompany.id]).catch(() => {});
  await query("DELETE FROM vetting_audit_log WHERE company_id IN ($1, $2)", [company.id, otherCompany.id]).catch(() => {});
  await query("DELETE FROM vetting_submissions WHERE company_id IN ($1, $2)", [company.id, otherCompany.id]).catch(() => {});
  await cleanupTestData();
  await pool.end();
});

/* ── Active Questions ── */

describe("GET /company/vetting/questions", () => {
  it("returns active vetting questions", async () => {
    const res = await request(app)
      .get("/api/company/vetting/questions")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.questions).toBeInstanceOf(Array);
    expect(res.body.questions.length).toBeGreaterThanOrEqual(16);
    expect(res.body.questions[0]).toHaveProperty("question_key");
    expect(res.body.questions[0]).toHaveProperty("input_type");
    expect(res.body.questions[0]).toHaveProperty("label");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/company/vetting/questions");
    expect(res.status).toBe(401);
  });
});

/* ── Submit Vetting ── */

describe("POST /company/vetting/submit", () => {
  it("submits vetting responses successfully", async () => {
    const res = await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        answers: [
          answer("business_age", "more_than_5yr"),
          answer("business_type", "distributor"),
          answer("monthly_purchase_volume", "above_50000"),
          answer("expected_order_frequency", "weekly"),
          answer("wants_credit_sales", "yes"),
          answer("requested_credit_limit", "50000"),
          answer("preferred_repayment_period", "30_days"),
          answer("is_registered_business", "yes"),
          answer("registration_number", "RC-12345"),
          answer("has_trade_reference", "yes"),
          answer("reference_company_name", "Ref Corp"),
          answer("reference_contact_person", "John Doe"),
          answer("reference_phone", "+233501234567"),
          answer("main_delivery_location", "Accra, Ghana"),
          answer("business_stage", "established"),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.submission).toBeDefined();
    expect(res.body.submission.status).toBe("submitted");
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.band).toBe("strong");

    // Verify audit log created
    const audit = await query(
      "SELECT * FROM vetting_audit_log WHERE company_id = $1 AND action = 'submitted'",
      [company.id]
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects empty answers", async () => {
    const res = await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${userToken}`)
      .send({ answers: [] });
    expect(res.status).toBe(400);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/company/vetting/submit")
      .send({ answers: [answer("business_age", "more_than_5yr")] });
    expect(res.status).toBe(401);
  });
});

/* ── Conditional Credit Questions ── */

describe("Conditional credit questions", () => {
  it("credit questions appear only when wants_credit_sales = yes", async () => {
    const qRes = await request(app)
      .get("/api/company/vetting/questions")
      .set("Authorization", `Bearer ${userToken}`);
    const questions = qRes.body.questions as any[];

    const creditQuestion = questions.find((q: any) => q.question_key === "requested_credit_limit");
    expect(creditQuestion).toBeDefined();
    expect(creditQuestion.conditional_logic).toBeDefined();
    expect(creditQuestion.conditional_logic.depends_on).toBe("wants_credit_sales");
    expect(creditQuestion.conditional_logic.value).toBe("yes");
  });

  it("submits with credit questions answered", async () => {
    const co = await createTestCompany(makeUnique("vet-credit-co"));
    const cu = await createTestUser({
      email: makeEmail(`vet-credit-${Date.now()}`),
      companyId: co.id,
      firstName: "Credit",
    });
    const token = generateToken(cu.id, "customer");

    const res = await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "3_5yr"),
          answer("business_type", "retailer"),
          answer("monthly_purchase_volume", "5000_20000"),
          answer("expected_order_frequency", "monthly"),
          answer("wants_credit_sales", "yes"),
          answer("requested_credit_limit", "10000"),
          answer("preferred_repayment_period", "30_days"),
          answer("is_registered_business", "yes"),
          answer("registration_number", "RC-99999"),
          answer("main_delivery_location", "Kumasi, Ghana"),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.score).toBeGreaterThan(0);
  });

  it("submits without credit questions when wants_credit_sales = no", async () => {
    const co = await createTestCompany(makeUnique("vet-nocredit-co"));
    const cu = await createTestUser({
      email: makeEmail(`vet-nocredit-${Date.now()}`),
      companyId: co.id,
      firstName: "NoCredit",
    });
    const token = generateToken(cu.id, "customer");

    const res = await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "1_3yr"),
          answer("business_type", "contractor"),
          answer("monthly_purchase_volume", "1000_5000"),
          answer("expected_order_frequency", "occasionally"),
          answer("wants_credit_sales", "no"),
          answer("is_registered_business", "yes"),
          answer("registration_number", "RC-88888"),
          answer("main_delivery_location", "Tema, Ghana"),
        ],
      });
    expect(res.status).toBe(201);
  });
});

/* ── Score Calculation ── */

describe("Score calculation", () => {
  it("strong profile scores high (established + high volume + registered)", async () => {
    const co = await createTestCompany(makeUnique("vet-score-high"));
    const cu = await createTestUser({
      email: makeEmail(`vet-score-high-${Date.now()}`),
      companyId: co.id,
      firstName: "ScoreHigh",
    });
    const token = generateToken(cu.id, "customer");

    const res = await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "more_than_5yr"),
          answer("business_type", "distributor"),
          answer("monthly_purchase_volume", "above_50000"),
          answer("expected_order_frequency", "weekly"),
          answer("wants_credit_sales", "no"),
          answer("is_registered_business", "yes"),
          answer("registration_number", "RC-11111"),
          answer("registration_document", "reg-cert.pdf"),
          answer("has_trade_reference", "yes"),
          answer("reference_company_name", "Big Supplier Ltd"),
          answer("reference_contact_person", "Jane Doe"),
          answer("reference_phone", "+233501234568"),
          answer("main_delivery_location", "Accra, Ghana"),
          answer("business_stage", "established"),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.score).toBeGreaterThanOrEqual(65);
    expect(res.body.band).toBe("strong");
  });

  it("low-info profile scores lower (new + low volume + unregistered)", async () => {
    const co = await createTestCompany(makeUnique("vet-score-low"));
    const cu = await createTestUser({
      email: makeEmail(`vet-score-low-${Date.now()}`),
      companyId: co.id,
      firstName: "ScoreLow",
    });
    const token = generateToken(cu.id, "customer");

    const res = await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "less_than_6mo"),
          answer("business_type", "other"),
          answer("monthly_purchase_volume", "under_1000"),
          answer("expected_order_frequency", "onetime"),
          answer("wants_credit_sales", "no"),
          answer("is_registered_business", "no"),
          answer("main_delivery_location", "A"),
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.score).toBeLessThan(25);
    expect(res.body.band).toBe("needs_info");
  });
});

/* ── Company Vetting Status ── */

describe("GET /company/vetting/status", () => {
  it("returns submitted vetting status", async () => {
    const res = await request(app)
      .get("/api/company/vetting/status")
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vetting).toBeDefined();
    expect(res.body.vetting.status).toBe("submitted");
    expect(res.body.vetting.score).toBeGreaterThan(0);
    expect(res.body.vetting.responses).toBeInstanceOf(Array);
  });

  it("cross-company isolation — other company sees different vetting", async () => {
    const res = await request(app)
      .get("/api/company/vetting/status")
      .set("Authorization", `Bearer ${otherUserToken}`);
    expect(res.status).toBe(200);
    // Other company should have no submission
    expect(res.body.vetting).toBeNull();
  });
});

/* ── Admin Vetting Profile ── */

describe("Admin GET /admin/companies/:id/vetting", () => {
  it("admin can view company vetting profile", async () => {
    const res = await request(app)
      .get(`/api/admin/companies/${company.id}/vetting`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.vetting).toBeDefined();
    expect(res.body.vetting.submission).toBeDefined();
    expect(res.body.vetting.submission.status).toBe("submitted");
    expect(res.body.vetting.submission.score).toBeGreaterThan(0);
    expect(res.body.vetting.answersMap).toBeDefined();
    expect(res.body.vetting.answersMap.business_age).toBe("more_than_5yr");
    expect(res.body.vetting.maxScore).toBeGreaterThan(0);
    expect(res.body.vetting.scoreBandInfo).toBeDefined();
  });

  it("non-admin gets 403", async () => {
    const res = await request(app)
      .get(`/api/admin/companies/${company.id}/vetting`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent company", async () => {
    const res = await request(app)
      .get("/api/admin/companies/00000000-0000-0000-0000-000000000000/vetting")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

/* ── Admin Decision / Audit ── */

describe("Admin vetting decision", () => {
  it("admin can approve vetting", async () => {
    // Create a new submission to approve
    const co = await createTestCompany(makeUnique("vet-approve-co"));
    const cu = await createTestUser({
      email: makeEmail(`vet-approve-${Date.now()}`),
      companyId: co.id,
      firstName: "Approve",
    });
    const token = generateToken(cu.id, "customer");

    await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "more_than_5yr"),
          answer("business_type", "distributor"),
          answer("monthly_purchase_volume", "above_50000"),
          answer("expected_order_frequency", "weekly"),
          answer("wants_credit_sales", "no"),
          answer("is_registered_business", "yes"),
          answer("registration_number", "RC-22222"),
          answer("main_delivery_location", "Accra, Ghana"),
        ],
      });

    const res = await request(app)
      .patch(`/api/admin/companies/${co.id}/vetting/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "approved", note: "Strong business profile" });
    expect(res.status).toBe(200);
    expect(res.body.submission.status).toBe("approved");

    // Verify audit log
    const audit = await query(
      "SELECT * FROM vetting_audit_log WHERE company_id = $1 AND action = 'approved'",
      [co.id]
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].note).toBe("Strong business profile");
    expect(audit.rows[0].score_at_action).toBeGreaterThan(0);
  });

  it("admin can reject vetting", async () => {
    const co = await createTestCompany(makeUnique("vet-reject-co"));
    const cu = await createTestUser({
      email: makeEmail(`vet-reject-${Date.now()}`),
      companyId: co.id,
      firstName: "Reject",
    });
    const token = generateToken(cu.id, "customer");

    await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "less_than_6mo"),
          answer("business_type", "other"),
          answer("monthly_purchase_volume", "under_1000"),
          answer("expected_order_frequency", "onetime"),
          answer("wants_credit_sales", "no"),
          answer("is_registered_business", "no"),
          answer("main_delivery_location", "A"),
        ],
      });

    const res = await request(app)
      .patch(`/api/admin/companies/${co.id}/vetting/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "rejected", note: "Insufficient business information" });
    expect(res.status).toBe(200);
    expect(res.body.submission.status).toBe("rejected");

    const audit = await query(
      "SELECT * FROM vetting_audit_log WHERE company_id = $1 AND action = 'rejected'",
      [co.id]
    );
    expect(audit.rows.length).toBe(1);
  });

  it("admin can mark as needs more information", async () => {
    const co = await createTestCompany(makeUnique("vet-needsinfo-co"));
    const cu = await createTestUser({
      email: makeEmail(`vet-needsinfo-${Date.now()}`),
      companyId: co.id,
      firstName: "NeedsInfo",
    });
    const token = generateToken(cu.id, "customer");

    await request(app)
      .post("/api/company/vetting/submit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        answers: [
          answer("business_age", "6mo_1yr"),
          answer("business_type", "retailer"),
          answer("monthly_purchase_volume", "1000_5000"),
          answer("expected_order_frequency", "monthly"),
          answer("wants_credit_sales", "no"),
          answer("is_registered_business", "yes"),
          answer("main_delivery_location", "Accra"),
        ],
      });

    const res = await request(app)
      .patch(`/api/admin/companies/${co.id}/vetting/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "needs_info", note: "Please upload registration document" });
    expect(res.status).toBe(200);
    expect(res.body.submission.status).toBe("needs_info");

    const audit = await query(
      "SELECT * FROM vetting_audit_log WHERE company_id = $1 AND action = 'needs_info'",
      [co.id]
    );
    expect(audit.rows.length).toBe(1);
  });

  it("non-admin cannot make vetting decisions", async () => {
    const res = await request(app)
      .patch(`/api/admin/companies/${company.id}/vetting/status`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ status: "approved" });
    expect(res.status).toBe(403);
  });

  it("admin can add internal note", async () => {
    const res = await request(app)
      .post(`/api/admin/companies/${company.id}/vetting/note`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ note: "Customer called to follow up on approval" });
    expect(res.status).toBe(200);

    const audit = await query(
      "SELECT * FROM vetting_audit_log WHERE company_id = $1 AND action = 'note_added'",
      [company.id]
    );
    expect(audit.rows.length).toBeGreaterThanOrEqual(1);
    expect(audit.rows[0].note).toBe("Customer called to follow up on approval");
  });
});
