import { productionConfigErrors } from "../config";

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  JWT_SECRET: "a-secure-production-secret-with-32-chars",
  DATABASE_URL: "postgresql://user:password@db:5432/balican",
  PAYSTACK_SECRET_KEY: "paystack-secret-key",
  PAYMENT_CURRENCY: "GHS",
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM_EMAIL: "procurement@balican.com",
  ALERT_WEBHOOK_URL: "https://alerts.example.com/balican",
  SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
  METRICS_TOKEN: "metrics-token-with-at-least-32-characters",
  FRONTEND_URL: "https://balican.com",
  UPLOAD_STORAGE_DRIVER: "s3",
  S3_BUCKET: "balican-production",
  S3_REGION: "af-south-1",
  PUBLIC_UPLOAD_BASE_URL: "https://media.balican.com",
};

describe("production configuration", () => {
  test("accepts a complete production configuration", () => {
    expect(productionConfigErrors(validProductionEnv)).toEqual([]);
  });

  test("fails closed when critical settings are absent or unsafe", () => {
    const errors = productionConfigErrors({
      NODE_ENV: "production",
      JWT_SECRET: "short",
      FRONTEND_URL: "http://balican.com",
      PUBLIC_UPLOAD_BASE_URL: "not-a-url",
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("JWT_SECRET"),
      expect.stringContaining("DATABASE_URL"),
      expect.stringContaining("PAYSTACK"),
      expect.stringContaining("PAYMENT_CURRENCY"),
      expect.stringContaining("RESEND_API_KEY"),
      expect.stringContaining("RESEND_FROM_EMAIL"),
      expect.stringContaining("ALERT_WEBHOOK_URL"),
      expect.stringContaining("SENTRY_DSN"),
      expect.stringContaining("METRICS_TOKEN"),
      expect.stringContaining("FRONTEND_URL"),
      expect.stringContaining("UPLOAD_STORAGE_DRIVER"),
      expect.stringContaining("PUBLIC_UPLOAD_BASE_URL"),
    ]));
  });

  test("rejects any production payment currency other than GHS", () => {
    const errors = productionConfigErrors({
      ...validProductionEnv,
      PAYMENT_CURRENCY: "USD",
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("PAYMENT_CURRENCY"),
    ]));
  });

  test("requires complete S3 configuration and paired static credentials", () => {
    const errors = productionConfigErrors({
      ...validProductionEnv,
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "access-key-only",
      S3_SECRET_ACCESS_KEY: "",
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("S3_BUCKET"),
      expect.stringContaining("set together"),
    ]));
  });

  test("does not impose production requirements in test or development", () => {
    expect(productionConfigErrors({ NODE_ENV: "test" })).toEqual([]);
    expect(productionConfigErrors({ NODE_ENV: "development" })).toEqual([]);
  });
});
