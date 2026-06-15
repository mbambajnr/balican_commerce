import { NextFunction, Request, Response } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register,
} from "prom-client";
import { config } from "../config";

if (!register.getSingleMetric("process_cpu_user_seconds_total")) {
  collectDefaultMetrics({ prefix: "balican_" });
}

const httpRequests = metric("balican_http_requests_total", () => new Counter({
  name: "balican_http_requests_total",
  help: "Completed HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
}));

const httpDuration = metric("balican_http_request_duration_seconds", () => new Histogram({
  name: "balican_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
}));

const readiness = metric("balican_readiness_check", () => new Gauge({
  name: "balican_readiness_check",
  help: "Readiness check state where 1 is healthy",
  labelNames: ["check"] as const,
}));

function metric<T>(name: string, create: () => T): T {
  return (register.getSingleMetric(name) as T | undefined) || create();
}

function routeLabel(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl || ""}${routePath}` || "/";
  }
  return "unmatched";
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode),
    };
    httpRequests.inc(labels);
    httpDuration.observe(
      labels,
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
    );
  });
  next();
}

export function setReadinessMetrics(checks: Record<string, "ok" | "error">): void {
  for (const [check, status] of Object.entries(checks)) {
    readiness.set({ check }, status === "ok" ? 1 : 0);
  }
}

export function metricsAuthorized(req: Request): boolean {
  if (!config.metricsToken) return config.nodeEnv !== "production";
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer === config.metricsToken || req.get("x-metrics-token") === config.metricsToken;
}

export async function renderMetrics(): Promise<string> {
  return register.metrics();
}

export const metricsContentType = register.contentType;
