import request from "supertest";
import app from "../app";

describe("service health", () => {
  test("liveness does not depend on external services", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("readiness verifies database, schema, and storage", async () => {
    const response = await request(app).get("/api/ready");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ready",
      checks: {
        database: "ok",
        schema: "ok",
        storage: "ok",
      },
    });
  });
});
