import dotenv from "dotenv";
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || "development";

function validateProductionConfig() {
  if (NODE_ENV !== "production") return;

  const issues: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-change-in-prod") {
    issues.push("JWT_SECRET must be set to a strong, non-default value in production");
  }
  if (!process.env.DATABASE_URL) {
    issues.push("DATABASE_URL must be set in production");
  }
  if (!process.env.ADMIN_SECRET_KEY) {
    issues.push("ADMIN_SECRET_KEY should be set in production (admin registration will be disabled)");
  }
  if (!process.env.PAYSTACK_SECRET_KEY && !process.env.PAYSTACK_WEBHOOK_SECRET) {
    issues.push("PAYSTACK_SECRET_KEY or PAYSTACK_WEBHOOK_SECRET must be set in production (webhook will reject all requests without it)");
  }
  if (!process.env.PAYSTACK_PUBLIC_KEY) {
    issues.push("PAYSTACK_PUBLIC_KEY should be set in production (frontend payment button will not work)");
  }
  if (!process.env.FRONTEND_URL) {
    issues.push("FRONTEND_URL must be set in production for CORS");
  }
  if (issues.length > 0) {
    console.warn("⚠️  Production configuration warnings:");
    issues.forEach((msg) => console.warn(`  • ${msg}`));
  }
}

validateProductionConfig();

export const config = {
  port: parseInt(process.env.PORT || "4000"),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-prod",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  nodeEnv: NODE_ENV,
  database: {
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://sslplan:sslplan_dev@localhost:5432/sslplan",
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  },
  resendApiKey: process.env.RESEND_API_KEY || "",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  },
  adminSecretKey: process.env.ADMIN_SECRET_KEY || "",
  upload: {
    driver: process.env.UPLOAD_STORAGE_DRIVER || "local",
    dir: process.env.UPLOAD_DIR || "uploads",
    publicBaseUrl: process.env.PUBLIC_UPLOAD_BASE_URL || "http://localhost:4000/uploads",
    maxImageSize: parseInt(process.env.UPLOAD_MAX_IMAGE_SIZE || "5242880"), // 5MB
  },
};
