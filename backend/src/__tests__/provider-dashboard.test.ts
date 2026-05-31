import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import app from "../app";
import http from "http";
import { query } from "../config/db";
import { createTestUser, createTestCompany, cleanupTestData, generateToken } from "./helpers";

let server: http.Server;
let baseUrl: string;
let providerCompanyId: string;
let providerToken: string;
let nonProviderToken: string;
let otherProviderToken: string;
let otherProviderCompanyId: string;

const TEST_PREFIX = "PROV-DASH-";

const providerEmail = `${TEST_PREFIX}provider-${Date.now()}@test.com`;
const nonProviderEmail = `${TEST_PREFIX}nonprovider-${Date.now()}@test.com`;
const otherProviderEmail = `${TEST_PREFIX}other-provider-${Date.now()}@test.com`;
const viewerEmail = `${TEST_PREFIX}viewer-${Date.now()}@test.com`;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  // Create provider company (supplier type)
  const providerCompanyResult = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1, $2, 'active', true, 'supplier', 'approved') RETURNING id`,
    [`${TEST_PREFIX}Provider Co`, `${TEST_PREFIX}provider-co-${Date.now()}@test.com`]
  );
  providerCompanyId = providerCompanyResult.rows[0].id;

  // Create provider user
  const providerUser = await createTestUser({
    email: providerEmail,
    password: "Password123!",
    companyId: providerCompanyId,
    companyRole: "company_admin",
  });
  providerToken = generateToken(providerUser.id, "customer");

  // Create non-provider company (buyer)
  const nonProvCompany = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type)
     VALUES ($1, $2, 'active', false, 'buyer') RETURNING id`,
    [`${TEST_PREFIX}Buyer Co`, `${TEST_PREFIX}buyer-co-${Date.now()}@test.com`]
  );
  const nonProvUser = await createTestUser({
    email: nonProviderEmail,
    password: "Password123!",
    companyId: nonProvCompany.rows[0].id,
    companyRole: "company_admin",
  });
  nonProviderToken = generateToken(nonProvUser.id, "customer");

  // Create another provider company (for isolation test)
  const otherProvCompany = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1, $2, 'active', true, 'supplier', 'approved') RETURNING id`,
    [`${TEST_PREFIX}Other Provider`, `${TEST_PREFIX}other-prov-${Date.now()}@test.com`]
  );
  otherProviderCompanyId = otherProvCompany.rows[0].id;
  const otherProvUser = await createTestUser({
    email: otherProviderEmail,
    password: "Password123!",
    companyId: otherProviderCompanyId,
    companyRole: "company_admin",
  });
  otherProviderToken = generateToken(otherProvUser.id, "customer");

  // Create a viewer user on the same provider company (for role permission tests)
  const viewerUser = await createTestUser({
    email: viewerEmail,
    password: "Password123!",
    companyId: providerCompanyId,
    companyRole: "viewer",
  });
  viewerToken = generateToken(viewerUser.id, "customer");
});

let viewerToken: string;

afterAll(async () => {
  await query("DELETE FROM products WHERE name LIKE $1", [`${TEST_PREFIX}%`]).catch(() => {});
  await query("DELETE FROM services WHERE name LIKE $1", [`${TEST_PREFIX}%`]).catch(() => {});
  await query("DELETE FROM users WHERE email LIKE $1", [`${TEST_PREFIX}%`]).catch(() => {});
  await query("DELETE FROM companies WHERE name LIKE $1", [`${TEST_PREFIX}%`]).catch(() => {});
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

function api(path: string, options?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
}

function authApi(path: string, token: string, options?: RequestInit) {
  return api(path, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/* ── Helper: create a test product for a provider ── */
async function createTestProduct(token: string, overrides: Record<string, any> = {}): Promise<any> {
  const res = await authApi("/provider/products", token, {
    method: "POST",
    body: JSON.stringify({
      name: `${TEST_PREFIX}Test Product ${Date.now()}`,
      price: 100,
      ...overrides,
    }),
  });
  return res.json();
}

/* ── Helper: create a test service for a provider ── */
async function createTestService(token: string, overrides: Record<string, any> = {}): Promise<any> {
  const res = await authApi("/provider/services", token, {
    method: "POST",
    body: JSON.stringify({
      name: `${TEST_PREFIX}Test Service ${Date.now()}`,
      serviceType: "installation",
      pricingModel: "fixed",
      ...overrides,
    }),
  });
  return res.json();
}

describe("Provider Dashboard", () => {
  it("returns stats for a provider company", async () => {
    const res = await authApi("/provider/dashboard", providerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.stats).toBeDefined();
    expect(typeof body.stats.products).toBe("number");
    expect(typeof body.stats.services).toBe("number");
    expect(Array.isArray(body.recentProducts)).toBe(true);
    expect(Array.isArray(body.recentServices)).toBe(true);
  });

  it("rejects non-provider companies", async () => {
    const res = await authApi("/provider/dashboard", nonProviderToken);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toContain("Not a provider");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await api("/provider/dashboard");
    expect(res.status).toBe(401);
  });
});

describe("Provider Products", () => {
  let productId: string;

  it("creates a product", async () => {
    const res = await authApi("/provider/products", providerToken, {
      method: "POST",
      body: JSON.stringify({
        name: `${TEST_PREFIX}HVAC Unit`,
        price: 2500,
        stockStatus: "in_stock",
        priceVisibility: "public",
        description: "Premium HVAC unit for commercial use",
      }),
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.product.name).toContain("HVAC Unit");
    expect(body.product.provider_company_id).toBe(providerCompanyId);
    productId = body.product.id;
  });

  it("lists own products", async () => {
    const res = await authApi("/provider/products", providerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it("updates own product", async () => {
    const res = await authApi(`/provider/products/${productId}`, providerToken, {
      method: "PUT",
      body: JSON.stringify({ name: `${TEST_PREFIX}HVAC Unit Updated`, price: 3000 }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.product.name).toContain("Updated");
    expect(parseFloat(body.product.price)).toBe(3000);
  });

  it("rejects update on another provider's product", async () => {
    const res = await authApi(`/provider/products/${productId}`, otherProviderToken, {
      method: "PUT",
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles product active status", async () => {
    const res = await authApi(`/provider/products/${productId}/toggle`, providerToken, { method: "PATCH" });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.product.is_active).toBe(false);

    const res2 = await authApi(`/provider/products/${productId}/toggle`, providerToken, { method: "PATCH" });
    expect(res2.status).toBe(200);
    const body2: any = await res2.json();
    expect(body2.product.is_active).toBe(true);
  });

  it("rejects non-provider from creating products", async () => {
    const res = await authApi("/provider/products", nonProviderToken, {
      method: "POST",
      body: JSON.stringify({ name: "Should Fail", price: 100 }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated product creation", async () => {
    const res = await api("/provider/products", {
      method: "POST",
      body: JSON.stringify({ name: "Should Fail", price: 100 }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Provider Services", () => {
  let serviceId: string;

  it("creates a service", async () => {
    const res = await authApi("/provider/services", providerToken, {
      method: "POST",
      body: JSON.stringify({
        name: `${TEST_PREFIX}HVAC Installation Service`,
        serviceType: "installation",
        pricingModel: "fixed",
        startingPrice: 500,
        priceVisibility: "public",
        description: "Full HVAC installation service",
      }),
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.service.name).toContain("HVAC Installation");
    expect(body.service.provider_company_id).toBe(providerCompanyId);
    serviceId = body.service.id;
  });

  it("lists own services", async () => {
    const res = await authApi("/provider/services", providerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it("updates own service", async () => {
    const res = await authApi(`/provider/services/${serviceId}`, providerToken, {
      method: "PUT",
      body: JSON.stringify({ name: `${TEST_PREFIX}HVAC Install Updated`, startingPrice: 600 }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.service.name).toContain("Updated");
    expect(parseFloat(body.service.starting_price)).toBe(600);
  });

  it("rejects update on another provider's service", async () => {
    const res = await authApi(`/provider/services/${serviceId}`, otherProviderToken, {
      method: "PUT",
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res.status).toBe(404);
  });

  it("toggles service active status", async () => {
    const res = await authApi(`/provider/services/${serviceId}/toggle`, providerToken, { method: "PATCH" });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.service.is_active).toBe(false);
  });

  it("rejects non-provider from creating services", async () => {
    const res = await authApi("/provider/services", nonProviderToken, {
      method: "POST",
      body: JSON.stringify({ name: "Should Fail" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("Provider Inventory & Availability", () => {
  let productId: string;
  let serviceId: string;

  beforeAll(async () => {
    const prod: any = await createTestProduct(providerToken);
    productId = prod.product.id;
    const serv: any = await createTestService(providerToken);
    serviceId = serv.service.id;
  });

  it("updates product stock status", async () => {
    const res = await authApi(`/provider/products/${productId}/inventory`, providerToken, {
      method: "PATCH",
      body: JSON.stringify({ stockStatus: "out_of_stock" }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.product.stock_status).toBe("out_of_stock");
  });

  it("updates product minimum order quantity", async () => {
    const res = await authApi(`/provider/products/${productId}/inventory`, providerToken, {
      method: "PATCH",
      body: JSON.stringify({ stockQuantity: 5 }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects inventory update on another provider's product", async () => {
    const res = await authApi(`/provider/products/${productId}/inventory`, otherProviderToken, {
      method: "PATCH",
      body: JSON.stringify({ stockStatus: "out_of_stock" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates service availability status", async () => {
    const res = await authApi(`/provider/services/${serviceId}/availability`, providerToken, {
      method: "PATCH",
      body: JSON.stringify({ availabilityStatus: "unavailable" }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.service.availability_status).toBe("unavailable");
  });

  it("updates service minimum job value", async () => {
    const res = await authApi(`/provider/services/${serviceId}/availability`, providerToken, {
      method: "PATCH",
      body: JSON.stringify({ minimumJobValue: 200 }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects availability update on another provider's service", async () => {
    const res = await authApi(`/provider/services/${serviceId}/availability`, otherProviderToken, {
      method: "PATCH",
      body: JSON.stringify({ availabilityStatus: "unavailable" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("Provider Isolation", () => {
  it("provider A cannot see provider B's products", async () => {
    const prodRes: any = await createTestProduct(providerToken);
    const prodId = prodRes.product.id;

    const listRes = await authApi("/provider/products", otherProviderToken);
    const listBody: any = await listRes.json();
    const found = listBody.products.find((p: any) => p.id === prodId);
    expect(found).toBeUndefined();
  });

  it("provider A cannot edit provider B's product via inventory", async () => {
    const prodRes: any = await createTestProduct(providerToken);
    const prodId = prodRes.product.id;

    const res = await authApi(`/provider/products/${prodId}/inventory`, otherProviderToken, {
      method: "PATCH",
      body: JSON.stringify({ stockStatus: "out_of_stock" }),
    });
    expect(res.status).toBe(404);
  });

  it("provider A cannot toggle provider B's service", async () => {
    const servRes: any = await createTestService(providerToken);
    const servId = servRes.service.id;

    const res = await authApi(`/provider/services/${servId}/toggle`, otherProviderToken, { method: "PATCH" });
    expect(res.status).toBe(404);
  });
});

describe("Error Handling", () => {
  it("returns 400 when creating product without name", async () => {
    const res = await authApi("/provider/products", providerToken, {
      method: "POST",
      body: JSON.stringify({ price: 100 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when creating product without price", async () => {
    const res = await authApi("/provider/products", providerToken, {
      method: "POST",
      body: JSON.stringify({ name: "No Price Product" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when creating service without name", async () => {
    const res = await authApi("/provider/services", providerToken, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

/* ── Provider Role Permissions ── */
describe("Provider Role Permissions", () => {
  it("viewer can list products (read-only)", async () => {
    const res = await authApi("/provider/products", viewerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.products)).toBe(true);
  });

  it("viewer can list services (read-only)", async () => {
    const res = await authApi("/provider/services", viewerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.services)).toBe(true);
  });

  it("viewer cannot create a product", async () => {
    const res = await authApi("/provider/products", viewerToken, {
      method: "POST",
      body: JSON.stringify({ name: "Viewer's product", price: 100 }),
    });
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toContain("Insufficient permissions");
  });

  it("viewer cannot update a product", async () => {
    const prodRes: any = await createTestProduct(providerToken);
    const res = await authApi(`/provider/products/${prodRes.product.id}`, viewerToken, {
      method: "PUT",
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.error).toContain("Insufficient permissions");
  });

  it("viewer cannot toggle a product", async () => {
    const prodRes: any = await createTestProduct(providerToken);
    const res = await authApi(`/provider/products/${prodRes.product.id}/toggle`, viewerToken, { method: "PATCH" });
    expect(res.status).toBe(403);
  });

  it("viewer cannot update inventory", async () => {
    const prodRes: any = await createTestProduct(providerToken);
    const res = await authApi(`/provider/products/${prodRes.product.id}/inventory`, viewerToken, {
      method: "PATCH",
      body: JSON.stringify({ stockStatus: "out_of_stock" }),
    });
    expect(res.status).toBe(403);
  });

  it("viewer cannot create a service", async () => {
    const res = await authApi("/provider/services", viewerToken, {
      method: "POST",
      body: JSON.stringify({ name: "Viewer's service" }),
    });
    expect(res.status).toBe(403);
  });

  it("viewer cannot update a service", async () => {
    const servRes: any = await createTestService(providerToken);
    const res = await authApi(`/provider/services/${servRes.service.id}`, viewerToken, {
      method: "PUT",
      body: JSON.stringify({ name: "Hacked" }),
    });
    expect(res.status).toBe(403);
  });

  it("viewer cannot toggle a service", async () => {
    const servRes: any = await createTestService(providerToken);
    const res = await authApi(`/provider/services/${servRes.service.id}/toggle`, viewerToken, { method: "PATCH" });
    expect(res.status).toBe(403);
  });

  it("viewer cannot update service availability", async () => {
    const servRes: any = await createTestService(providerToken);
    const res = await authApi(`/provider/services/${servRes.service.id}/availability`, viewerToken, {
      method: "PATCH",
      body: JSON.stringify({ availabilityStatus: "unavailable" }),
    });
    expect(res.status).toBe(403);
  });
});
