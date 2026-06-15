import { logger } from "./logger";
import { config } from "../config";

const lastAlertAt = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 60_000;

export function emitCriticalAlert(
  event: string,
  metadata: Record<string, unknown> = {},
  cooldownMs = DEFAULT_COOLDOWN_MS
): boolean {
  const now = Date.now();
  const previous = lastAlertAt.get(event) || 0;
  if (now - previous < cooldownMs) return false;

  lastAlertAt.set(event, now);
  const payload = { alert: true, severity: "critical", ...metadata };
  logger.error(event, payload);
  void deliverAlert(event, payload);
  return true;
}

async function deliverAlert(event: string, metadata: Record<string, unknown>) {
  if (!config.alertWebhookUrl) return;

  try {
    const response = await fetch(config.alertWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        service: "balican-api",
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        ...metadata,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      logger.error("alert.delivery_failed", { event, statusCode: response.status });
    }
  } catch (error) {
    logger.error("alert.delivery_failed", { event, error });
  }
}

export function resetAlertCooldownsForTests() {
  lastAlertAt.clear();
}
