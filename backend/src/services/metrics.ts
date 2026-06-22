import { NextFunction, Request, Response } from "express";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register,
} from "prom-client";
import { stat } from "fs/promises";
import { config } from "../config";
import { emitCriticalAlert } from "./alerts";

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

const paymentWebhookEvents = metric("balican_payment_webhook_events_total", () => new Counter({
  name: "balican_payment_webhook_events_total",
  help: "Paystack webhook outcomes",
  labelNames: ["outcome"] as const,
}));

const emailDeliveries = metric("balican_email_deliveries_total", () => new Counter({
  name: "balican_email_deliveries_total",
  help: "Transactional email delivery attempts by outcome",
  labelNames: ["outcome"] as const,
}));

const backupAge = metric("balican_backup_age_seconds", () => new Gauge({
  name: "balican_backup_age_seconds",
  help: "Age of the latest successful database backup in seconds; -1 means no marker is available",
}));

const BACKUP_MAX_AGE_SECONDS = 26 * 60 * 60;
const LATENCY_ALERT_COOLDOWN_MS = 5 * 60_000;

const latencyTargets: Array<{
  method: string;
  route: string;
  maxSeconds: number;
  operation: string;
}> = [
  { method: "GET", route: "/api/products", maxSeconds: 1, operation: "product_search" },
  { method: "POST", route: "/api/orders", maxSeconds: 2, operation: "order_creation" },
  { method: "POST", route: "/api/orders/paystack-webhook", maxSeconds: 1, operation: "payment_webhook" },
];

function metric<T>(name: string, create: () => T): T {
  return (register.getSingleMetric(name) as T | undefined) || create();
}

function routeLabel(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    const route = `${req.baseUrl || ""}${routePath}` || "/";
    return route.length > 1 ? route.replace(/\/+$/, "") : route;
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
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    httpRequests.inc(labels);
    httpDuration.observe(labels, durationSeconds);

    if (config.nodeEnv === "production") {
      const target = latencyTargets.find(({ method, route }) => (
        method === req.method && route === labels.route
      ));
      if (target && durationSeconds > target.maxSeconds) {
        emitCriticalAlert("slo.latency_exceeded", {
          operation: target.operation,
          route: labels.route,
          durationSeconds: Number(durationSeconds.toFixed(3)),
          targetSeconds: target.maxSeconds,
          statusCode: res.statusCode,
        }, LATENCY_ALERT_COOLDOWN_MS);
      }
    }
  });
  next();
}

export function setReadinessMetrics(checks: Record<string, "ok" | "error">): void {
  for (const [check, status] of Object.entries(checks)) {
    readiness.set({ check }, status === "ok" ? 1 : 0);
  }
}

export type PaymentWebhookOutcome =
  | "success"
  | "duplicate"
  | "mismatch"
  | "unknown_reference"
  | "invalid_request"
  | "invalid_signature"
  | "ignored"
  | "error";

export function recordPaymentWebhookOutcome(outcome: PaymentWebhookOutcome): void {
  paymentWebhookEvents.inc({ outcome });
}

export type EmailDeliveryOutcome = "sent" | "failed" | "unavailable";

export function recordEmailDeliveryOutcome(outcome: EmailDeliveryOutcome): void {
  emailDeliveries.inc({ outcome });
}

export async function refreshBackupMetrics(
  statusFile = config.backupStatusFile,
  nowMs = Date.now(),
): Promise<number> {
  try {
    const status = await stat(statusFile);
    const ageSeconds = Math.max(0, (nowMs - status.mtimeMs) / 1000);
    backupAge.set(ageSeconds);
    if (ageSeconds > BACKUP_MAX_AGE_SECONDS) {
      emitCriticalAlert("backup.stale", {
        statusFile,
        ageSeconds: Math.round(ageSeconds),
        maxAgeSeconds: BACKUP_MAX_AGE_SECONDS,
      }, 60 * 60_000);
    }
    return ageSeconds;
  } catch {
    backupAge.set(-1);
    if (config.nodeEnv === "production") {
      emitCriticalAlert("backup.missing", {
        statusFile,
        maxAgeSeconds: BACKUP_MAX_AGE_SECONDS,
      }, 60 * 60_000);
    }
    return -1;
  }
}

export function metricsAuthorized(req: Request): boolean {
  if (!config.metricsToken) return config.nodeEnv !== "production";
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  return bearer === config.metricsToken || req.get("x-metrics-token") === config.metricsToken;
}

export async function renderMetrics(): Promise<string> {
  await refreshBackupMetrics();
  return register.metrics();
}

export const metricsContentType = register.contentType;
