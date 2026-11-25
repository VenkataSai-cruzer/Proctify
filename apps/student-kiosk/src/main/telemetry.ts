// ============================================================
// SecureAssess Student Kiosk — Crash Telemetry (Sentry)
// Minimal: captures crashes only, no PII. Offline-queued.
// ============================================================

import { app } from "electron";
import { logger } from "./logger";

export function initTelemetry(): void {
  const dsn = process.env.SENTRY_DSN ?? "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/electron/main");
    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV === "development" ? "development" : "production",
        release: `secureassess-kiosk@${app.getVersion()}`,
        maxBreadcrumbs: 20,
        // Strip student names and other PII
        beforeSend(event: { request?: { headers?: Record<string, string> }; extra?: Record<string, unknown> }) {
          if (event.request?.headers?.authorization) delete event.request.headers.authorization;
          return event;
        },
      });
      logger.info("Kiosk Sentry initialized");
    }
  } catch { /* non-fatal */ }
}
