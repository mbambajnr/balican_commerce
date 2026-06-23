#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 10000);
const BASE_URL = normalizeBaseUrl(process.env.BASE_URL || "http://localhost:3000");
const API_BASE_URL = normalizeBaseUrl(process.env.API_BASE_URL || BASE_URL);
const STRICT_READY = process.env.SMOKE_STRICT_READY === "true";

const results = [];

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function url(base, path) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function fetchWithTimeout(target, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(target, {
      redirect: "manual",
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const marker = passed ? "PASS" : "FAIL";
  console.log(`[${marker}] ${name}${detail ? ` - ${detail}` : ""}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

function assertStatus(response, expected, label = "status") {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (!expectedList.includes(response.status)) {
    throw new Error(`${label} ${response.status}, expected ${expectedList.join(" or ")}`);
  }
}

function assertHeader(response, header, expectedPattern) {
  const value = response.headers.get(header);
  if (!value) throw new Error(`missing ${header}`);
  if (expectedPattern && !expectedPattern.test(value)) {
    throw new Error(`${header}=${JSON.stringify(value)} did not match ${expectedPattern}`);
  }
  return value;
}

async function expectJsonObject(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`expected JSON response, got ${contentType || "no content-type"}`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("expected JSON object body");
  }
  return body;
}

async function checkPublicPage(path, expectedStatuses = [200]) {
  const response = await fetchWithTimeout(url(BASE_URL, path));
  assertStatus(response, expectedStatuses);
  const contentType = response.headers.get("content-type") || "";
  if (response.status === 200 && !contentType.includes("text/html")) {
    throw new Error(`expected HTML, got ${contentType || "no content-type"}`);
  }
  return `${path} -> ${response.status}`;
}

async function checkPublicApi(path, expectedStatuses = [200]) {
  const response = await fetchWithTimeout(url(API_BASE_URL, path), {
    headers: { accept: "application/json" },
  });
  assertStatus(response, expectedStatuses);
  if (response.status === 200) await expectJsonObject(response);
  return `${path} -> ${response.status}`;
}

async function main() {
  console.log(`Balican launch smoke test`);
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`API_BASE_URL=${API_BASE_URL}`);
  console.log("");

  await check("homepage loads", () => checkPublicPage("/"));
  await check("marketplace page loads", () => checkPublicPage("/marketplace"));
  await check("products page loads", () => checkPublicPage("/products"));
  await check("Scout creation page loads", () => checkPublicPage("/scout/new"));
  await check("provider registration page loads", () => checkPublicPage("/auth/register"));

  await check("security headers on public HTML", async () => {
    const response = await fetchWithTimeout(url(BASE_URL, "/"));
    assertStatus(response, 200);
    assertHeader(response, "content-security-policy", /default-src 'self'/i);
    assertHeader(response, "referrer-policy", /strict-origin-when-cross-origin/i);
    assertHeader(response, "x-content-type-options", /nosniff/i);
    return "CSP, referrer policy, nosniff present";
  });

  await check("Auth.js session route responds securely", async () => {
    const response = await fetchWithTimeout(url(BASE_URL, "/api/auth/session"), {
      headers: { accept: "application/json" },
    });
    assertStatus(response, 200);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`expected JSON response, got ${contentType || "no content-type"}`);
    }
    const body = await response.json();
    if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
      throw new Error("expected a session object or null");
    }
    if (body && ("backendToken" in body || ("user" in body && body.user && "backendToken" in body.user))) {
      throw new Error("session response exposes backendToken");
    }
    return `${body === null ? "unauthenticated session is null" : "session JSON"} and contains no backend credential`;
  });

  await check("browser credential proxy blocks login endpoint", async () => {
    const response = await fetchWithTimeout(url(BASE_URL, "/backend-api/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
      },
      body: JSON.stringify({ email: "smoke@example.com", password: "not-used" }),
    });
    assertStatus(response, 404);
    return "credential exchange endpoint returned 404";
  });

  await check("cross-site state-changing proxy request is rejected", async () => {
    const response = await fetchWithTimeout(url(BASE_URL, "/backend-api/cart/items"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.invalid",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ productId: "smoke", quantity: 1 }),
    });
    assertStatus(response, 403);
    return "cross-site POST returned 403";
  });

  await check("backend liveness endpoint", () => checkPublicApi("/api/health"));

  await check("deep readiness endpoint", async () => {
    const response = await fetchWithTimeout(url(API_BASE_URL, "/api/ready"), {
      headers: { accept: "application/json" },
    });
    if (response.status === 404 && !STRICT_READY) {
      return "not present at this origin; set API_BASE_URL or SMOKE_STRICT_READY=true to require it";
    }
    assertStatus(response, 200);
    const body = await expectJsonObject(response);
    if (body.status !== "ready") {
      throw new Error(`readiness status=${JSON.stringify(body.status)}`);
    }
    return "status=ready";
  });

  await check("marketplace categories API", () => checkPublicApi("/api/marketplace/categories"));
  await check("marketplace products API", () => checkPublicApi("/api/marketplace/products"));
  await check("marketplace services API", () => checkPublicApi("/api/marketplace/services"));

  printManualChecklist();

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    console.error("");
    console.error(`${failures.length} automated smoke check(s) failed.`);
    process.exit(1);
  }

  console.log("");
  console.log(`All ${results.length} automated smoke checks passed.`);
}

function printManualChecklist() {
  console.log("");
  console.log("Manual production checks still required:");
  console.log("- Register or verify a founder-controlled test buyer and supplier account.");
  console.log("- Submit one real sourcing request and confirm the supplier proposal path.");
  console.log("- Run one GH₵10 Paystack live-card transaction and confirm webhook settlement.");
  console.log("- Confirm quotation/invoice email delivery in the recipient inbox.");
  console.log("- Confirm admin approval/rejection flows from the browser.");
  console.log("- Confirm logs/alerts after the live payment and email checks.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
