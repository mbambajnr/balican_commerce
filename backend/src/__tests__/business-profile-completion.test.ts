import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { cleanupTestData, generateToken, makeEmail, makeUnique } from "./helpers";

describe("business profile completion", () => {
  const userIds: string[] = [];
  const companyIds: string[] = [];

  afterAll(async () => {
    if (userIds.length) await query("DELETE FROM users WHERE id = ANY($1)", [userIds]).catch(() => {});
    if (companyIds.length) await query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]).catch(() => {});
    await cleanupTestData();
  });

  async function register(companyType: "buyer" | "supplier" = "buyer") {
    const response = await request(app).post("/api/auth/register").send({
      companyName: makeUnique("minimal-profile"),
      companyType,
      firstName: "Minimal",
      lastName: "Account",
      email: makeEmail(`minimal-profile-${Date.now()}-${Math.random()}`),
      phone: "+233200000000",
      password: "TestPass123!",
    });
    expect(response.status).toBe(201);
    userIds.push(response.body.user.id);
    companyIds.push(response.body.company.id);
    return { ...response.body, token: generateToken(response.body.user.id, "customer") };
  }

  test("minimal step-one registration succeeds without business profile fields", async () => {
    const account = await register();
    const company = await query(
      "SELECT tax_id, business_registration_number, requested_payment_terms FROM companies WHERE id = $1",
      [account.company.id]
    );
    expect(company.rows[0]).toEqual({
      tax_id: null,
      business_registration_number: null,
      requested_payment_terms: null,
    });
  });

  test("credit application clearly rejects an incomplete profile", async () => {
    const account = await register();
    const response = await request(app)
      .post("/api/company/credit/apply")
      .set("Authorization", `Bearer ${account.token}`)
      .send({ requestedCreditLimit: 25000 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BUSINESS_PROFILE_INCOMPLETE");
    expect(response.body.missingFields.map((field: any) => field.key)).toEqual([
      "taxId", "businessRegistrationNumber", "requestedPaymentTerms",
    ]);
  });

  test("Balican Verified submission clearly rejects an incomplete profile", async () => {
    const account = await register("supplier");
    const response = await request(app)
      .post("/api/provider/verification/submit")
      .set("Authorization", `Bearer ${account.token}`);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BUSINESS_PROFILE_INCOMPLETE");
    expect(response.body.error).toMatch(/Balican Verified/i);
  });
});
