import { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { logger } from "../services/logger";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error("http.unhandled_error", {
    error: err,
    method: req.method,
    path: req.originalUrl.split("?")[0],
  });
  if (Sentry.isInitialized()) {
    Sentry.withScope((scope) => {
      scope.setTag("request_id", req.requestId);
      scope.setContext("http", {
        method: req.method,
        path: req.originalUrl.split("?")[0],
      });
      Sentry.captureException(err);
    });
  }

  if (res.headersSent) return;
  res.status(500).json({
    error: "Internal server error",
    requestId: req.requestId,
  });
}
