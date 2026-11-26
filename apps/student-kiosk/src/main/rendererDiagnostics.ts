// ============================================================
// SecureAssess Student Kiosk — Renderer diagnostics
//
// Every renderer failure is written to main.log and collected so the
// packaged smoke test can assert a clean render.
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

function severityName(level: number): string {
  return ["verbose", "info", "warning", "error"][level] ?? `level-${level}`;
}

export function attachRendererDiagnostics(
  win: BrowserWindow,
  label = "kiosk"
): RendererDiagnostics {
  const issues: RendererIssue[] = [];

  const record = (kind: RendererIssueKind, message: string): void => {
    issues.push({ kind, message });
    logger.error(`renderer ${kind} (${label})`, { message });
  };

  const contents = win.webContents;

  contents.on("console-message", (_event, level: number, message: string, line: number, sourceId: string) => {
    if (level >= 2) {
      const detail = `${severityName(level)}: ${message} (${sourceId}:${line})`;
      logger.warn(`renderer console (${label})`, { detail });
      if (level >= 3) issues.push({ kind: "console", message: detail });
    }
  });

  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (errorCode === -3) return; // ERR_ABORTED on replaced navigations
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
