jest.mock("../services/notifications", () => ({
  notifyAndLog: jest.fn().mockRejectedValue(new Error("notification unavailable")),
}));

jest.mock("../services/email", () => ({
  sendEmail: jest.fn().mockRejectedValue(new Error("email unavailable")),
}));

import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { makeEmail, makeUnique } from "./helpers";

describe("registration post-commit side effects", () => {
  test("notification and email failures do not fail a committed registration", async () => {
    const email = makeEmail(`registration-side-effects-${Date.now()}`);
    const companyName = makeUnique("registration-side-effects");

    const response = await request(app).post("/api/auth/register").send({
      email,
      password: "TestPass123!",
      firstName: "Post",
      lastName: "Commit",
      companyName,
      companyType: "supplier",
    });

    expect(response.status).toBe(201);

    const user = await query("SELECT id, company_id FROM users WHERE email = $1", [email]);
    const company = await query("SELECT id FROM companies WHERE name = $1", [companyName]);
    expect(user.rows).toHaveLength(1);
    expect(company.rows).toHaveLength(1);
    expect(user.rows[0].company_id).toBe(company.rows[0].id);
  });
});
