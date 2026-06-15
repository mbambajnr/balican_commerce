import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { makeEmail, makeUnique } from "./helpers";

function registrationPayload(email: string, companyName: string) {
  return {
    email,
    password: "TestPass123!",
    firstName: "Atomic",
    lastName: "Registration",
    companyName,
    companyType: "buyer",
  };
}

describe("registration transaction", () => {
  test("concurrent duplicate registration leaves no orphan company", async () => {
    const email = makeEmail(`registration-race-${Date.now()}`);
    const companyNames = [
      makeUnique("registration-race-a"),
      makeUnique("registration-race-b"),
    ];

    const responses = await Promise.all(
      companyNames.map((companyName) =>
        request(app).post("/api/auth/register").send(registrationPayload(email, companyName))
      )
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const users = await query("SELECT id, company_id FROM users WHERE email = $1", [email]);
    const companies = await query(
      "SELECT id, name FROM companies WHERE name = ANY($1::text[])",
      [companyNames]
    );

    expect(users.rows).toHaveLength(1);
    expect(companies.rows).toHaveLength(1);
    expect(companies.rows[0].id).toBe(users.rows[0].company_id);
  });

  test("duplicate email returns 409 without creating another company", async () => {
    const email = makeEmail(`registration-duplicate-${Date.now()}`);
    const firstCompany = makeUnique("registration-first");
    const rejectedCompany = makeUnique("registration-rejected");

    const first = await request(app)
      .post("/api/auth/register")
      .send(registrationPayload(email, firstCompany));
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post("/api/auth/register")
      .send(registrationPayload(email, rejectedCompany));
    expect(duplicate.status).toBe(409);

    const rejected = await query("SELECT id FROM companies WHERE name = $1", [rejectedCompany]);
    expect(rejected.rows).toHaveLength(0);
  });
});
