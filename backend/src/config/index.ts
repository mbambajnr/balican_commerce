import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

export function productionConfigErrors(env: NodeJS.ProcessEnv): string[] {
  if ((env.NODE_ENV || "development") !== "production") return [];

  const errors: string[] = [];
  const jwtSecret = env.JWT_SECRET || "";
  if (jwtSecret.length < 32 || jwtSecret === "dev-secret-change-in-prod") {
    errors.push("JWT_SECRET must be a unique secret of at least 32 characters");
  }
  if (!env.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL)) {
    errors.push("DATABASE_URL must be a PostgreSQL connection string");
  }
  if (!env.PAYSTACK_SECRET_KEY) {
    errors.push("PAYSTACK_SECRET_KEY is required for payment initialization and webhook verification");
  }
  if (env.PAYMENT_CURRENCY !== "GHS") {
    errors.push("PAYMENT_CURRENCY must be explicitly set to GHS");
  }
  if (!env.RESEND_API_KEY) {
    errors.push("RESEND_API_KEY is required for transactional procurement documents");
  }
  if (!env.RESEND_FROM_EMAIL) {
    errors.push("RESEND_FROM_EMAIL is required for transactional email");
  }
  if (!isSecurePublicUrl(env.ALERT_WEBHOOK_URL)) {
    errors.push("ALERT_WEBHOOK_URL must be an absolute HTTPS URL");
  }
  if (!isSecurePublicUrl(env.FRONTEND_URL)) {
    errors.push("FRONTEND_URL must be an absolute HTTPS URL");
  }
  const storageDriver = env.UPLOAD_STORAGE_DRIVER || "local";
  if (!["local", "s3"].includes(storageDriver)) {
    errors.push("UPLOAD_STORAGE_DRIVER must be local or s3");
  }
  if (storageDriver !== "s3") {
    errors.push("UPLOAD_STORAGE_DRIVER must be s3 in production");
  }
  if (storageDriver === "local" && !env.UPLOAD_DIR) {
    errors.push("UPLOAD_DIR is required for local storage");
  }
  if (storageDriver === "s3") {
    if (!env.S3_BUCKET) errors.push("S3_BUCKET is required for s3 storage");
    if (!env.S3_REGION) errors.push("S3_REGION is required for s3 storage");
    if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
      errors.push("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together");
    }
  }
  if (!isSecurePublicUrl(env.PUBLIC_UPLOAD_BASE_URL)) {
    errors.push("PUBLIC_UPLOAD_BASE_URL must be an absolute HTTPS URL");
  }
  if (!env.SENTRY_DSN || !isSecurePublicUrl(env.SENTRY_DSN)) {
    errors.push("SENTRY_DSN must be an absolute HTTPS URL");
  }
  if (!env.METRICS_TOKEN || env.METRICS_TOKEN.length < 32) {
    errors.push("METRICS_TOKEN must be at least 32 characters");
  }
  return errors;
}

function isSecurePublicUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const errors = productionConfigErrors(env);
  if (errors.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${errors.join("\n- ")}`);
  }
}

export const config = {
  port: parseInt(process.env.PORT || "4000"),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-prod",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  nodeEnv: NODE_ENV,
  database: {
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://sslplan:sslplan_dev@localhost:5432/sslplan",
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || "",
    currency: process.env.PAYMENT_CURRENCY || "GHS",
  },
  resendApiKey: process.env.RESEND_API_KEY || "",
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || "",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  adminSecretKey: process.env.ADMIN_SECRET_KEY || "",
  upload: {
    driver: process.env.UPLOAD_STORAGE_DRIVER || "local",
    dir: process.env.UPLOAD_DIR || "uploads",
    publicBaseUrl: process.env.PUBLIC_UPLOAD_BASE_URL || "http://localhost:4000/uploads",
    maxImageSize: parseInt(process.env.UPLOAD_MAX_IMAGE_SIZE || "5242880"), // 5MB
    signedUrlExpiresSeconds: parseInt(process.env.S3_SIGNED_URL_EXPIRES_SECONDS || "60"),
    s3: {
      bucket: process.env.S3_BUCKET || "",
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || "",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  },
  sentryDsn: process.env.SENTRY_DSN || "",
  release: process.env.APP_RELEASE || process.env.GIT_SHA || "development",
  metricsToken: process.env.METRICS_TOKEN || "",
  backupStatusFile: process.env.BACKUP_STATUS_FILE || "backups/.last-success",
};
