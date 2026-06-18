import "./instrument";
import app from "./app";
import { assertProductionConfig, config } from "./config";
import { logger } from "./services/logger";

const start = async () => {
  assertProductionConfig();

  app.listen(config.port, () => {
    logger.info("service.started", { port: config.port });
  });
};

start().catch((err) => {
  logger.error("service.startup_failed", { error: err });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  void import("@sentry/node").then((Sentry) => Sentry.captureException(reason));
  logger.error("process.unhandled_rejection", { error: reason });
});

process.on("uncaughtException", (err) => {
  void import("@sentry/node").then((Sentry) => Sentry.captureException(err));
  logger.error("process.uncaught_exception", { error: err });
  process.exit(1);
});
