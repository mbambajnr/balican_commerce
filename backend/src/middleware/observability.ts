import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { logger, withRequestContext } from "../services/logger";

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

export function observability(req: Request, res: Response, next: NextFunction) {
  const suppliedRequestId = req.get("x-request-id");
  const requestId = suppliedRequestId && VALID_REQUEST_ID.test(suppliedRequestId)
    ? suppliedRequestId
    : randomUUID();
  const startedAt = process.hrtime.bigint();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  withRequestContext(requestId, () => {
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const metadata = {
        method: req.method,
        path: req.originalUrl.split("?")[0],
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        contentLength: Number(res.getHeader("content-length") || 0),
        userId: (req as any).userId || undefined,
        companyId: (req as any).companyId || undefined,
      };

      if (res.statusCode >= 500) logger.error("http.request_completed", metadata);
      else if (res.statusCode >= 400) logger.warn("http.request_completed", metadata);
      else logger.info("http.request_completed", metadata);
    });
    next();
  });
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}
