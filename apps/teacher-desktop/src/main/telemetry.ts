// ============================================================
// SecureAssess Teacher Desktop — Crash Telemetry (Sentry)
// ============================================================
// Uses @sentry/electron with offline queueing — crashes are
// buffered locally when the lab LAN is air-gapped and flushed
// on the next online session. Sentry DSN is optional; if not
// configured, crash data is still written to a local crash log
// and included in the Diagnostics ZIP.
// ============================================================

import { app } from "electron";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

let _initialized = false;

export function initTelemetry(): void {
  if (_initialized) return;
  _initialized = true;

  const dsn = process.env.SENTRY_DSN ?? "";

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/electron/main");

    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV === "development" ? "development" : "production",
        release: `secureassess-teacher@${app.getVersion()}`,
        // Offline buffering — Sentry SDK handles this natively
        maxBreadcrumbs: 50,
        beforeSend(event: any) {
          // Scrub sensitive data before sending
          if (event.request?.headers?.authorization) {
            delete event.request.headers.authorization;
          }
          return event;
        },
      });
      logger.info("Sentry telemetry initialized", { dsn: dsn.slice(0, 20) + "..." });
    } else {
      logger.info("Sentry DSN not configured — local crash logging only");
    }
  } catch (err) {
    logger.warn("Sentry init failed (non-fatal)", { error: (err as Error).message });
  }

  // ── Local crash log fallback ──────────────────────────────
  // Electron writes crash dumps to userData/Crashpad/
  // We also capture unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { reason: String(reason) });
  });
}

/** Capture a manual error report. */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/electron/main");
    if (context) Sentry.setContext("extra", context);
    Sentry.captureException(error);
  } catch { /* non-fatal */ }
  logger.error("Captured error", { message: error.message, ...context });
}
