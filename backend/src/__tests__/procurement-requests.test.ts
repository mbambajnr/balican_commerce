import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import app from "../app";
import http from "http";
import { query } from "../config/db";
import { createTestUser, createTestCompany, cleanupTestData, generateToken } from "./helpers";

let server: http.Server;
let baseUrl: string;

let buyerCompanyId: string;
let buyerToken: string;
let buyerViewerToken: string;
let providerAId: string;
let providerAToken: string;
let providerBId: string;
let providerBToken: string;
let unverifiedProviderId: string;
let unverifiedProviderToken: string;

const TEST_PREFIX = "PROC-REQ-";

const createCompany = async (name: string, overrides: {
  status?: string; isProvider?: boolean; companyType?: string; verificationStatus?: string;
} = {}) => {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, "")}-${Date.now()}@test.com`;
  const result = await query(
    `INSERT INTO companies (name, email, status, is_provider, company_type, verification_status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, email, overrides.status || "active", overrides.isProvider || false,
     overrides.companyType || "buyer", overrides.verificationStatus || "approved"]
  );
  return result.rows[0].id;
};

const createUserForCompany = async (email: string, password: string, companyId: string, role: string = "company_admin") => {
  const user = await createTestUser({ email, password, companyId, companyRole: role });
  return generateToken(user.id, "customer");
};

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  // Buyer company
  buyerCompanyId = await createCompany(`${TEST_PREFIX}Buyer Co`, { isProvider: false, companyType: "buyer" });
  buyerToken = await createUserForCompany(`${TEST_PREFIX}buyer@test.com`, "Password123!", buyerCompanyId);
  // Buyer viewer
  buyerViewerToken = await createUserForCompany(`${TEST_PREFIX}buyer-viewer@test.com`, "Password123!", buyerCompanyId, "viewer");

  // Provider A (verified)
  providerAId = await createCompany(`${TEST_PREFIX}Provider A`, { isProvider: true, companyType: "supplier" });
  providerAToken = await createUserForCompany(`${TEST_PREFIX}prov-a@test.com`, "Password123!", providerAId);

  // Provider B (verified)
  providerBId = await createCompany(`${TEST_PREFIX}Provider B`, { isProvider: true, companyType: "service_provider" });
  providerBToken = await createUserForCompany(`${TEST_PREFIX}prov-b@test.com`, "Password123!", providerBId);

  // Unverified provider
  unverifiedProviderId = await createCompany(`${TEST_PREFIX}Unverified Prov`, {
    isProvider: true, companyType: "supplier", verificationStatus: "pending"
  });
  unverifiedProviderToken = await createUserForCompany(`${TEST_PREFIX}unverified@test.com`, "Password123!", unverifiedProviderId);
});

afterAll(async () => {
  await cleanupTestData();
  await query("DELETE FROM procurement_requests WHERE title LIKE $1", [`${TEST_PREFIX}%`]).catch(() => {});
  await query("DELETE FROM companies WHERE name LIKE $1", [`${TEST_PREFIX}%`]).catch(() => {});
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

function api(path: string, options?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
}

function authApi(path: string, token: string, options?: RequestInit) {
  return api(path, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  });
}

/* ── Buyer creates a request with items and providers ── */
describe("Create Procurement Request (Buyer)", () => {
  let createdId: string;

  it("creates a procurement request with items and providers", async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}HVAC Supply`,
        description: "Need 5 HVAC units for commercial project",
        requestType: "product_supply",
        deliveryLocation: "Accra",
        preferredTimeline: "Within 2 weeks",
        estimatedBudget: 50000,
        isUrgent: true,
        items: [
          { productName: "Premium HVAC Unit", quantity: 5, unit: "pcs", notes: "5-ton capacity" },
          { productName: "Duct Kit", quantity: 5, unit: "sets", notes: "Compatible with HVAC unit" },
        ],
        providerIds: [providerAId, providerBId],
      }),
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.request.title).toContain("HVAC Supply");
    expect(body.request.status).toBe("draft");
    expect(body.request.items).toHaveLength(2);
    expect(body.request.providers).toHaveLength(2);
    createdId = body.request.id;
  });

  it("returns error when title is missing", async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({ items: [{ productName: "Test" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns error when items are missing", async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({ title: "No items" }),
    });
    expect(res.status).toBe(400);
  });
});

/* ── Buyer lists and views requests ── */
describe("Buyer List & View Requests", () => {
  it("lists own company requests", async () => {
    const res = await authApi("/procurement/requests", buyerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(Array.isArray(body.requests)).toBe(true);
    expect(body.pagination).toBeDefined();
  });

  it("views request detail", async () => {
    const listRes = await authApi("/procurement/requests", buyerToken);
    const listBody: any = await listRes.json();
    if (listBody.requests.length === 0) return; // skip
    const res = await authApi(`/procurement/requests/${listBody.requests[0].id}`, buyerToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.request.items).toBeDefined();
    expect(body.request.providers).toBeDefined();
  });

  it("returns 404 for another company's request", async () => {
    const res = await authApi(`/procurement/requests/non-existent-id`, buyerToken);
    expect(res.status).toBe(404);
  });
});

/* ── Buyer status transitions ── */
describe("Buyer Status Transitions", () => {
  let requestId: string;

  beforeAll(async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Status Test`,
        items: [{ productName: "Test Item", quantity: 1 }],
        providerIds: [providerAId],
      }),
    });
    const body: any = await res.json();
    requestId = body.request.id;
  });

  it("submits a draft request", async () => {
    const res = await authApi(`/procurement/requests/${requestId}/status`, buyerToken, {
      method: "PATCH",
      body: JSON.stringify({ status: "submitted" }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("submitted");
  });

  it("cannot submit an already submitted request", async () => {
    const res = await authApi(`/procurement/requests/${requestId}/status`, buyerToken, {
      method: "PATCH",
      body: JSON.stringify({ status: "submitted" }),
    });
    expect(res.status).toBe(400);
  });

  it("cancels a submitted request", async () => {
    const createRes = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Cancellable`,
        items: [{ productName: "Test", quantity: 1 }],
      }),
    });
    const createBody: any = await createRes.json();

    await authApi(`/procurement/requests/${createBody.request.id}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });

    const res = await authApi(`/procurement/requests/${createBody.request.id}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "cancelled" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any).status).toBe("cancelled");
  });
});

/* ── Buyer update draft ── */
describe("Buyer Update Draft Request", () => {
  let requestId: string;

  beforeAll(async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Updatable`,
        items: [{ productName: "Original Item", quantity: 1 }],
        providerIds: [providerAId],
      }),
    });
    const body: any = await res.json();
    requestId = body.request.id;
  });

  it("updates a draft request", async () => {
    const res = await authApi(`/procurement/requests/${requestId}`, buyerToken, {
      method: "PUT",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Updatable - Updated`,
        items: [{ productName: "Updated Item", quantity: 2 }],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("cannot update a submitted request", async () => {
    const createRes = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Cannot Update`,
        items: [{ productName: "Test", quantity: 1 }],
      }),
    });
    const createBody: any = await createRes.json();

    await authApi(`/procurement/requests/${createBody.request.id}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });

    const res = await authApi(`/procurement/requests/${createBody.request.id}`, buyerToken, {
      method: "PUT",
      body: JSON.stringify({ title: "Should fail" }),
    });
    expect(res.status).toBe(400);
  });
});

/* ── Provider receives requests ── */
describe("Provider Receives Requests", () => {
  let requestId: string;

  beforeAll(async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}For Provider A`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [providerAId],
      }),
    });
    const body: any = await res.json();
    requestId = body.request.id;
    await authApi(`/procurement/requests/${requestId}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });
  });

  it("provider A sees the request sent to them", async () => {
    const res = await authApi("/provider/procurement/requests", providerAToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const found = body.requests.find((r: any) => r.request_id === requestId);
    expect(found).toBeDefined();
    expect(found.title).toContain("For Provider A");
  });

  it("provider B does NOT see request sent only to A", async () => {
    const res = await authApi("/provider/procurement/requests", providerBToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    const found = body.requests.find((r: any) => r.request_id === requestId);
    expect(found).toBeUndefined();
  });

  it("unverified provider does not see any requests", async () => {
    const res = await authApi("/provider/procurement/requests", unverifiedProviderToken);
    expect(res.status).toBe(403);
  });
});

/* ── Provider responds (interested, declined, quote) ── */
describe("Provider Responds", () => {
  let activeRequestId: string;

  beforeAll(async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Respond Test`,
        items: [{ productName: "Test Item", quantity: 1 }],
        providerIds: [providerAId],
      }),
    });
    const body: any = await res.json();
    activeRequestId = body.request.id;
    await authApi(`/procurement/requests/${activeRequestId}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });
  });

  it("marks request as viewed", async () => {
    const res = await authApi(`/provider/procurement/requests/${activeRequestId}/view`, providerAToken, {
      method: "PATCH",
    });
    expect(res.status).toBe(200);
  });

  it("expresses interest", async () => {
    const res = await authApi(`/provider/procurement/requests/${activeRequestId}/respond`, providerAToken, {
      method: "PATCH",
      body: JSON.stringify({ response: "interested", notes: "We can handle this" }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.response.status).toBe("interested");
  });

  it("declines a request", async () => {
    // Create a fresh request for decline test
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Decline Test`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [providerAId],
      }),
    });
    const body: any = await res.json();
    const reqId = body.request.id;
    await authApi(`/procurement/requests/${reqId}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });

    const declineRes = await authApi(`/provider/procurement/requests/${reqId}/respond`, providerAToken, {
      method: "PATCH",
      body: JSON.stringify({ response: "declined", notes: "Cannot fulfill" }),
    });
    expect(declineRes.status).toBe(200);
    expect((await declineRes.json() as any).response.status).toBe("declined");
  });

  it("submits a quote", async () => {
    // Create a fresh request for quote test
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Quote Test`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [providerAId],
      }),
    });
    const body: any = await res.json();
    const reqId = body.request.id;
    await authApi(`/procurement/requests/${reqId}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });

    const quoteRes = await authApi(`/provider/procurement/requests/${reqId}/respond`, providerAToken, {
      method: "PATCH",
      body: JSON.stringify({ response: "quote", quoteAmount: 45000, notes: "Quote valid for 30 days" }),
    });
    expect(quoteRes.status).toBe(200);
    const quoteBody: any = await quoteRes.json();
    expect(quoteBody.response.status).toBe("quoted");
    expect(parseFloat(quoteBody.response.quote_amount)).toBe(45000);
  });
});

/* ── Provider isolation ── */
describe("Provider Isolation", () => {
  it("provider cannot view request not sent to them", async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Only For B`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [providerBId],
      }),
    });
    const createBody: any = await res.json();
    const reqId = createBody.request.id;
    await authApi(`/procurement/requests/${reqId}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });

    // Provider A tries to view Provider B's request
    const viewRes = await authApi(`/provider/procurement/requests/${reqId}`, providerAToken);
    expect(viewRes.status).toBe(404);
  });

  it("provider cannot respond to request not sent to them", async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Only For B v2`,
        items: [{ productName: "Test", quantity: 1 }],
        providerIds: [providerBId],
      }),
    });
    const createBody: any = await res.json();
    const reqId = createBody.request.id;
    await authApi(`/procurement/requests/${reqId}/status`, buyerToken, {
      method: "PATCH", body: JSON.stringify({ status: "submitted" }),
    });

    const respondRes = await authApi(`/provider/procurement/requests/${reqId}/respond`, providerAToken, {
      method: "PATCH",
      body: JSON.stringify({ response: "interested" }),
    });
    expect(respondRes.status).toBe(404);
  });
});

/* ── Unauthenticated / unauthorized ── */
describe("Auth & Authorization", () => {
  it("requires auth for buyer endpoints", async () => {
    const res = await api("/procurement/requests");
    expect(res.status).toBe(401);
  });

  it("requires auth for provider endpoints", async () => {
    const res = await api("/provider/procurement/requests");
    expect(res.status).toBe(401);
  });

  it("non-provider cannot access provider endpoints", async () => {
    const res = await authApi("/provider/procurement/requests", buyerToken);
    expect(res.status).toBe(403);
  });

  it("buyer viewer can list requests", async () => {
    const res = await authApi("/procurement/requests", buyerViewerToken);
    expect(res.status).toBe(200);
  });
});

/* ── Service type requests ── */
describe("Service Type Requests", () => {
  it("creates a service-type request", async () => {
    const res = await authApi("/procurement/requests", buyerToken, {
      method: "POST",
      body: JSON.stringify({
        title: `${TEST_PREFIX}Service Request`,
        description: "Need electrical installation",
        requestType: "service",
        items: [
          { serviceDescription: "Full electrical wiring for office", quantity: 1, unit: "job" },
          { serviceDescription: "Lighting installation", quantity: 10, unit: "points" },
        ],
        providerIds: [providerBId],
      }),
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.request.request_type).toBe("service");
    expect(body.request.items).toHaveLength(2);
  });
});
