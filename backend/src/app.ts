import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { securityHeaders, apiLimiter } from "./middleware/security";
import { observability } from "./middleware/observability";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import rfqRoutes from "./routes/rfqs";
import orderRoutes from "./routes/orders";
import bookingRoutes from "./routes/bookings";
import adminRoutes from "./routes/admin";
import crmRoutes from "./routes/crm";
import analyticsRoutes from "./routes/analytics";
import quotationRoutes from "./routes/quotations";
import paymentRoutes from "./routes/payments";
import b2bRoutes from "./routes/b2b";
import productMediaRoutes from "./routes/product-media";
import merchantFeedRoutes from "./routes/merchant-feed";
import companyVettingRoutes from "./routes/company-vetting";
import marketplaceRoutes from "./routes/marketplace";
import providerDashboardRoutes from "./routes/provider-dashboard";
import procurementRoutes from "./routes/procurement";
import scoutRoutes from "./routes/scout";
import providerOpportunitiesRoutes from "./routes/provider-opportunities";
import agreementsRoutes from "./routes/agreements";
import providerVerificationRoutes from "./routes/provider-verification";
import superAdminRoutes from "./routes/super-admin";
import accountStatusRoutes from "./routes/account-status";
import { providerOfferingsRoutes } from "./routes/provider-offerings";
import { checkReadiness } from "./services/readiness";
import { emitCriticalAlert } from "./services/alerts";
import { withRequestContext } from "./services/logger";
import {
  metricsAuthorized,
  metricsContentType,
  metricsMiddleware,
  renderMetrics,
  setReadinessMetrics,
} from "./services/metrics";

const app = express();

app.use(observability);
app.use(metricsMiddleware);
app.use(securityHeaders);
const allowedOrigins = [config.frontendUrl, "http://localhost:3000"];
const isProduction = config.nodeEnv === "production";

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (curl, server-to-server) with no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In development, allow any localhost/127.0.0.1 port so the frontend works
    // even when it falls back to an alternate dev port (e.g. 3001).
    if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposedHeaders: ["X-Request-ID"],
}));

// Capture raw body for Paystack webhook HMAC verification.
// Sets req._body = true so express.json() below skips re-parsing this route.
app.use((req, _res, next) => {
  if (req.path === "/api/orders/paystack-webhook") {
    let raw = "";
    req.on("data", (chunk: Buffer) => { raw += chunk.toString("utf8"); });
    req.on("end", () => {
      (req as any).rawBody = raw;
      try { req.body = JSON.parse(raw); } catch { req.body = {}; }
      (req as any)._body = true;
      withRequestContext(req.requestId, next);
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: "10mb" }));
app.use("/api", apiLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/products/merchant-feed", merchantFeedRoutes);
app.use("/api/products", productRoutes);
app.use("/api/rfqs", rfqRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api", quotationRoutes);
app.use("/api", paymentRoutes);
app.use("/api", b2bRoutes);
app.use("/api", productMediaRoutes);
app.use("/api/company/vetting", companyVettingRoutes);
app.use("/api", marketplaceRoutes);
app.use("/api", providerDashboardRoutes);
app.use("/api", procurementRoutes);
app.use("/api", scoutRoutes);
app.use("/api", providerOpportunitiesRoutes);
app.use("/api", agreementsRoutes);
app.use("/api/provider", providerVerificationRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api", accountStatusRoutes);
app.use("/api", providerOfferingsRoutes);

const uploadsDir = path.resolve(config.upload.dir);
app.use("/uploads/products", express.static(path.join(uploadsDir, "products")));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/ready", async (_req, res) => {
  const readiness = await checkReadiness();
  setReadinessMetrics(readiness.checks);
  if (!readiness.ready) {
    emitCriticalAlert("service.readiness_failed", { checks: readiness.checks });
  }
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? "ready" : "not_ready",
    checks: readiness.checks,
    timestamp: new Date().toISOString(),
  });
});

app.get("/internal/metrics", async (req, res) => {
  if (!metricsAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.setHeader("Content-Type", metricsContentType);
  res.send(await renderMetrics());
});

app.use(errorHandler);

export default app;
