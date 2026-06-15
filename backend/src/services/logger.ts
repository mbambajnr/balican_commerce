import { AsyncLocalStorage } from "async_hooks";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogMetadata = Record<string, unknown>;

interface RequestContext {
  requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();
const SENSITIVE_KEYS = /authorization|cookie|password|secret|token|api[-_]?key|signature/i;

function sanitize(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEYS.test(key)) return "[REDACTED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitize(childValue, childKey, seen),
      ])
    );
  }
  return value;
}

export function formatLog(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "balican-api",
    environment: process.env.NODE_ENV || "development",
    ...(requestContext.getStore()?.requestId
      ? { requestId: requestContext.getStore()!.requestId }
      : {}),
    ...sanitize(metadata) as LogMetadata,
  };
}

function write(level: LogLevel, event: string, metadata?: LogMetadata) {
  if (process.env.NODE_ENV === "test" && process.env.ENABLE_TEST_LOGS !== "true") {
    return;
  }
  const line = JSON.stringify(formatLog(level, event, metadata));
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (event: string, metadata?: LogMetadata) => write("debug", event, metadata),
  info: (event: string, metadata?: LogMetadata) => write("info", event, metadata),
  warn: (event: string, metadata?: LogMetadata) => write("warn", event, metadata),
  error: (event: string, metadata?: LogMetadata) => write("error", event, metadata),
};

export function withRequestContext<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn);
}

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
