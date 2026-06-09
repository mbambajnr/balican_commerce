import request from "supertest";
import app from "../app";
import { query } from "../config/db";
import { createTestUser, generateToken } from "./helpers";

let testUserIds: string[] = [];

const STATUSES = ["pending", "rejected", "suspended", "payment_suspended", "deactivated"];

const BUSINESS_ROUTES = [
  { method: "get", path: "/api/cart", desc: "GET /api/cart", body: undefined },
  { method: "post", path: "/api/cart/items", desc: "POST /api/cart/items", body: { product_id: "00000000-0000-0000-0000-000000000001", quantity: 1 } },
  { method: "post", path: "/api/cart/checkout", desc: "POST /api/cart/checkout", body: {} },
  { method: "post", path: "/api/quick-order", desc: "POST /api/quick-order", body: { items: [{ sku: "NONEXISTENT", quantity: 1 }] } },
  { method: "get", path: "/api/provider/dashboard", desc: "GET /api/provider/dashboard", body: undefined },
];

async function requestWithMethod(method: string, path: string, token?: string, body?: any): Promise<request.Response> {
  const agent = request(app);
  const req = method === "get" ? agent.get(path)
    : method === "post" ? agent.post(path)
    : method === "put" ? agent.put(path)
    : method === "patch" ? agent.patch(path)
    : agent.delete(path);
  if (token) req.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) req.send(body);
  return req;
}

async function createCompanyWithStatus(status: string): Promise<{ userId: string; companyId: string; token: string }> {
  const suffix = `hardening-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const user = await createTestUser({ email: `test-${suffix}@example.com`, role: "customer", accountStatus: "active" });
  testUserIds.push(user.id);

  const companyResult = await query(
    `INSERT INTO companies (name, email, business_type, status, is_provider, company_type)
     VALUES ($1, $2, 'general', $3, false, 'buyer')
     RETURNING id`,
    [`Test ${status} Company ${suffix}`, `company-${suffix}@example.com`, status]
  );
  const companyId = companyResult.rows[0].id;

  await query(`UPDATE users SET company_id = $1 WHERE id = $2`, [companyId, user.id]);

  const token = generateToken(user.id, "customer");
  return { userId: user.id, companyId, token };
}

async function createSuperAdmin(): Promise<{ userId: string; token: string }> {
  const suffix = `super-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const user = await createTestUser({ email: `super-${suffix}@example.com`, role: "super_admin", accountStatus: "active" });
  testUserIds.push(user.id);

  const companyResult = await query(
    `INSERT INTO companies (name, email, business_type, status, is_provider, company_type)
     VALUES ($1, $2, 'general', 'active', false, 'buyer')
     RETURNING id`,
    [`Super Admin Co ${suffix}`, `sa-company-${suffix}@example.com`]
  );
  await query(`UPDATE users SET company_id = $1 WHERE id = $2`, [companyResult.rows[0].id, user.id]);

  const token = generateToken(user.id, "super_admin");
  return { userId: user.id, token };
}

async function createActiveUser(): Promise<{ userId: string; companyId: string; token: string }> {
  const suffix = `active-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const user = await createTestUser({ email: `active-${suffix}@example.com`, role: "customer", accountStatus: "active" });
  testUserIds.push(user.id);

  const companyResult = await query(
    `INSERT INTO companies (name, email, business_type, status, is_provider, company_type)
     VALUES ($1, $2, 'general', 'active', false, 'buyer')
     RETURNING id`,
    [`Active Co ${suffix}`, `active-company-${suffix}@example.com`]
  );
  await query(`UPDATE users SET company_id = $1 WHERE id = $2`, [companyResult.rows[0].id, user.id]);

  const token = generateToken(user.id, "customer");
  return { userId: user.id, companyId: companyResult.rows[0].id, token };
}

async function createNoCompanyUser(): Promise<{ userId: string; token: string }> {
  const suffix = `nocomp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const user = await createTestUser({ email: `nocomp-${suffix}@example.com`, role: "customer", accountStatus: "active" });
  testUserIds.push(user.id);
  const token = generateToken(user.id, "customer");
  return { userId: user.id, token };
}

async function createRestrictedProvider(status: string, verificationStatus: string): Promise<{ userId: string; token: string }> {
  const suffix = `prov-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const user = await createTestUser({ email: `prov-${suffix}@example.com`, role: "customer", accountStatus: "active" });
  testUserIds.push(user.id);

  const companyResult = await query(
    `INSERT INTO companies (name, email, business_type, status, is_provider, company_type, verification_status)
     VALUES ($1, $2, 'general', $3, true, 'supplier', $4)
     RETURNING id`,
    [`Prov ${status} Co ${suffix}`, `prov-company-${suffix}@example.com`, status, verificationStatus]
  );
  await query(`UPDATE users SET company_id = $1 WHERE id = $2`, [companyResult.rows[0].id, user.id]);

  const token = generateToken(user.id, "customer");
  return { userId: user.id, token };
}

afterAll(async () => {
  if (testUserIds.length > 0) {
    await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [testUserIds]);
  }
});

describe("Access Control Hardening", () => {
  describe("Business routes blocked for all restricted statuses", () => {
    for (const status of STATUSES) {
      it(`blocks ${status} company on GET /api/cart`, async () => {
        const { token } = await createCompanyWithStatus(status);
        const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty("error");
        const expectedCode = `COMPANY_${status.toUpperCase()}`;
        expect(res.body).toHaveProperty("code", expectedCode);
      });
    }

    for (const route of BUSINESS_ROUTES.slice(1, 3)) {
      for (const status of STATUSES) {
        it(`blocks ${status} on ${route.desc}`, async () => {
          const { token } = await createCompanyWithStatus(status);
          const res = await requestWithMethod(route.method, route.path, token, route.body);
          expect(res.status === 403 || res.status === 400).toBe(true);
          if (res.status === 403 && res.body) {
            expect(res.body).toHaveProperty("error");
          }
        });
      }
    }
  });

  describe("Active company allowed", () => {
    it("allows active company on GET /api/cart", async () => {
      const { token } = await createActiveUser();
      const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });
  });

  describe("No-company user blocked", () => {
    it("blocks user without company on GET /api/cart", async () => {
      const { token } = await createNoCompanyUser();
      const res = await request(app).get("/api/cart").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("error");
      expect(res.body).toHaveProperty("code", "NO_COMPANY");
    });
  });

  describe("Super admin bypasses restrictions", () => {
    for (const route of BUSINESS_ROUTES) {
      it(`super admin bypasses on ${route.desc}`, async () => {
        const { token } = await createSuperAdmin();
        const res = await requestWithMethod(route.method, route.path, token, route.body);
        expect(res.status).not.toBe(403);
      });
    }
  });

  describe("Provider routes respect company status", () => {
    for (const status of STATUSES) {
      it(`blocks ${status} provider on GET /api/provider/dashboard`, async () => {
        const { token } = await createRestrictedProvider(status, "not_started");
        const res = await request(app).get("/api/provider/dashboard").set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty("error");
      });
    }

    it("allows active provider on GET /api/provider/dashboard", async () => {
      const { token } = await createRestrictedProvider("active", "approved");
      const res = await request(app).get("/api/provider/dashboard").set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });
  });

  describe("Unauthenticated requests", () => {
    for (const route of BUSINESS_ROUTES) {
      it(`returns 401 for unauthenticated on ${route.desc}`, async () => {
        const res = await requestWithMethod(route.method, route.path);
        expect(res.status).toBe(401);
      });
    }
  });

  describe("Super admin-only endpoints", () => {
    it("super admin can GET /api/super-admin/verification", async () => {
      const { token } = await createSuperAdmin();
      const res = await request(app).get("/api/super-admin/verification").set("Authorization", `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });

    it("regular admin cannot GET /api/super-admin/verification", async () => {
      const suffix = `regular-admin-${Date.now()}`;
      const user = await createTestUser({ email: `regular-admin-${suffix}@example.com`, role: "admin", accountStatus: "active" });
      testUserIds.push(user.id);
      const token = generateToken(user.id, "admin");
      const res = await request(app).get("/api/super-admin/verification").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });
});
