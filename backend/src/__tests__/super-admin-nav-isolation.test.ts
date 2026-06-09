import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { createTestUser, generateToken } from "./helpers";

let testUserIds: string[] = [];

afterAll(async () => {
  if (testUserIds.length > 0) {
    await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [testUserIds]);
  }
});

async function createUser(role: string, isProvider = false): Promise<{ userId: string; token: string }> {
  const suffix = `nav-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const user = await createTestUser({ email: `nav-${suffix}@example.com`, role, accountStatus: "active" });
  testUserIds.push(user.id);

  const companyType = isProvider ? "supplier" : "buyer";
  const companyResult = await query(
    `INSERT INTO companies (name, email, business_type, status, is_provider, company_type, verification_status)
     VALUES ($1, $2, 'general', 'active', $3, $4, 'approved')
     RETURNING id`,
    [`Nav Test ${role} ${suffix}`, `nav-company-${suffix}@example.com`, isProvider, companyType]
  );
  await query(`UPDATE users SET company_id = $1 WHERE id = $2`, [companyResult.rows[0].id, user.id]);

  const token = generateToken(user.id, role);
  return { userId: user.id, token };
}

const SUPER_ADMIN_ROUTES = [
  { method: "get", path: "/api/super-admin/companies", desc: "GET /api/super-admin/companies" },
  { method: "get", path: "/api/super-admin/documents", desc: "GET /api/super-admin/documents" },
  { method: "get", path: "/api/super-admin/audit-logs", desc: "GET /api/super-admin/audit-logs" },
  { method: "get", path: "/api/super-admin/plans", desc: "GET /api/super-admin/plans" },
  { method: "get", path: "/api/super-admin/verification", desc: "GET /api/super-admin/verification" },
];

const BUYER_ROUTES = [
  { method: "get", path: "/api/scout/requests", desc: "GET /api/scout/requests" },
];

const PROVIDER_ROUTES = [
  { method: "get", path: "/api/provider/dashboard", desc: "GET /api/provider/dashboard" },
  { method: "get", path: "/api/provider/opportunities", desc: "GET /api/provider/opportunities" },
];

describe("Super Admin Navigation Isolation", () => {
  describe("Super admin can access super admin routes", () => {
    for (const route of SUPER_ADMIN_ROUTES) {
      it(`super admin can ${route.desc}`, async () => {
        const { token } = await createUser("super_admin");
        const res = await request(app).get(route.path).set("Authorization", `Bearer ${token}`);
        // May return 200 or 404 (empty data), but NOT 403
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe("Non-super-admin cannot access super admin routes", () => {
    const NON_SUPER_ROLES = [
      { role: "customer", desc: "buyer" },
      { role: "admin", desc: "admin" },
    ];

    for (const { role, desc } of NON_SUPER_ROLES) {
      for (const route of SUPER_ADMIN_ROUTES) {
        it(`${desc} (${role}) blocked on ${route.desc}`, async () => {
          const { token } = await createUser(role);
          const res = await request(app).get(route.path).set("Authorization", `Bearer ${token}`);
          expect(res.status).toBe(403);
        });
      }
    }
  });

  describe("Super admin can access provider routes (elevated access)", () => {
    for (const route of PROVIDER_ROUTES) {
      it(`super admin can ${route.desc}`, async () => {
        const { token } = await createUser("super_admin");
        const res = await request(app).get(route.path).set("Authorization", `Bearer ${token}`);
        // Super admin bypasses provider checks — may return 200 or other non-403 codes
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe("Super admin can access buyer routes", () => {
    for (const route of BUYER_ROUTES) {
      it(`super admin can ${route.desc}`, async () => {
        const { token } = await createUser("super_admin");
        const res = await request(app).get(route.path).set("Authorization", `Bearer ${token}`);
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      });
    }
  });

  describe("Unauthenticated blocked from all", () => {
    for (const route of [...SUPER_ADMIN_ROUTES, ...BUYER_ROUTES, ...PROVIDER_ROUTES]) {
      it(`unauthenticated blocked on ${route.desc}`, async () => {
        const res = await request(app).get(route.path);
        expect(res.status).toBe(401);
      });
    }
  });

  describe("Super admin can still access platform console routes", () => {
    it("super admin can access admin companies list", async () => {
      const { token } = await createUser("super_admin");
      const res = await request(app).get("/api/admin/companies").set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });

    it("super admin can access marketplace products", async () => {
      const { token } = await createUser("super_admin");
      const res = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });
  });
});
