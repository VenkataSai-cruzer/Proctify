// ============================================================
// SecureAssess Teacher Desktop — Renderer diagnostics
//
// Everything the renderer fails at must land in main.log: a blank window in
// a packaged build is otherwise undebuggable. Also collects issues so the
// packaged smoke test can assert a *clean* render.
// ============================================================

import type { BrowserWindow } from "electron";
import { logger } from "./logger";

export type RendererIssueKind = "console" | "preload" | "load" | "crash" | "unresponsive";

export interface RendererIssue {
  kind: RendererIssueKind;
  message: string;
}

export interface RendererDiagnostics {
  issues: RendererIssue[];
  clear: () => void;
}

/** Chromium console-message severities: 0 verbose, 1 info, 2 warning, 3 error. */
function severityName(level: number): string {
  return ["verbose", "info", "warning", "error"][level] ?? `level-${level}`;
}

export function attachRendererDiagnostics(
  win: BrowserWindow,
  label = "main"
): RendererDiagnostics {
  const issues: RendererIssue[] = [];

  const record = (kind: RendererIssueKind, message: string): void => {
    issues.push({ kind, message });
    logger.error(`renderer ${kind} (${label})`, { message });
  };

  const contents = win.webContents;

  // `console-message` fires for every renderer console call, including
  // uncaught errors and failed resource loads.
  contents.on("console-message", (_event, level: number, message: string, line: number, sourceId: string) => {
    if (level >= 2) {
      const detail = `${severityName(level)}: ${message} (${sourceId}:${line})`;
      logger.warn(`renderer console (${label})`, { detail });
      if (level >= 3) issues.push({ kind: "console", message: detail });
    }
  });

  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // -3 (ERR_ABORTED) is emitted for normal navigations that get replaced.
    if (errorCode === -3) return;
    record(
      "load",
      `did-fail-load ${errorCode} ${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`
    );
  });

  contents.on("did-finish-load", () => {
    logger.info(`renderer loaded (${label})`, { url: contents.getURL() });
  });

  contents.on("preload-error", (_event, preloadPath, error) => {
    record("preload", `${preloadPath}: ${error?.message ?? String(error)}`);
  });

  contents.on("render-process-gone", (_event, details) => {
    record("crash", `render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  contents.on("unresponsive", () => {
    record("unresponsive", "renderer became unresponsive");
  });

  return { issues, clear: () => { issues.length = 0; } };
}
