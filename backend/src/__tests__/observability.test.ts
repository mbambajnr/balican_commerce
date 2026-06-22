import express from "express";
import request from "supertest";
import application from "../app";
import { errorHandler } from "../middleware/errorHandler";
import { observability } from "../middleware/observability";
import { emitCriticalAlert, resetAlertCooldownsForTests } from "../services/alerts";
import { formatLog } from "../services/logger";
import { config } from "../config";
import { mkdtemp, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  recordEmailDeliveryOutcome,
  recordPaymentWebhookOutcome,
  refreshBackupMetrics,
  renderMetrics,
} from "../services/metrics";

describe("observability", () => {
  test("propagates a valid request ID", async () => {
    const app = express();
    app.use(observability);
    app.get("/ok", (req, res) => res.json({ requestId: req.requestId }));

    const response = await request(app)
      .get("/ok")
      .set("X-Request-ID", "client-request-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("client-request-123");
    expect(response.body.requestId).toBe("client-request-123");
  });

  test("replaces unsafe request IDs", async () => {
    const app = express();
    app.use(observability);
    app.get("/ok", (req, res) => res.json({ requestId: req.requestId }));

    const response = await request(app)
      .get("/ok")
      .set("X-Request-ID", "unsafe request id");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("redacts secrets from structured metadata", () => {
    const log = formatLog("info", "test.redaction", {
      authorization: "Bearer secret",
      nested: {
        password: "password",
        accessToken: "token",
        safe: "visible",
      },
    }) as any;

    expect(log.authorization).toBe("[REDACTED]");
    expect(log.nested.password).toBe("[REDACTED]");
    expect(log.nested.accessToken).toBe("[REDACTED]");
    expect(log.nested.safe).toBe("visible");
  });

  test("returns the request ID from the central error handler", async () => {
    const app = express();
    app.use(observability);
    app.get("/fail", () => {
      throw new Error("test failure");
    });
    app.use(errorHandler);

    const response = await request(app)
      .get("/fail")
      .set("X-Request-ID", "failed-request-123");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: "Internal server error",
      requestId: "failed-request-123",
    });
  });

  test("deduplicates repeated critical alerts during the cooldown", () => {
    resetAlertCooldownsForTests();
    process.env.ENABLE_TEST_LOGS = "true";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(emitCriticalAlert("test.alert")).toBe(true);
    expect(emitCriticalAlert("test.alert")).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
    delete process.env.ENABLE_TEST_LOGS;
  });

  test("exports Prometheus metrics and protects them when a token is configured", async () => {
    const previousToken = config.metricsToken;
    config.metricsToken = "test-metrics-token";

    const denied = await request(application).get("/internal/metrics");
    expect(denied.status).toBe(401);

    const response = await request(application)
      .get("/internal/metrics")
      .set("Authorization", "Bearer test-metrics-token");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("balican_http_requests_total");
    expect(response.text).toContain("balican_process_cpu");

    config.metricsToken = previousToken;
  });

  test("exports payment, email, and backup SLO metrics", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "balican-slo-"));
    const marker = path.join(directory, ".last-success");
    await writeFile(marker, "ok\n");

    recordPaymentWebhookOutcome("success");
    recordEmailDeliveryOutcome("sent");
    await refreshBackupMetrics(marker);
    const output = await renderMetrics();

    expect(output).toContain('balican_payment_webhook_events_total{outcome="success"}');
    expect(output).toContain('balican_email_deliveries_total{outcome="sent"}');
    expect(output).toContain("balican_backup_age_seconds");

    await rm(directory, { recursive: true, force: true });
  });

  test("rate-limits stale backup alerts", async () => {
    resetAlertCooldownsForTests();
    process.env.ENABLE_TEST_LOGS = "true";
    const directory = await mkdtemp(path.join(tmpdir(), "balican-stale-backup-"));
    const marker = path.join(directory, ".last-success");
    await writeFile(marker, "old\n");
    const oldDate = new Date(Date.now() - 27 * 60 * 60 * 1000);
    await utimes(marker, oldDate, oldDate);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await refreshBackupMetrics(marker);
    await refreshBackupMetrics(marker);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
    delete process.env.ENABLE_TEST_LOGS;
    await rm(directory, { recursive: true, force: true });
  });
});
