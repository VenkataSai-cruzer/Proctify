// ============================================================
// SecureAssess Student Kiosk — Global crash guard
// Every unhandled error lands in userData/logs/main.log before the
// process dies, so a packaged kiosk failure can be diagnosed on site.
// ============================================================

import { app, dialog } from "electron";
import { getLogFilePath, logger } from "./logger";

let installed = false;

function describe(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function reportFatal(kind: string, reason: unknown): void {
  logger.error(`${kind} — exiting`, reason);

  const summary = describe(reason);
  try {
    if (app.isReady()) {
      dialog.showErrorBox(
        "Proctify Student Kiosk encountered an error",
        `${summary}\n\nDetails were written to:\n${getLogFilePath()}`
      );
    }
  } catch {
    /* dialog may be unavailable during early startup */
  }

  app.exit(1);
}

/** Idempotent — safe to call before app.whenReady(). */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  process.on("uncaughtException", (err) => reportFatal("uncaughtException", err));

  // Logged but not fatal: an exam in progress must not be killed by a
  // single rejected promise.
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", reason);
  });

  app.on("render-process-gone", (_event, _contents, details) => {
    logger.error("render-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  app.on("child-process-gone", (_event, details) => {
    logger.error("child-process-gone", {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
}
