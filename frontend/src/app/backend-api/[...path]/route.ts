import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:4000/api";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CREDENTIAL_ENDPOINTS = new Set(["auth/login", "auth/admin-login"]);

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const backendPath = path.join("/");

  // Credential exchange belongs exclusively to the server-side Auth.js provider.
  if (CREDENTIAL_ENDPOINTS.has(backendPath)) {
    return NextResponse.json({ error: "Use the application sign-in flow" }, { status: 404 });
  }

  if (STATE_CHANGING_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    const fetchSite = req.headers.get("sec-fetch-site");
    if ((origin && origin !== req.nextUrl.origin) || fetchSite === "cross-site") {
      return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
    }
  }

  const authToken = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });
  const backendToken = typeof authToken?.backendToken === "string"
    ? authToken.backendToken
    : null;

  const target = new URL(`${BACKEND_API_URL}/${backendPath}`);
  req.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const headers = new Headers();
  for (const name of ["accept", "content-type", "idempotency-key"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (backendToken) headers.set("authorization", `Bearer ${backendToken}`);

  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : Buffer.from(await req.arrayBuffer());

  const backendResponse = await fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "content-length", "location"]) {
    const value = backendResponse.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("cache-control", "no-store");

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const runtime = "nodejs";
