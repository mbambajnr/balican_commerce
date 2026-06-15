import request from "supertest";
import app from "../app";
import { pool, query } from "../config/db";
import { createAuthSession } from "../services/auth-session";
import { createTestUserFast, makeEmail } from "./helpers";

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await query("DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])", [createdUserIds]).catch(() => {});
    await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]).catch(() => {});
  }
  await pool.end();
});

describe("revocable authentication sessions", () => {
  test("logout immediately revokes the current session", async () => {
    const user = await createTestUserFast({
      email: makeEmail(`session-logout-${Date.now()}`),
    });
    createdUserIds.push(user.id);
    const token = await createAuthSession(user.id);

    const before = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const after = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  test("role changes take effect without waiting for token expiry", async () => {
    const user = await createTestUserFast({
      email: makeEmail(`session-role-${Date.now()}`),
      role: "admin",
    });
    createdUserIds.push(user.id);
    const token = await createAuthSession(user.id);

    const before = await request(app)
      .get("/api/admin/payments")
      .set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    await query("UPDATE users SET role = 'customer' WHERE id = $1", [user.id]);

    const after = await request(app)
      .get("/api/admin/payments")
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(403);
  });

  test("suspended users are denied immediately", async () => {
    const user = await createTestUserFast({
      email: makeEmail(`session-suspend-${Date.now()}`),
    });
    createdUserIds.push(user.id);
    const token = await createAuthSession(user.id);

    await query("UPDATE users SET account_status = 'suspended' WHERE id = $1", [user.id]);

    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });
});
